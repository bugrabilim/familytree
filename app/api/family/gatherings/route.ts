import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { canContribute, canEdit } from "@/lib/roles";
import {
  addGathering, deleteGathering, deleteRsvp, readGatherings, updateGathering,
} from "@/lib/gathering-store";
import { MAX_GATHERINGS } from "@/lib/gathering";
import type { Gathering } from "@/types/gathering";

export const dynamic = "force-dynamic";

/**
 * Aile etkinlikleri — AİLE İÇİ uç (oturum gerekir).
 *
 * Anonim tarafla karıştırılmamalı: burası katılımcı listesini ve yazma
 * jetonunu da döndürüyor. Anonim davetlinin gördüğü yüzey ayrı bir rota
 * (`/api/rsvp/<treeId>`) ve orada ikisi de çıkarılıyor.
 *
 *  GET    → etkinlikler (katılımcılarla)
 *  POST   → yeni etkinlik      (katkı verici)
 *  PUT    → etkinliği güncelle (düzenleyici)
 *  DELETE → etkinliği ya da tek bir katılımı sil (düzenleyici)
 */

/**
 * ÜÇ SEVİYE (madde 35) — eskiden `edit: boolean` ile iki seviye vardı.
 *
 * İkili bayrak, "eklemek" ile "var olanı değiştirmek"i aynı kapıya
 * koyuyordu; katkı vericiye ekleme açmak istediğimiz anda güncelleme ve
 * silme de açılırdı. Üçüncü seviye tam olarak bu ayrımı taşıyor.
 */
async function guard(seviye: "oku" | "ekle" | "duzenle") {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  const yeter =
    seviye === "oku" ? true : seviye === "ekle" ? canContribute(ctx.role) : canEdit(ctx.role);
  if (!yeter)
    return {
      error: NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 }),
    };
  return { treeId: ctx.treeId };
}

async function body(req: NextRequest): Promise<Partial<Gathering> & { id?: string; rsvpId?: string }> {
  try {
    return (await req.json()) as Partial<Gathering> & { id?: string; rsvpId?: string };
  } catch {
    return {};
  }
}

export async function GET() {
  const g = await guard("oku");
  if ("error" in g) return g.error;
  return NextResponse.json({ gatherings: await readGatherings(g.treeId) });
}

export async function POST(req: NextRequest) {
  // EKLEME — katkı verici de yapabilir; güncelleme/silme aşağıda "duzenle".
  const g = await guard("ekle");
  if ("error" in g) return g.error;
  const created = await addGathering(g.treeId, await body(req));
  if (!created)
    return NextResponse.json(
      { error: `Etkinliğin bir başlığı ve tarihi olmalı (en fazla ${MAX_GATHERINGS} etkinlik).` },
      { status: 400 }
    );
  return NextResponse.json({ gatherings: await readGatherings(g.treeId), gathering: created });
}

export async function PUT(req: NextRequest) {
  const g = await guard("duzenle");
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const updated = await updateGathering(g.treeId, input.id, input);
  if (!updated)
    return NextResponse.json({ error: "Etkinlik bulunamadı ya da başlık/tarih geçersiz." }, { status: 404 });
  return NextResponse.json({ gatherings: await readGatherings(g.treeId), gathering: updated });
}

export async function DELETE(req: NextRequest) {
  const g = await guard("duzenle");
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

  // `rsvpId` verilmişse yalnız o katılım silinir, etkinlik durur.
  const silindi = input.rsvpId
    ? await deleteRsvp(g.treeId, input.id, input.rsvpId)
    : await deleteGathering(g.treeId, input.id);
  if (!silindi) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  return NextResponse.json({ gatherings: await readGatherings(g.treeId) });
}
