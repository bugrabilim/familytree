import { redirect } from "next/navigation";
import { getFamilyData } from "@/lib/blob";
import { viewAll } from "@/lib/privacy";
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

  /*
   * MASKELEME SUNUCUDA. Bu satır bir gizlilik sınırıdır.
   *
   * `Workspace` bir istemci bileşeni ("use client"). Sunucu bileşeninden
   * istemci bileşenine geçen proplar RSC yüküne serileştirilip tarayıcıya
   * gönderilir. Yalnız çizim anında maskelemek (istemcideki
   * `PrivacyContext`) ham veriyi zaten göndermiş olmak demekti.
   *
   * Burada sınır BAŞKA BİR HESAP: eşleşmiş komşu ağacın sahibi. `/g`
   * sayfası bu maskeyi baştan beri uyguluyordu, burası uygulamıyordu — iki
   * kopya birbirinden ayrı düşmüştü. Ölçtüm: `confidential` işaretli bir
   * kişinin sağlık kaydı, hikâyesi, doğum tarihi ve yeri sayfa kaynağında
   * duruyordu.
   *
   * `hideLiving` SABİT true: hesaplar arası görünümde yaşayanlar her zaman
   * gizli (aşağıdaki `hideLivingForced` ile aynı karar, ama o yalnız
   * görüntüleme; asıl koruma bu satır).
   *
   * `applyPublicVisibility` BİLEREK yok: `publicVisibility` alanının kendi
   * belgelediği kapsam "girişsiz paylaşım bağlantısı"dır (bkz.
   * `types/family.ts`). Eşleşme ise karşılıklı onaylanmış, kimliği belli
   * iki hesap arasında. O alanı buraya genişletmek, sahibin vermediği bir
   * kararı onun adına vermek olurdu.
   */
  const safePeople = viewAll(people, true);

  return (
    <Workspace
      people={safePeople}
      version={updatedAt}
      familyName={pairing.peerName}
      role="uye"
      isFounder={false}
      publicView
      hideLivingForced
    />
  );
}
