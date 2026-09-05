/**
 * Oturum GEREKTİRMEYEN yollar — tek liste.
 *
 * Eskiden `proxy.ts` içinde elle yazılmış uzun bir `||` zinciriydi. Üç sorun
 * vardı: (1) yeni bir herkese açık yüzey eklenince listeye eklemeyi unutmak
 * kolaydı — `/_vercel` betikleri tam da böyle gözden kaçtı ve ölçüm oturumsuz
 * sayfalarda hiç çalışmadı; (2) tek satır bile birim testi koşulamıyordu;
 * (3) `startsWith` gevşekti: `/login` kuralı `/loginXYZ`i de geçiriyordu.
 *
 * Bu dosya bilerek bağımlılıksızdır (`@/…` çalışma zamanı içe aktarımı yok),
 * böylece `node --experimental-strip-types` ile doğrudan test edilebilir.
 */

/**
 * Statik varlık uzantıları (public/ altındaki görsel, ikon, yazı tipi…).
 * Korumaya takılırsa `<img>` istekleri /login'e yönlenir ve sayfa bozulur.
 */
export const PUBLIC_ASSET_EXT =
  /\.(?:webp|webm|mp4|png|jpe?g|gif|svg|ico|avif|woff2?|txt|xml|webmanifest)$/i;

/** Yalnız TAM eşleşme herkese açık. */
export const PUBLIC_EXACT: readonly string[] = [
  "/",
  "/favicon.ico",
];

/**
 * Kendisi ve ALTINDAKİ her yol herkese açık. Eşleşme `p === önek` ya da
 * `p` öneki + "/" ile başlıyor — çıplak `startsWith` DEĞİL, yoksa `/login`
 * kuralı `/login-sahte` gibi bir yolu da açardı.
 */
export const PUBLIC_PREFIXES: readonly string[] = [
  "/tanitim",
  "/privacy",
  "/terms",
  "/login",
  "/register",
  "/forgot-password",
  /*
   * E-posta doğrulama (Faz 3e). Bağlantı POSTADAN geliyor ve kullanıcı onu
   * başka bir cihazda/tarayıcıda açabiliyor; oturum duvarına takılırsa
   * doğrulama hiçbir zaman tamamlanamaz. Kimlik jetonun kendisinde.
   *
   * DİKKAT: yalnız `/verify` altı açık. Önek eşleşmesi `p === önek` ya da
   * `önek + "/"` ile başladığı için BAĞLAMA ucu (`/api/account/email`)
   * kapalı kalıyor — o oturum ve founder yetkisi istiyor.
   */
  "/verify-email",
  "/api/account/email/verify",
  /*
   * Şifre sıfırlama sayfası (madde 51). Aynı gerekçe: bağlantı POSTADAN
   * geliyor ve şifresini unutmuş kullanıcının tanımı gereği oturumu YOK.
   * Oturum duvarına takılsaydı sıfırlama hiçbir zaman tamamlanamazdı.
   * Kimlik jetonun kendisinde ve jeton tek kullanımlık.
   */
  "/reset-password",
  "/api/auth",
  "/api/register",
  "/api/reset-password",
  // Native mobil kimlik uçları (jeton alma) — oturum gerektirmez.
  "/api/mobile/login",
  "/api/mobile/register",
  "/join",
  "/api/tree/join",
  // Herkese açık salt-okunur paylaşım görünümü (üyeliksiz).
  "/g",
  // Gömülebilir ağaç — başka bir sitenin iframe'inde açılır (üyeliksiz).
  "/embed",
  // Herkese açık okuma API'si (v1) — jetonla, oturumsuz.
  "/api/v1/public",
  // Anonim katılım bildirimi (RSVP) — davet jetonuyla, oturumsuz.
  "/api/rsvp",
  "/rsvp",
  "/_next",
  // Vercel Analytics / Speed Insights betikleri.
  "/_vercel",
];

/**
 * Önek olarak açılamayacak, biçimi önemli yollar.
 *
 * `/pair` yalnız TEK segment derinliğinde açıktır: davet kabul sayfası
 * (`/pair/<jeton>`) giriş yönlendirmesini kendi yönetir, ama `/pair/compare/…`
 * gerçek veriyi gösterir ve oturum İSTER. Düz bir `/pair` öneki ikincisini de
 * açardı — bu yüzden ayrı bir kalıp listesi var.
 */
export const PUBLIC_PATTERNS: readonly RegExp[] = [/^\/pair(?:\/[^/]+)?$/];

/** Bu yol oturumsuz görülebilir mi? */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ASSET_EXT.test(pathname)) return true;
  if (PUBLIC_EXACT.includes(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
  }
  return PUBLIC_PATTERNS.some((re) => re.test(pathname));
}

/**
 * Native mobil: `Authorization: Bearer` taşıyan API istekleri çerez oturumu
 * olmadan gelir. /login'e yönlendirmek (302) yerine rotaya bırakılır — rota
 * jetonu `resolveActiveTree` ile doğrular. Yalnız /api/* için geçerlidir:
 * sayfa isteklerinde bir başlık, kimlik yerine geçmez.
 */
export function hasBearerApi(pathname: string, authorization: string | null): boolean {
  return pathname.startsWith("/api/") && (authorization?.startsWith("Bearer ") ?? false);
}

/* ------------------------------------------------------------------ */
/* Çerçeveleme (iframe) politikası                                     */
/* ------------------------------------------------------------------ */

/**
 * Başka bir sitenin iframe'inde açılmasına İZİN VERİLEN yollar.
 *
 * Bugüne kadar bu depoda hiçbir çerçeveleme koruması YOKTU: `X-Frame-Options`
 * da `frame-ancestors` da hiçbir yerde ayarlanmamıştı. Yani oturum açmış bir
 * kullanıcının `/tree` sayfası herhangi bir sitenin iframe'ine gömülebiliyor
 * ve tıklama kaçırmaya (clickjacking) açık duruyordu — görünmez bir çerçeve
 * üstüne konan bir düğme, kullanıcının farkında olmadan "Sil"e basmasını
 * sağlayabilirdi.
 *
 * Bu yüzden sıra şu: önce HER YERDE reddet, sonra tam olarak bu yol için
 * gevşet. Gömme özelliği bir korumayı gevşetmiyor, eksik olan korumayı
 * getiriyor ve kendine dar bir delik açıyor.
 *
 * Neden `/embed` gömülebilir: içeriği jetonla sınırlı, salt okunur ve zaten
 * herkese açık bir paylaşımın aynısı. Gömen sitenin göremeyeceği bir şey
 * yok; oturum çerezi de kullanılmıyor.
 */
export const FRAMEABLE_PREFIXES: readonly string[] = ["/embed"];

export function isFrameable(pathname: string): boolean {
  return FRAMEABLE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

/**
 * Bir yola konacak çerçeveleme başlıkları.
 *
 * `Content-Security-Policy: frame-ancestors` modern tarayıcılarda geçerli
 * olan; `X-Frame-Options` eski tarayıcılar için. İkisi birlikte veriliyor,
 * ama gömülebilir yolda `X-Frame-Options` HİÇ verilmiyor — çünkü o başlığın
 * "herkese izin ver" değeri yok. `ALLOWALL` diye bir değer standartta
 * bulunmuyor; verirsek bazı tarayıcılar geçersiz sayıp yok sayar, bazıları
 * DENY'a düşer ve gömme sessizce çalışmaz.
 */
export function frameHeaders(pathname: string): Record<string, string> {
  if (isFrameable(pathname)) {
    return { "Content-Security-Policy": "frame-ancestors *" };
  }
  return {
    "Content-Security-Policy": "frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
  };
}
