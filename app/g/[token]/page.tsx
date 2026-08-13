import { getFamilyData } from "@/lib/blob";
import { findValidShare } from "@/lib/members";
import Workspace from "@/app/tree/Workspace";
import Invalid from "./Invalid";

export const dynamic = "force-dynamic";

/**
 * Herkese açık salt-okunur ağaç görünümü — ÜYELİK/GİRİŞ GEREKMEZ.
 *
 * `/g/<token>` — jeton geçerli ve paylaşım etkinse ağaç, salt-okunur ve
 * (sahibin tercihine göre) yaşayanlar gizlenmiş olarak gösterilir. Yazma
 * yolları arayüzde kapalı; sunucu da bu ziyaretçiye oturum vermez.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await findValidShare(decodeURIComponent(token));
  if (!valid) return <Invalid />;

  const { people, updatedAt } = await getFamilyData(valid.treeId);

  return (
    <Workspace
      people={people}
      version={updatedAt}
      familyName={valid.share.treeName}
      role="viewer"
      isFounder={false}
      publicView
      hideLivingForced={valid.share.hideLiving}
    />
  );
}
