import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { addBond, deleteBond, readBonds, updateBond } from "@/lib/bond-store";
import type { BondWriteError } from "@/lib/bond-store";
import { MAX_BONDS } from "@/lib/bonds";
import type { Bond } from "@/types/bond";

export const dynamic = "force-dynamic";

/**
 * Genogram duygusal bağ katmanı.
 *
 * Bu uç `resolveActiveTree` ile korunuyor ve HERKESE AÇIK bir eşi yok. Bağ
 * verisi paylaşım bağlantısında, dışa aktarımda, kitapta ve GEDCOM'da hiç
 * yer almıyor — ayrı bir blobda durmasının asıl sebebi de bu. "Amcamla
 * aramız kopuk" notu ailenin kendi içinde kalır.
 *
 *  GET    → ağacın bağları
 *  POST   → yeni bağ       (düzenleyici)
 *  PUT    → bağı güncelle  (düzenleyici)
 *  DELETE → bağı sil       (düzenleyici)
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

async function body(req: NextRequest): Promise<Partial<Bond> & { id?: string }> {
  try {
    return (await req.json()) as Partial<Bond> & { id?: string };
  } catch {
    return {};
  }
}

const MESAJ: Record<BondWriteError, { text: string; status: number }> = {
  dolu: { text: `En fazla ${MAX_BONDS} bağ kaydedilebilir.`, status: 400 },
  gecersiz: { text: "Bağın iki farklı ucu ve geçerli bir türü olmalı.", status: 400 },
  kopya: { text: "Bu iki kişi arasında zaten bir bağ var. Var olanı düzenleyin.", status: 409 },
  yok: { text: "Bağ bulunamadı.", status: 404 },
};

function hata(e: BondWriteError) {
  const m = MESAJ[e];
  return NextResponse.json({ error: m.text }, { status: m.status });
}

export async function GET() {
  const g = await guard(false);
  if ("error" in g) return g.error;
  return NextResponse.json({ bonds: await readBonds(g.treeId) });
}

export async function POST(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const res = await addBond(g.treeId, await body(req));
  if ("error" in res) return hata(res.error);
  return NextResponse.json({ bonds: await readBonds(g.treeId), bond: res.bond });
}

export async function PUT(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const res = await updateBond(g.treeId, input.id, input);
  if ("error" in res) return hata(res.error);
  return NextResponse.json({ bonds: await readBonds(g.treeId), bond: res.bond });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  if (!(await deleteBond(g.treeId, input.id))) return hata("yok");
  return NextResponse.json({ bonds: await readBonds(g.treeId) });
}
