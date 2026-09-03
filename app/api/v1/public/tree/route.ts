import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { findValidShare } from "@/lib/members";
import { viewAll } from "@/lib/privacy";
import { applyPublicVisibility } from "@/lib/public-visibility";
import { translate } from "@/lib/i18n-dict";
import { rateLimitShared } from "@/lib/rate-limit";
import { toPublicTree } from "@/lib/public-api";

export const dynamic = "force-dynamic";

/**
 * Herkese açık okuma API'si — `GET /api/v1/public/tree?token=<jeton>`.
 *
 * Aynı paylaşım jetonu (`/g/<jeton>`), aynı gizlilik tercihi; fark yalnız
 * biçimde: HTML yerine JSON.
 *
 * ## Üç ayrı katman, sırasıyla
 *
 * 1. `applyPublicVisibility` — sahibin gizlemeyi/bulanıklaştırmayı seçtiği
 *    kişiler. Önce bu: gizlenen kişi listeden ÇIKAR ve ona yapılan
 *    başvurular temizlenir.
 * 2. `viewAll` — yaşayanlar / gizli kayıtlar maskesi.
 * 3. `toPublicTree` — SÖZLEŞME. Maskeden geçmiş veri bile olduğu gibi
 *    dışarı verilmiyor; yalnız v1'de adı geçen alanlar. Böylece `Person`e
 *    ileride eklenecek bir alan, kimse karar vermeden genel API'ye
 *    sızmıyor.
 *
 * Üçünü de atlamamak önemli — ilk ikisi gizlilik, üçüncüsü sözleşme; farklı
 * işler ve biri ötekinin yerine geçmiyor.
 *
 * ## Kimlik yok, o yüzden sınır IP başına
 *
 * Uç oturumsuz. Hesap başına sınır koyamayız; jeton + IP birlikte
 * anahtarlanıyor. Paylaşımlı sınır (K4/33) burada özellikle önemli:
 * örnek-içi bir sınır, kimliksiz bir uçta neredeyse hiçbir şey demek
 * olurdu.
 */

const CORS = {
  // Genel okuma API'si: tarayıcıdan da tüketilebilmeli. Kimlik bilgisi
  // (çerez) taşımıyor, bu yüzden `*` güvenli — ve `credentials` da
  // istemiyoruz ki bir sitenin ziyaretçisinin oturumu üzerinden çağrılamasın.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...extra } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const token = (req.nextUrl.searchParams.get("token") ?? "").trim();
  if (!token) return json({ error: "token gerekli" }, 400);

  /*
   * Sınır jetonu DOĞRULAMADAN ÖNCE. Sıra bilinçli: doğrulama Blob'a gidiyor
   * ve geçersiz jetonla dövmek de bir maliyet. Anahtarda jeton ve IP birlikte
   * var — tek bir jetonu döven biri, aynı IP'deki başka jetonları da yavaşlatsın.
   */
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor";
  const rl = await rateLimitShared(`v1:tree:${ip}`, { capacity: 30, refillPerSec: 0.5 });
  if (!rl.ok) {
    return json({ error: "Çok fazla istek." }, 429, { "Retry-After": String(rl.retryAfter) });
  }

  const valid = await findValidShare(decodeURIComponent(token));
  if (!valid) return json({ error: "Bağlantı geçersiz ya da süresi dolmuş." }, 404);

  const { people } = await getFamilyData(valid.treeId);

  // (1) sahibin kişi bazlı kısıtı → (2) gizlilik maskesi. Sıra önemli:
  // maskeleme kimlikleri korur, dolayısıyla gizlenmiş biri başkalarının
  // `parentIds`inde kalır ve "burada biri vardı" derdi.
  const safePeople = viewAll(
    applyPublicVisibility(people, { blurredName: translate("tr", "person.blurred") }),
    valid.share.hideLiving
  );

  /*
   * Tek kişilik jeton (mezar QR'ı): yalnız o kişi döner, ağacın tamamı
   * değil. Taş herkesin görebileceği bir yerde; onu tarayan birine tüm soy
   * ağacını API olarak açmak paylaşımın ölçüsünü kaçırır.
   */
  const secilmis = valid.share.personId
    ? safePeople.filter((p) => p.id === valid.share.personId)
    : safePeople;
  if (valid.share.personId && secilmis.length === 0) {
    return json({ error: "Bağlantı geçersiz ya da süresi dolmuş." }, 404);
  }

  return json(
    toPublicTree(secilmis, {
      name: valid.share.treeName,
      hideLiving: valid.share.hideLiving,
    }),
    200,
    // Kısa önbellek: aynı jeton için art arda gelen istekler Blob'a inmesin,
    // ama veri de bayatlamasın.
    { "Cache-Control": "public, max-age=60" }
  );
}
