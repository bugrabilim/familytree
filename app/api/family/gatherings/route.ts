import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { canDo } from "@/lib/guest";
import { canEdit } from "@/lib/roles";
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
 *  POST   → yeni etkinlik      (düzenleyici)
 *  PUT    → etkinliği güncelle (düzenleyici)
 *  DELETE → etkinliği ya da tek bir katılımı sil (düzenleyici)
 */

async function guard(edit: boolean) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  /*
   * MİSAFİR KAPISI (Faz 3d). Gerekçe `lib/guest.ts` başında: misafir hesabı
   * sınırsız üretilebiliyor, dolayısıyla hesap başına ölçülen ya da kendi
   * ağacının dışına uzanan hiçbir yüzey ona açık olamaz.
   */
  if (!canDo(ctx.isGuest, "gathering"))
    return { error: NextResponse.json({ error: "Misafir hesapta etkinlik oluşturma kapalı. Ağacınızı sahiplenin." }, { status: 403 }) };
  if (edit && !canEdit(ctx.role))
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
  const g = await guard(false);
  if ("error" in g) return g.error;
  return NextResponse.json({ gatherings: await readGatherings(g.treeId) });
}

export async function POST(req: NextRequest) {
  const g = await guard(true);
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
  const g = await guard(true);
  if ("error" in g) return g.error;
  const input = await body(req);
  if (!input.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  const updated = await updateGathering(g.treeId, input.id, input);
  if (!updated)
    return NextResponse.json({ error: "Etkinlik bulunamadı ya da başlık/tarih geçersiz." }, { status: 404 });
  return NextResponse.json({ gatherings: await readGatherings(g.treeId), gathering: updated });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(true);
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
