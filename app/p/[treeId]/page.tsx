import { redirect } from "next/navigation";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { listPairings } from "@/lib/members";
import Workspace from "@/app/tree/Workspace";

export const dynamic = "force-dynamic";

/**
 * Bağlı (eşleştirilmiş) bir ağacın SALT-OKUNUR görünümü — P1.
 *
 * Yalnız GİRİŞ YAPMIŞ ve `treeId` ile ONAYLI eşleşmiş hesaplar görebilir.
 * Yaşayanlar gizlenir (hesaplar arası görünümde gizlilik önce). Düzenleme
 * yolları kapalı; sunucu da bu ağaçta bu hesaba yazma vermez.
 */
export default async function PairedTreePage({
  params,
}: {
  params: Promise<{ treeId: string }>;
}) {
  const { treeId } = await params;
  const ctx = await resolveActiveTree();
  if (!ctx.ok) redirect("/login");

  const pairings = await listPairings(ctx.treeId);
  const pairing = pairings.find((p) => p.peerTreeId === treeId);
  if (!pairing) redirect("/tree"); // bağlı değil → kendi ağacına

  const { people, updatedAt } = await getFamilyData(treeId);

  return (
    <Workspace
      people={people}
      version={updatedAt}
      familyName={pairing.peerName}
      role="viewer"
      isFounder={false}
      publicView
      hideLivingForced
    />
  );
}
