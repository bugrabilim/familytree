import { hasBearerApi, isPublicPath, PUBLIC_PREFIXES, frameHeaders, isFrameable } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (got === want) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
const pub = (p: string) => check(isPublicPath(p), `açık olmalı: ${p}`);
const prot = (p: string) => check(!isPublicPath(p), `KORUNMALI: ${p}`);

/* --- Statik varlıklar ---------------------------------------------------- */
// Korumaya takılırsa <img>/font istekleri /login'e yönlenir, sayfa bozulur.
for (const p of [
  "/logo.png", "/og.jpg", "/icon.svg", "/f.woff2", "/robots.txt",
  "/sitemap.xml", "/site.webmanifest", "/tanitim/a.WEBP",
]) pub(p);
prot("/api/family/export");        // uzantısız
prot("/notes.pdf");                // listede olmayan uzantı

/* --- Herkese açık sayfalar ve uçlar -------------------------------------- */
for (const p of [
  "/", "/favicon.ico",
  "/tanitim", "/privacy", "/terms", "/login", "/register", "/forgot-password",
  "/api/auth/session", "/api/auth/callback/credentials",
  "/api/register", "/api/reset-password",
  "/api/mobile/login", "/api/mobile/register",
  "/join/abc123", "/api/tree/join",
  "/g", "/g/tok3n",
  "/_next/static/chunks/main.js",
]) pub(p);

/* --- Ölçüm betikleri ----------------------------------------------------- */
// Bunlar izin listesinde yokken oturumsuz her istekte /login'e 307 dönüyordu;
// tarayıcı HTML'i betik diye ayrıştırıp hata veriyor, Vercel Analytics ve
// Speed Insights açılış/tanıtım/paylaşım sayfalarında hiç çalışmıyordu.
pub("/_vercel/insights/script.js");
pub("/_vercel/speed-insights/script.js");

/* --- Korunan yollar ------------------------------------------------------ */
for (const p of [
  "/tree", "/person/abc", "/p/tree1", "/admin/migrate",
  "/api/family", "/api/family/person", "/api/upload", "/api/trees",
  "/api/ai/chat", "/api/tree/share", "/api/tree/access", "/api/cron/reminders",
]) prot(p);

/* --- Önek tuzağı --------------------------------------------------------- */
// Çıplak `startsWith` bunların hepsini açardı. Eşleşme ya tam ya da "/" ile
// devam etmeli; yoksa uydurma bir yol izin listesini deler.
for (const p of [
  "/login-sahte", "/loginx", "/registerX", "/tanitimm",
  "/gizli", "/joined", "/api/authorize", "/_nextjs",
  "/api/registered", "/_vercelx",
]) prot(p);
// Aynı tuzağın ters yönü: gerçek alt yollar açık kalmalı.
for (const p of PUBLIC_PREFIXES) { pub(p); pub(p + "/alt/yol"); }

/* --- /pair: tek segment açık, derini kapalı ------------------------------ */
// Davet kabul sayfası giriş yönlendirmesini kendi yönetir, ama
// /pair/compare/<treeId> gerçek veri gösterir ve oturum ister.
pub("/pair");
pub("/pair/tok3n");
prot("/pair/compare/tree1");
prot("/pair/a/b");

/* --- Bearer geçişi ------------------------------------------------------- */
check(hasBearerApi("/api/family", "Bearer abc"), "API + Bearer geçer");
check(!hasBearerApi("/api/family", null), "API, başlıksız geçmez");
check(!hasBearerApi("/api/family", "Basic abc"), "Basic geçmez");
check(!hasBearerApi("/api/family", "bearer abc"), "küçük harf 'bearer' geçmez");
// Sayfa isteğinde bir başlık kimlik yerine geçmez: yönlendirme yerine ham
// HTML dönerdi ve koruma anlamsızlaşırdı.
check(!hasBearerApi("/tree", "Bearer abc"), "sayfa isteği Bearer ile geçmez");

/* --- Çerçeveleme (iframe) politikası ------------------------------------- */
/*
 * Bu depoda daha önce HİÇBİR çerçeveleme koruması yoktu: oturum açmış
 * kullanıcının `/tree` sayfası herhangi bir sitenin iframe'ine gömülebiliyor
 * ve tıklama kaçırmaya açık duruyordu. Varsayılan artık REDDET; `/embed` tek
 * istisna. Bu testin işi o istisnanın DAR kalmasını sağlamak.
 */
check(isFrameable("/embed"), "/embed gömülebilir");
check(isFrameable("/embed/tok3n"), "/embed/<jeton> gömülebilir");
check(!isFrameable("/embedded"), "önek benzeri yol gömülemez");
check(!isFrameable("/embed-sahte"), "tire ile uzayan yol gömülemez");
check(!isFrameable("/tree"), "ağaç sayfası gömülemez");
check(!isFrameable("/g/tok3n"), "paylaşım sayfası gömülemez");
check(!isFrameable("/"), "ana sayfa gömülemez");
check(!isFrameable("/api/family"), "API gömülemez");

{
  const korumali = frameHeaders("/tree");
  eq(korumali["X-Frame-Options"], "DENY", "korumalı yolda X-Frame-Options DENY");
  eq(korumali["Content-Security-Policy"], "frame-ancestors 'none'", "korumalı yolda frame-ancestors none");

  const gomulebilir = frameHeaders("/embed/tok3n");
  eq(gomulebilir["Content-Security-Policy"], "frame-ancestors *", "gömülebilir yolda frame-ancestors *");
  /*
   * `X-Frame-Options` HİÇ verilmemeli: o başlığın "herkese izin ver" değeri
   * yok. `ALLOWALL` standartta bulunmuyor; verirsek bazı tarayıcılar
   * geçersiz sayıp yok sayar, bazıları DENY'a düşer ve gömme sessizce
   * çalışmaz.
   */
  check(!("X-Frame-Options" in gomulebilir), "gömülebilir yolda X-Frame-Options hiç yok");
}

// Gömülebilir yol aynı zamanda oturumsuz da açılabilmeli — yoksa iframe
// /login'e yönlenir ve gömen sitede bir giriş formu belirirdi.
pub("/embed");
pub("/embed/tok3n");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
