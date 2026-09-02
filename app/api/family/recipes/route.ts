import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import {
  addRecipe,
  deleteRecipe,
  listRecipes,
  updateRecipe,
  type RecipeInput,
} from "@/lib/recipe-store";
import { MAX_RECIPES } from "@/lib/recipes";

export const dynamic = "force-dynamic";

/**
 * Aile tarif defteri — ağaç başına ayrı koleksiyon.
 *
 *  GET    → tarifler (görüntüleyen de okuyabilir)
 *  POST   → yeni tarif        (düzenleyici)
 *  PUT    → tarifi güncelle   (düzenleyici)
 *  DELETE → tarifi sil        (düzenleyici)
 */

async function guard(edit: boolean) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  if (edit && !canEdit(ctx.role))
    return {
      error: NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 }),
    };
  return { treeId: ctx.treeId };
}

async function body(req: NextRequest): Promise<RecipeInput & { id?: string }> {
  try {
    return (await req.json()) as RecipeInput & { id?: string };
  } catch {
    return {};
  }
}

export async function GET() {
  const g = await guard(false);
  if ("error" in g) return g.error;
  return NextResponse.json({ recipes: await listRecipes(g.treeId) });
}

export async function POST(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  const recipe = await addRecipe(g.treeId, input);
  if (!recipe) {
    // İki ret sebebi var; kullanıcı hangisi olduğunu bilmeli.
    const list = await listRecipes(g.treeId);
    return NextResponse.json(
      {
        error:
          list.length >= MAX_RECIPES
            ? `Tarif defteri dolu (en fazla ${MAX_RECIPES}).`
            : "Tarifin bir adı olmalı.",
      },
      { status: 400 }
    );
  }
  return NextResponse.json({ recipes: await listRecipes(g.treeId), recipe });
}

export async function PUT(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const recipe = await updateRecipe(g.treeId, input.id, input);
  if (!recipe) return NextResponse.json({ error: "Tarif bulunamadı ya da adı boş." }, { status: 404 });
  return NextResponse.json({ recipes: await listRecipes(g.treeId), recipe });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const silindi = await deleteRecipe(g.treeId, input.id);
  if (!silindi) return NextResponse.json({ error: "Tarif bulunamadı" }, { status: 404 });
  return NextResponse.json({ recipes: await listRecipes(g.treeId) });
}
