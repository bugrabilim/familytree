import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit, canPropose } from "@/lib/roles";
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
 *  POST   → yeni tarif        (katkı verici)
 *  PUT    → tarifi güncelle   (düzenleyici)
 *  DELETE → tarifi sil        (düzenleyici)
 */

/**
 * ÜÇ SEVİYE (madde 35) — eskiden `edit: boolean` ile iki seviye vardı.
 *
 * İkili bayrak, "eklemek" ile "var olanı değiştirmek"i aynı kapıya
 * koyuyordu; katkı vericiye ekleme açmak istediğimiz anda güncelleme ve
 * silme de açılırdı. Üçüncü seviye tam olarak bu ayrımı taşıyor.
 */
/*
 * BİLİNÇLİ BOŞLUK — "ekle" seviyesi ÜYEYE AÇIK.
 *
 * Yeni model "üyenin her değişikliği onaydan geçer" diyor, ama öneri motoru
 * bugün yalnız KİŞİ kayıtlarını taşıyor. Bu ucu yöneticiye kapatsaydık üye
 * tarif/etkinlik/mektup ekleyemez hâle gelirdi ve yerine koyacak bir yol da
 * olmazdı — yani daraltma, bir yeteneği yok ederdi. Öneri motoru bu depoları
 * da kapsayınca burası `canEdit`e çekilecek.
 */
async function guard(seviye: "oku" | "ekle" | "duzenle") {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  const yeter =
    seviye === "oku" ? true : seviye === "ekle" ? canPropose(ctx.role) : canEdit(ctx.role);
  if (!yeter)
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
  const g = await guard("oku");
  if ("error" in g) return g.error;
  return NextResponse.json({ recipes: await listRecipes(g.treeId) });
}

export async function POST(req: NextRequest) {
  // EKLEME — katkı verici de yapabilir; güncelleme/silme aşağıda "duzenle".
  const g = await guard("ekle");
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
  const g = await guard("duzenle");
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const recipe = await updateRecipe(g.treeId, input.id, input);
  if (!recipe) return NextResponse.json({ error: "Tarif bulunamadı ya da adı boş." }, { status: 404 });
  return NextResponse.json({ recipes: await listRecipes(g.treeId), recipe });
}

export async function DELETE(req: NextRequest) {
  const g = await guard("duzenle");
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const silindi = await deleteRecipe(g.treeId, input.id);
  if (!silindi) return NextResponse.json({ error: "Tarif bulunamadı" }, { status: 404 });
  return NextResponse.json({ recipes: await listRecipes(g.treeId) });
}
