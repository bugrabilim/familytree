import type { Metadata } from "next";
import { headers } from "next/headers";
import { getFamilyData } from "@/lib/blob";
import { findValidShare, recordShareVisit } from "@/lib/members";
import { viewAll } from "@/lib/privacy";
import { applyPublicVisibility } from "@/lib/public-visibility";
import { translate } from "@/lib/i18n-dict";
import { SITE_URL } from "@/lib/site";
import EmbedTree from "@/components/EmbedTree";
import Invalid from "@/app/g/[token]/Invalid";
import { allows } from "@/lib/share-scope";

export const dynamic = "force-dynamic";

/**
 * Gömülebilir ağaç — `/embed/<jeton>`.
 *
 * Aynı paylaşım jetonunu kullanır (`/g/<jeton>` ile birebir aynı jeton, aynı
 * gizlilik tercihi). Fark yalnız sunumda: burada üst çubuk, sekmeler ve
 * menüler yok, çünkü bu sayfa başka bir sitenin iframe'inde dar bir kutuda
 * açılıyor.
 *
 * ÇERÇEVELEME İZNİ tam olarak bu yola verilir. `proxy.ts` her yanıta
 * `frame-ancestors 'none'` + `X-Frame-Options: DENY` koyar; `/embed` ise
 * `frame-ancestors *` alır. Kural `lib/public-routes.ts`te tek yerde ve
 * testli — bu iznin yanlışlıkla genişlemesi, oturum açmış kullanıcının
 * `/tree` sayfasının gömülebilmesi demek olurdu.
 *
 * Arama motorlarına kapalı: gömme, gömen sayfanın parçasıdır; ayrıca
 * dizine girmesi hem yinelenen içerik hem de paylaşım bağlantısının
 * aranabilir hâle gelmesi olurdu.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function deviceOf(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobi|iphone|android/.test(s)) return "mobil";
  return "masaüstü";
}

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const raw = decodeURIComponent(token);
  const valid = await findValidShare(raw);
  if (!valid) return <Invalid />;

  /*
   * Tek kişilik jeton (mezar QR'ı) GÖMÜLEMEZ.
   *
   * O bağlantı bir anma sayfasına, yani bir varış noktasına işaret ediyor;
   * bir sitenin köşesine iliştirilecek bir bileşen değil. Gömmeye açsaydık
   * mezar taşındaki karekod herhangi bir sayfaya çerçevelenebilirdi.
   * Bağlantının kendisi `/g/<jeton>` olarak çalışmaya devam ediyor.
   */
  if (valid.share.personId) return <Invalid />;

  /*
   * KAPSAM (madde 35/G): gömme YALNIZ ağacı gösteriyor. Bağlantı ağacı
   * paylaşmıyorsa gömme de yok — yoksa kapsam ayarı, aynı jetonun bir
   * harfi değişmiş yolundan sessizce delinirdi.
   */
  if (!allows(valid.share.scope, "agac")) return <Invalid />;

  try {
    const h = await headers();
    await recordShareVisit(valid.treeId, valid.share.id, {
      country: h.get("x-vercel-ip-country") || undefined,
      city: (() => {
        const c = h.get("x-vercel-ip-city");
        return c ? decodeURIComponent(c) : undefined;
      })(),
      device: deviceOf(h.get("user-agent") || ""),
    });
  } catch {
    /* istatistik görüntülemeyi engellemez */
  }

  const { people } = await getFamilyData(valid.treeId);

  /*
   * `/g/<jeton>` ile AYNI sunucu-taraflı gizlilik zinciri — ve aynı sırada:
   * önce kişi bazlı kısıt (gizlenenleri listeden çıkarır, başvuruları
   * temizler), sonra maske. Burada tekrarlanması bilinçli: gömme yüzeyi
   * paylaşım sayfasından farklı bir dosya, o dosyadaki korumayı "nasılsa
   * orada var" diye atlamak tam da sızıntının olduğu yer olurdu.
   */
  const safePeople = viewAll(
    applyPublicVisibility(people, { blurredName: translate("tr", "person.blurred") }),
    valid.share.hideLiving
  );

  return (
    <EmbedTree
      people={safePeople}
      treeName={valid.share.treeName}
      hideLiving={valid.share.hideLiving}
      fullUrl={`${SITE_URL}/g/${encodeURIComponent(raw)}`}
      poweredBy={translate("tr", "embed.poweredBy")}
    />
  );
}
