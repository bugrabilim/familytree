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
export const PUBLIC_EXACT: readonly string[] = ["/", "/favicon.ico"];

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
