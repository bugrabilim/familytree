import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { arePaired } from "@/lib/members";
import { graftFromPeer } from "@/lib/graft";
import { nextCode } from "@/lib/code";
import type { Person } from "@/types/family";

export const dynamic = "force-dynamic";

/** Kodu olmayan yeni kişilere benzersiz kod ata. */
function ensureCodes(people: Person[]): Person[] {
  const out = [...people];
  for (let i = 0; i < out.length; i++) {
    if (!out[i].code) out[i] = { ...out[i], code: nextCode(out) };
  }
  return out;
}

/**
 * Dal aşılama (P3): bağlı bir ağaçtaki `rootPeerId` kişisinin ata soyunu KENDİ
 * ağacına ekler. Yalnız düzenleyici (editor+) ve ONAYLI eş. Kaynağa dokunmaz.
 * body: { peerTreeId, rootPeerId }
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  let body: { peerTreeId?: string; rootPeerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const { peerTreeId, rootPeerId } = body;
  if (!peerTreeId || !rootPeerId)
    return NextResponse.json({ error: "peerTreeId ve rootPeerId gerekli." }, { status: 400 });

  if (!(await arePaired(ctx.treeId, peerTreeId)))
    return NextResponse.json({ error: "Bu ağaçla eşleşmeniz yok." }, { status: 403 });

  const [mine, peer] = await Promise.all([
    getFamilyData(ctx.treeId, { skipCache: true }),
    getFamilyData(peerTreeId),
  ]);

  /*
   * İYİMSER KİLİT. Başlık gelmezse `versionMismatch` `false` döner, yani
   * başlığı göndermeyen çağıranlar (mobil, betikler) etkilenmez.
   */
  if (versionMismatch(req, mine.updatedAt))
    return NextResponse.json(
      { error: "Bu ağaç siz bakarken değişti. Sayfayı yenileyip tekrar deneyin." },
      { status: 409 }
    );

  const { people, added, linked } = graftFromPeer(mine.people, peer.people, rootPeerId);
  if (added === 0 && linked === 0)
    return NextResponse.json({ ok: true, added: 0, linked: 0 });

  await saveFamilyData(ctx.treeId, { people: ensureCodes(people), updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, added, linked });
}
