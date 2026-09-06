import { headers } from "next/headers";
import { getFamilyData } from "@/lib/blob";
import { findValidShare, recordShareVisit } from "@/lib/members";
import { viewAll } from "@/lib/privacy";
import { applyPublicVisibility } from "@/lib/public-visibility";
import { getParents, getSpouses, getChildren, indexPeople } from "@/lib/relations";
import Workspace from "@/app/tree/Workspace";
import MemorialPage from "@/components/MemorialPage";
import PublicObituaries from "@/components/PublicObituaries";
import { readPublicObituaries } from "@/lib/obituary-store";
import { translate } from "@/lib/i18n-dict";
import Invalid from "./Invalid";

export const dynamic = "force-dynamic";

/** User-Agent'tan kaba cihaz türü (anonim). */
function deviceOf(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobi|iphone|android/.test(s)) return "mobil";
  return "masaüstü";
}

/**
 * Herkese açık salt-okunur ağaç görünümü — ÜYELİK/GİRİŞ GEREKMEZ.
 *
 * `/g/<token>` — jeton geçerli, etkin ve süresi dolmamışsa ağaç salt-okunur ve
 * (sahibin tercihine göre) yaşayanlar gizlenmiş gösterilir. Her görüntüleme
 * anonim olarak sayılır (sahibin istatistikleri için: ülke/şehir/cihaz/zaman).
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await findValidShare(decodeURIComponent(token));
  if (!valid) return <Invalid />;

  // Ziyaret kaydı (best-effort, anonim). Vercel coğrafi başlıkları varsa kullan.
  try {
    const h = await headers();
    await recordShareVisit(valid.treeId, valid.share.id, {
      country: h.get("x-vercel-ip-country") || undefined,
      city: (() => { const c = h.get("x-vercel-ip-city"); return c ? decodeURIComponent(c) : undefined; })(),
      device: deviceOf(h.get("user-agent") || ""),
    });
  } catch { /* istatistik görüntülemeyi engellemez */ }

  const { people, updatedAt } = await getFamilyData(valid.treeId);

  /*
   * Maskeleme SUNUCUDA yapılır — bu satır bir gizlilik sınırıdır.
   *
   * `Workspace` bir istemci bileşeni ("use client"). Next.js'te sunucu
   * bileşeninden istemci bileşenine geçen proplar RSC yüküne serileştirilip
   * tarayıcıya gönderilir. Yalnız çizim anında maskelemek (istemcideki
   * `PrivacyContext`) ham veriyi zaten göndermiş olmak demekti: yaşayanların
   * doğum tarihi, sağlık kaydı, hikâyesi sayfa kaynağında görünüyordu.
   *
   * Burası girişsiz, herkese açık bir yüzey; ham veri buradan çıkmamalı.
   * İstemci tarafı aynı `viewPerson`'ı yeniden uygular (idempotent).
   */
  /*
   * SIRA ÖNEMLİ: önce kişi bazlı paylaşım kısıtı, sonra gizlilik maskesi.
   *
   * `applyPublicVisibility` gizlenen kişileri listeden ÇIKARIR ve onlara
   * yapılan başvuruları temizler; `viewAll` ise kalanların hassas alanlarını
   * maskeler. Ters sırada çalıştırmak yanlış olurdu: maskeleme kimlikleri
   * korur, dolayısıyla gizlenmiş birinin kimliği başkalarının `parentIds`inde
   * kalır ve "burada biri vardı" derdi.
   *
   * İkisi de SUNUCUDA: ham veri RSC yüküne hiç girmez.
   */
  const safePeople = viewAll(
    applyPublicVisibility(people, { blurredName: translate("tr", "person.blurred") }),
    valid.share.hideLiving
  );

  /*
   * Tek kişilik paylaşım (mezar QR'ı): jeton bir kişiye daraltılmışsa ağaç
   * DEĞİL, o kişinin anma sayfası açılır — ve gezinilecek başka bir yer
   * sunulmaz. Taş herkesin görebileceği bir yerdedir; tarayan kişiye tüm soy
   * ağacını açmak paylaşımın ölçüsünü kaçırır.
   *
   * Yakınlar da maskeli listeden (`safePeople`) okunur, ham veriden değil.
   * Kişi silinmişse bağlantı geçersiz sayılır: boş bir sayfa göstermektense
   * "bu bağlantı artık geçerli değil" demek doğru.
   */
  if (valid.share.personId) {
    const person = safePeople.find((p) => p.id === valid.share.personId);
    if (!person) return <Invalid />;
    const idx = indexPeople(safePeople);
    return (
      <MemorialPage
        person={person}
        parents={getParents(person, idx)}
        spouses={getSpouses(person, idx)}
        kids={getChildren(person, safePeople)}
        treeName={valid.share.treeName}
      />
    );
  }

  /*
   * Taziye şeridi — YALNIZ ailenin paylaşmayı seçtikleri.
   *
   * Okuma yolu `readPublicObituaries`tir; "hepsini oku, sonra süz" demek
   * süzmeyi unutmayı bir satırlık hata hâline getirirdi. Sunucu tarafı da
   * kasıtlı: yayımlanmamış bir duyuru bu sayfanın RSC yüküne HİÇ girmez.
   *
   * Dil: burası girişsiz bir sayfa ve sunucu bileşeni; kullanıcının dil
   * tercihi istemcide yaşıyor. Etiketler Türkçe (`tr`) verilir — sayfanın
   * varsayılan dili odur.
   */
  const obits = await readPublicObituaries(valid.treeId).catch(() => []);
  const L = (k: string) => translate("tr", k);

  return (
    <>
      {obits.length > 0 && (
        <PublicObituaries
          obituaries={obits}
          heading={L("obit.publicHeading")}
          labels={{
            serviceOn: L("obit.field.serviceOn"),
            serviceAt: L("obit.field.serviceAt"),
            burialAt: L("obit.field.burialAt"),
            condolenceAt: L("obit.field.condolenceAt"),
          }}
        />
      )}
      <Workspace
      people={safePeople}
      version={updatedAt}
      familyName={valid.share.treeName}
      role="uye"
      isFounder={false}
        publicView
        hideLivingForced={valid.share.hideLiving}
      />
    </>
  );
}
