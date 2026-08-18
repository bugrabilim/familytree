import { redirect } from "next/navigation";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { listPairings } from "@/lib/members";
import { findCrossMatches } from "@/lib/crossmatch";
import { isMasked, maskPerson } from "@/lib/privacy";
import { fullName } from "@/lib/name";
import { lifeSpan } from "@/lib/date";
import CompareView, { type MatchRow } from "@/components/CompareView";
import type { Person } from "@/types/family";

export const dynamic = "force-dynamic";

/**
 * Bağlı iki ağacın KESİŞİMLERİ (P2) — olası ortak kişiler. Yalnız onaylı eş
 * görebilir. Karşı ağacın YAŞAYAN kişileri gösterimde maskelenir (gizlilik).
 * P3 (dal aşılama) ve P4 (tam birleştirme) eylemleri buradan yürütülür.
 */
export default async function ComparePage({
  params,
}: {
  params: Promise<{ treeId: string }>;
}) {
  const { treeId } = await params;
  const ctx = await resolveActiveTree();
  if (!ctx.ok) redirect("/login");

  const pairing = (await listPairings(ctx.treeId)).find((p) => p.peerTreeId === treeId);
  if (!pairing) redirect("/tree");

  const [mineData, peerData] = await Promise.all([
    getFamilyData(ctx.treeId),
    getFamilyData(treeId),
  ]);

  const matches = findCrossMatches(mineData.people, peerData.people);
  const mineIdx = new Map(mineData.people.map((p) => [p.id, p]));
  const peerIdx = new Map(peerData.people.map((p) => [p.id, p]));

  const display = (p: Person, mask: boolean) => {
    const shown = mask && isMasked(p, true) ? maskPerson(p) : p;
    return { id: p.id, name: fullName(shown), span: lifeSpan(shown.birthDate, shown.deathDate) };
  };

  const rows: MatchRow[] = [];
  for (const m of matches) {
    const a = mineIdx.get(m.aId);
    const b = peerIdx.get(m.bId);
    if (!a || !b) continue;
    rows.push({
      reason: m.reason,
      mine: display(a, false), // kendi ağacım — tam görürüm
      peer: display(b, true), // karşı ağaç — yaşayan maskeli
    });
  }

  return (
    <CompareView
      peerTreeId={treeId}
      peerName={pairing.peerName}
      rows={rows}
      mineCount={mineData.people.length}
      peerCount={peerData.people.length}
    />
  );
}
