import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import {
  addObituary, countObituaries, deleteObituary, readObituaries, updateObituary,
} from "@/lib/obituary-store";
import { MAX_OBITUARIES } from "@/lib/obituaries";
import type { Obituary } from "@/types/obituary";

export const dynamic = "force-dynamic";

/**
 * Taziye / vefat duyuruları — ağaç üyeleri için.
 *
 * Bu uç ailenin kendi görünümüdür: yayımlanmamış duyurular da buradadır.
 * Herkese açık yüzey (girişsiz paylaşım) AYRI bir okuma yolu kullanır
 * (`readPublicObituaries`); "hepsini oku sonra süz" demek, süzmeyi unutmayı
 * bir satırlık hata hâline getirirdi.
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

async function body(req: NextRequest): Promise<Partial<Obituary> & { id?: string }> {
  try {
    return (await req.json()) as Partial<Obituary> & { id?: string };
  } catch {
    return {};
  }
}

export async function GET() {
  const g = await guard(false);
  if ("error" in g) return g.error;
  return NextResponse.json({ obituaries: await readObituaries(g.treeId) });
}

export async function POST(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const o = await addObituary(g.treeId, await body(req));
  if (!o) {
    const n = await countObituaries(g.treeId);
    return NextResponse.json(
      {
        error:
          n >= MAX_OBITUARIES
            ? `Duyuru sayısı sınırı aşıldı (en fazla ${MAX_OBITUARIES}).`
            : "Duyuru bir kişiye bağlı olmalı ve tarihler geçerli olmalı.",
      },
      { status: 400 }
    );
  }
  return NextResponse.json({ obituaries: await readObituaries(g.treeId), obituary: o });
}

export async function PUT(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const o = await updateObituary(g.treeId, input.id, input);
  if (!o)
    return NextResponse.json({ error: "Duyuru bulunamadı ya da tarih geçersiz." }, { status: 404 });
  return NextResponse.json({ obituaries: await readObituaries(g.treeId), obituary: o });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const silindi = await deleteObituary(g.treeId, input.id);
  if (!silindi) return NextResponse.json({ error: "Duyuru bulunamadı" }, { status: 404 });
  return NextResponse.json({ obituaries: await readObituaries(g.treeId) });
}
