import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { arePaired } from "@/lib/members";
import { mergeTree } from "@/lib/graft";
import { nextCode } from "@/lib/code";
import type { Person } from "@/types/family";

export const dynamic = "force-dynamic";

function ensureCodes(people: Person[]): Person[] {
  const out = [...people];
  for (let i = 0; i < out.length; i++) {
    if (!out[i].code) out[i] = { ...out[i], code: nextCode(out) };
  }
  return out;
}

/**
 * Tam birleştirme (P4): bağlı bir ağacın TAMAMINI kendi ağacına katar;
 * kesişimlerde (ad + yıl) yeniden kullanır. Yalnız düzenleyici + ONAYLI eş.
 * Kaynağa dokunmaz (karşı taraf kendi ağacını korur). body: { peerTreeId }
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  let body: { peerTreeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  if (!body.peerTreeId) return NextResponse.json({ error: "peerTreeId gerekli." }, { status: 400 });

  if (!(await arePaired(ctx.treeId, body.peerTreeId)))
    return NextResponse.json({ error: "Bu ağaçla eşleşmeniz yok." }, { status: 403 });

  const [mine, peer] = await Promise.all([
    getFamilyData(ctx.treeId, { skipCache: true }),
    getFamilyData(body.peerTreeId),
  ]);

  const { people, added, linked } = mergeTree(mine.people, peer.people);
  if (added > 0) {
    await saveFamilyData(ctx.treeId, { people: ensureCodes(people), updatedAt: new Date().toISOString() });
  }
  return NextResponse.json({ ok: true, added, linked });
}
