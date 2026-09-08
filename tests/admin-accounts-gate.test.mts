/**
 * OPERATÖR HESAP UCU + PANELİ — kapı.
 *
 * Bu uç, oturumu olmayan bir çağırana hesap silme yetkisi veriyor ve artık
 * ikisi de mümkün: 30 günlük beklemeye alma ve KALICI silme. Böyle bir
 * kapının özellikleri pazarlık dışıdır:
 *
 *   1. SINIR OPERATÖRLÜK OLMALI, oturum değil. Bu uygulamada her kurucu kendi
 *      ağacının yöneticisi; `canManage` ile korunsaydı "her kurucu herkesin
 *      hesabını silebilir" demek olurdu.
 *   2. SIR YOKSA KAPALI DÜŞMELİ. "Sır tanımsızsa serbest" davranışı, tek bir
 *      yapılandırma hatasını "bütün hesaplar silinebilir"e çevirirdi.
 *   3. KALICI SİLME AD TEYİDİ İSTEMELİ. Şifre burada sorulamıyor (sırrı
 *      taşıyan operatör hedefin şifresini bilmiyor), yani geriye kalan tek
 *      koruma "ne yaptığının farkında mısın" sorusu. `accountId` listeden
 *      kopyalanan opak bir dize; yanlış satırı kopyalamak sessiz bir hata,
 *      ve bu kipte geri alma YOK.
 *   4. PANEL SIRRI DİSKE YAZMAMALI. Tarayıcı deposuna yazılan bir operatör
 *      sırrı, o makineye erişen herkesin eline geçer — sırrın bütün anlamı
 *      odur.
 *
 * Bunların hiçbiri derlemeyi kırmadan geri alınabilir; kilit kaynak düzeyinde.
 */
import { readFileSync, existsSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın ihlali (ya da kanıtı) değildir. */
const kodu = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const YOL = "app/api/admin/accounts/route.ts";
const src = kodu(readFileSync(YOL, "utf8"));
const panel = kodu(readFileSync("app/admin/accounts/AccountsClient.tsx", "utf8"));
const sayfa = kodu(readFileSync("app/admin/accounts/page.tsx", "utf8"));

/** `export async function <M>(` gövdesi — bir sonraki dışa aktarıma kadar. */
function govde(m: string): string {
  const i = src.indexOf(`export async function ${m}(`);
  if (i < 0) return "";
  const sonraki = ["GET", "POST", "PUT", "PATCH", "DELETE"]
    .map((x) => src.indexOf(`export async function ${x}(`, i + 10))
    .filter((x) => x > -1);
  return src.slice(i, sonraki.length ? Math.min(...sonraki) : undefined);
}
const get = govde("GET");
const post = govde("POST");

/* --- 0) Uç TAŞINDI, eski yol kalmadı ------------------------------------ */

check(existsSync(YOL), "uç yeni yolunda");
check(!existsSync("app/api/admin/retire-account/route.ts"), "eski `retire-account` yolu kaldırılmış");
check(get.length > 0 && post.length > 0, "GET (liste) ve POST (silme) birlikte var");

/* --- 1) Sınır operatörlük ------------------------------------------------ */

check(src.includes("CRON_SECRET"), "sır tabanlı yetki kullanılıyor");
check(/Bearer \$\{secret\}/.test(src), "Bearer başlığıyla karşılaştırılıyor");
// Oturum tabanlı kapı KULLANILMAMALI: bu uygulamada her kurucu yöneticidir.
for (const yasak of ["canManage", "resolveActiveTree", "await auth()", "isFounder"]) {
  check(!src.includes(yasak), `oturum tabanlı kapı kullanılmıyor: ${yasak}`);
}
/*
 * Sır yalnız BAŞLIKTA taşınır. Sorgu dizesine düşen bir sır sunucu
 * günlüklerine, tarayıcı geçmişine ve `Referer` başlığına yazılır.
 */
check(!/searchParams\.get\(["'](secret|token|key)["']\)/.test(src), "sır sorgu dizesinden okunmuyor");

/* --- 2) Sır yoksa KAPALI düşüyor ----------------------------------------- */

check(/if \(!secret\) return false;/.test(src), "sır yoksa yetki reddediliyor");
check(/status: 503/.test(src), "sır tanımsızsa uç kapalı düşüyor (503)");
/*
 * Kapı HER İKİ yöntemin İLK satırında. Dosyada "bir yerde denetim var"
 * demek yetmez: `/api/account/email`de kapı GET'te vardı, POST'ta yoktu ve
 * o günün testi dosyaya bakıp yeterli saymıştı.
 */
for (const [ad, g] of [["GET", get], ["POST", post]] as const) {
  check(
    /^export async function \w+\(req: NextRequest\) \{\s*const kapali = kapi\(req\);\s*if \(kapali\) return kapali;/.test(g),
    `${ad} ilk satırda kapıdan geçiyor`
  );
}

/* --- 3) İki kip, VARSAYILAN YOK ------------------------------------------ */

check(/mode !== "soft" && mode !== "purge"/.test(post), "tanınmayan kip reddediliyor");
/*
 * `mode` varsayılana DÜŞMEMELİ. `purge`a düşen bir varsayılan felaket;
 * `soft`a düşen bir varsayılan yazım hatasını yutar ve operatör "hemen
 * sildim" sanırken hesap ayakta kalır.
 */
check(!/mode\s*(\?\?|\|\|)\s*["']/.test(post), "kip için sessiz varsayılan yok");

/* --- 4) KALICI silme ad teyidi olmadan çalışmıyor ------------------------ */

check(/import \{[^}]*confirmMatches[^}]*\} from "@\/lib\/retention"/.test(src),
  "onay karşılaştırması depodaki tek kaynaktan (confirmMatches)");
check(!/function confirmMatches/.test(src), "ikinci bir karşılaştırma yazılmamış");
const iConfirm = post.indexOf("confirmMatches(");
const iPurge = post.indexOf("purgeAccount(");
check(iConfirm > -1 && iPurge > -1 && iConfirm < iPurge, "ad teyidi kalıcı silmeden ÖNCE");
check(/if \(!confirmMatches\([\s\S]{0,240}?status: 400/.test(post), "teyit tutmazsa 400 ile duruyor");
/*
 * Teyit `purge` dalının İÇİNDE olmalı — dal dışına çıkarsa yumuşak silme de
 * ad ister, o zaman ilk gevşetme isteği teyidi tümden kaldırmaya gider.
 */
check(post.indexOf('if (mode === "purge")') > -1 && post.indexOf('if (mode === "purge")') < iConfirm,
  "teyit yalnız purge dalında");

/* --- 5) Silme sırası buraya yazılmamış ----------------------------------- */

check(/import \{[^}]*purgeAccount[^}]*\} from "@\/lib\/account-lifecycle"/.test(src),
  "kalıcı silme lib/account-lifecycle'daki sıradan geçiyor");
// Kendi silme sırası YOK: "önce depolama, kimlik en son" tek yerde çözülmüş.
for (const yasak of ["purgeTree(", "purgeTreeStorage(", "deleteUserRow(", "dbDelete", "del("]) {
  check(!src.includes(yasak), `uç kendi silme sırasını yazmıyor: ${yasak}`);
}

/* --- 6) Demo HER İKİ kipte de reddediliyor -------------------------------- */

check(src.includes("DEMO_USER_ID"), "demo kimliği denetleniyor");
check(/from "@\/lib\/demo-id"/.test(src), "demo kimliği sabitten geliyor");
{
  const iDemo = post.indexOf("DEMO_USER_ID");
  const iKip = post.indexOf('mode !== "soft"');
  const iSoft = post.indexOf("softDeleteAccount(");
  check(iDemo > -1 && iDemo < iKip, "demo denetimi kip dallanmasından ÖNCE");
  check(iDemo < iPurge && iDemo < iSoft, "demo denetimi her iki silme çağrısından ÖNCE");
}

/* --- 7) Kısmi başarısızlık yutulmuyor ------------------------------------ */

check((post.match(/status: 207/g) ?? []).length >= 2, "her iki kip de kısmi başarıyı 207 ile bildiriyor");
check(/failed: r\.failed|failed: \[\]|\.\.\.govde, failed/.test(post), "silinemeyen yollar yanıtta");
check(/failed/.test(panel), "panel silinemeyen yolları gösteriyor");

/* --- 8) GET yalnız OKUR --------------------------------------------------- */

// Listeleme ucu yazamamalı: adres çubuğundan tetiklenemese bile (başlık
// gerekiyor), okuyan bir uca silme koymak kazayla çağrılabilir bir silme demek.
for (const yasak of ["purgeAccount(", "softDeleteAccount(", "setUserDeletedAt("]) {
  check(!get.includes(yasak), `GET yazmıyor: ${yasak}`);
}
check(/allTreeIds\(/.test(get), "liste ağaç kimliklerini veriyor");
check(/treeCount/.test(get) && /treeIds/.test(get), "ağaç sayısı ve kimlikleri dönüyor");
// Operatör listesinde maskeleme YOK — çağıran zaten sırra sahip.
/*
 * Alan SONUNDAKİ virgül şart: `u.familyName.slice(0, 2) + "***"` mutasyonu
 * virgülsüz kalıbı geçiyordu — yani maskeleme geri gelebiliyordu.
 */
check(/familyName: u\.familyName,/.test(get), "aile adı maskelenmeden dönüyor");

/* --- 9) Oturumsuz listede değil ------------------------------------------ */

const routes = kodu(readFileSync("lib/public-routes.ts", "utf8"));
check(!routes.includes("admin/accounts"), "uç oturumsuz listede DEĞİL");
check(!routes.includes("/admin"), "yönetim yolları oturumsuz listede DEĞİL");

/* --- 10) İz bırakıyor ----------------------------------------------------- */

check(/console\.(warn|error)\(/.test(post), "silme kayda geçiyor");
{
  // Kalıcı silme İZİ, silmeden önce düşmeli: işlem yarıda kalsa da "denendi".
  const iLog = post.indexOf("console.warn");
  check(iLog > -1 && iLog < iPurge, "kalıcı silme kaydı silme çağrısından önce yazılıyor");
  check((post.match(/console\.warn\(/g) ?? []).length >= 2, "her iki kip de ayrı ayrı kayda geçiyor");
}

/* --- 11) PANEL: sır tarayıcı deposuna YAZILMIYOR -------------------------- */

for (const dosya of [["AccountsClient.tsx", panel], ["page.tsx", sayfa]] as const) {
  for (const yasak of ["localStorage", "sessionStorage", "document.cookie", "indexedDB"]) {
    check(!dosya[1].includes(yasak), `${dosya[0]}: sır ${yasak}'a yazılmıyor`);
  }
}
check(/useState\(""\)/.test(panel) && /const \[secret, setSecret\] = useState/.test(panel),
  "sır yalnız bellekte (React durumu)");
check(/Authorization: `Bearer \$\{secret\}`/.test(panel), "sır Authorization başlığında taşınıyor");
check(!/fetch\(\s*`?\/api\/admin\/accounts\?[^"'`]*secret/.test(panel), "sır adres çubuğuna düşmüyor");
check(/type="password"/.test(panel), "sır alanı gizli yazılıyor");

/* --- 12) PANEL: kalıcı silme kilidi --------------------------------------- */

check(/from "@\/lib\/retention"/.test(panel) && panel.includes("confirmMatches("),
  "panel de aynı karşılaştırmayı kullanıyor (sunucuyla ayrışmasın)");
check(/kip === "purge" && !confirmMatches\(/.test(panel), "kilit yalnız kalıcı silmede ve ada bağlı");
check(/disabled=\{calisiyor \|\| kilitli\}/.test(panel), "düğme kilit açılana kadar etkisiz");
check(/kip === "purge" && \(/.test(panel), "onay alanı yalnız \"Hemen sil\" seçiliyken beliriyor");
/*
 * Geri alınamazlık GÖRÜNÜR METİNDE olmalı. `title` yalnız fareyle üstünde
 * durana açılır; dokunmatikte ve klavyeyle gezen kullanıcıda hiç görünmez.
 */
check(/>\s*Bu işlem geri alınamaz\./.test(panel), "geri alınamazlık görünür metinde");
check(!/title="[^"]*geri alınamaz/i.test(panel), "uyarı ipucu balonuna gizlenmemiş");
check(/checked=\{kip === "soft"\}/.test(panel), "varsayılan kip 30 gün beklemek");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
