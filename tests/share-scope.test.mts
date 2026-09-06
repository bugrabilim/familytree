import { readFileSync } from "node:fs";
import { SHARE_SCOPES, allows, firstAllowed, parseScope, scopeOrAll } from "../lib/share-scope.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
function eq(a: unknown, b: unknown, msg: string) {
  const g = JSON.stringify(a) === JSON.stringify(b);
  if (!g) console.log(`✗ ${msg}\n   beklenen: ${JSON.stringify(b)}\n   gelen:    ${JSON.stringify(a)}`);
  if (g) ok++; else fail++;
}
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1. parseScope ────────────────────────────────────────────────────────── */

/*
 * YOKLUK "HEPSİ" DEMEK, ve bu kaydedilmiyor.
 *
 * "Hepsi"nin İKİ temsili olsaydı (yokluk ve tam liste), okuma yolunun
 * ikisini de bilmesi gerekirdi ve biri unutulurdu — üstelik unutulan yerde
 * sonuç "hiçbiri" gibi davranırdı.
 */
check(parseScope(undefined) === undefined, "alan yoksa kısıt yok");
check(parseScope(null) === undefined, "null → kısıt yok");
check(parseScope("agac") === undefined, "dizi olmayan → kısıt yok");
check(parseScope([...SHARE_SCOPES]) === undefined, "hepsi seçiliyse damga TUTULMUYOR");

eq(parseScope(["agac"]), ["agac"], "tek görünüm");
eq(parseScope(["kitap", "agac"]), ["agac", "kitap"], "kanonik SIRA korunuyor (tıklama sırası değil)");
eq(parseScope(["agac", "agac"]), ["agac"], "yinelenen ayıklanıyor");
eq(parseScope(["agac", "uydurma", 7, null]), ["agac"], "bilinmeyen anahtarlar düşüyor");
eq(parseScope([]), [], "boş seçim BOŞ dönüyor — sessizce 'hepsi'ye çevrilmiyor");
eq(parseScope(["uydurma"]), [], "yalnız bilinmeyen anahtar da boş sayılıyor");

/*
 * Boş seçimin sessizce "hepsi" olmaması kritik: kullanıcı her şeyi
 * KAPATMAK isterken her şeyi AÇAN bir bağlantı üretilirdi — istediğinin tam
 * tersi. Uç bu yüzden boşu reddediyor.
 */

/* ── 2. allows ────────────────────────────────────────────────────────────── */
check(allows(undefined, "agac"), "kısıt yoksa her görünüm açık");
check(allows(null, "kitap"), "null da kısıtsız");
check(allows([], "agac"), "BOŞ liste de kısıtsız (bozuk/eski kayıt boş sayfa üretmesin)");
check(allows(["agac"], "agac"), "seçili görünüm açık");
check(!allows(["agac"], "kitap"), "seçilmeyen görünüm KAPALI");
check(!allows(["agac"], "uydurma"), "bilinmeyen anahtar kapalı");

/* ── 3. scopeOrAll / firstAllowed ────────────────────────────────────────── */
eq(scopeOrAll(undefined), [...SHARE_SCOPES], "yokluk tam listeye açılıyor");
eq(scopeOrAll([]), [...SHARE_SCOPES], "boş liste de tam listeye açılıyor");
eq(scopeOrAll(["kitap", "agac"]), ["agac", "kitap"], "kanonik sıraya diziliyor");
eq(scopeOrAll(["agac", "uydurma"]), ["agac"], "bilinmeyen anahtar süzülüyor");

/*
 * AÇILIŞ SEKMESİ kapsamın ilki. Sabit "agac" olsaydı, ağacı içermeyen bir
 * paylaşım (ör. yalnız kitap) kapsam dışı bir sekmeyle açılır ve ziyaretçi
 * ilk gördüğü şey olarak boş bir ekrana bakardı.
 */
eq(firstAllowed(undefined), "agac", "kısıtsızda varsayılan agac");
eq(firstAllowed(["kitap", "tarifler"]), "kitap", "kısıtlıda ilk açık görünüm");
eq(firstAllowed(["tarifler"]), "tarifler", "tek görünümlü paylaşımda o görünüm");
eq(firstAllowed([]), "agac", "boşta agac");

/* ── 4. Kaynak kapıları ──────────────────────────────────────────────────── */

/*
 * KÜME, SEKMELERLE AYNI OLMALI.
 *
 * `SHARE_SCOPES` ile `VIEW_GROUPS` ayrışırsa sonuç sessiz: burada olmayan
 * bir sekme paylaşımda hiç seçilemez (ve `allows` onu her zaman kapalı
 * sayar), burada olup sekmelerde olmayan bir anahtar da hiçbir şey yapmayan
 * bir kutu olur. İkisi de kimsenin fark etmeyeceği türden.
 */
{
  const topbar = read("../components/TopBar.tsx");
  const i = topbar.indexOf("export const VIEW_GROUPS");
  const blok = topbar.slice(i, topbar.indexOf("];", i));
  const sekmeler = [...blok.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  check(i > -1 && sekmeler.length > 0, "VIEW_GROUPS okundu");
  eq(sekmeler, [...SHARE_SCOPES], "paylaşım kapsamı sekmelerle AYNI küme ve sırada");
}

const rota = kodu(read("../app/api/tree/share/route.ts"));
const dialog = kodu(read("../components/ShareDialog.tsx"));
const sayfa = kodu(read("../app/g/[token]/page.tsx"));
const embed = kodu(read("../app/embed/[token]/page.tsx"));
const api = kodu(read("../app/api/v1/public/tree/route.ts"));

/* Uç boş seçimi REDDEDİYOR — "hepsi"ye çevirmiyor. */
/*
 * İddia HER İKİ gövdeye ayrı ayrı bakıyor. Dosyanın tamamında iki eşleşme
 * saymak, ikisinin de POST'ta olduğu bir düzenlemeyi yeşil bırakırdı.
 */
for (const [ad, govde] of [
  ["POST", rota.slice(rota.indexOf("export async function POST"), rota.indexOf("export async function PATCH"))],
  ["PATCH", rota.slice(rota.indexOf("export async function PATCH"), rota.indexOf("export async function DELETE"))],
] as const) {
  check(/\.length === 0\)/.test(govde), `${ad}: boş seçim reddediliyor`);
  check(/En az bir görünüm seçilmeli/.test(govde), `${ad}: gerekçe söyleniyor`);
  check(/status: 400/.test(govde), `${ad}: 400 dönüyor`);
  check(/parseScope\(body\.scope\)/.test(govde), `${ad}: kapsam saf katmanda çözülüyor`);
}
check(/scope: scopeOrAll\(share\.scope\)/.test(rota), "ekrana HER ZAMAN tam liste gidiyor");
/*
 * PATCH'te `null` ile `undefined` AYRI: gövdede `scope` varsa kullanıcı bir
 * karar vermiştir ve "hepsi" de bir karardır. `undefined`a çevrilseydi eski
 * daraltma sessizce sürerdi.
 */
check(/Array\.isArray\(body\.scope\) \? \(yeniScope \?\? null\) : undefined/.test(rota),
  "PATCH: gövdede scope varsa 'hepsi' de uygulanıyor");

/* Ekran: varsayılan hepsi seçili, boşken oluşturma kapalı. */
check(/useState<string\[\]>\(\[\.\.\.SHARE_SCOPES\]\)/.test(dialog), "kutular varsayılan HEPSİ seçili");
check(/scopeEmpty \|\|/.test(dialog), "boş seçimde oluştur düğmesi kapalı");
check(/scope,/.test(dialog), "kapsam istekle gönderiliyor");
/* Tek kişilik bağlantıda kutular gizli: o bağlantı sekme değil, anma sayfası açıyor. */
check(/\{!single && \(/.test(dialog), "tek kişilik bağlantıda kapsam kutuları gizli");

/* Genel sayfa: sekmeler kapsama göre süzülüyor. */
check(/scopeOrAll\(valid\.share\.scope\)/.test(sayfa), "sayfa kapsamı çözüyor");
check(/allowedViews=\{allowedViews\}/.test(sayfa), "kapsam Workspace'e geçiyor");
/*
 * Taziye verisi kapsam dışıysa HİÇ OKUNMUYOR. Yalnız gizlemek yetmezdi:
 * sunucu bileşeninden istemciye geçen proplar RSC yüküne serileştiriliyor,
 * yani "çizme ama gönder" demek, kapsam dışı bırakılan duyuruları sayfa
 * kaynağında bırakmak olurdu.
 */
check(/allows\(valid\.share\.scope, "taziye"\)\s*\?\s*await readPublicObituaries/.test(sayfa),
  "taziye verisi kapsam dışıysa okunmuyor bile");

/*
 * AYNI KURAL ÖBÜR YÜZEYLERDE DE. Kapsam yalnız `/g/` sayfasında
 * uygulansaydı, aynı jeton `/embed/` ve genel okuma API'sinden aynı veriyi
 * eksiksiz verirdi — ayar bir görünüm tercihine, koruma da yanıltıcı bir
 * vaade dönerdi.
 */
check(/if \(!allows\(valid\.share\.scope, "agac"\)\) return <Invalid \/>;/.test(embed),
  "gömme, ağaç paylaşılmıyorsa kapalı");
check(/!allows\(valid\.share\.scope, "agac"\)/.test(api), "genel okuma API'si de kapsama bakıyor");
check(/status.*403|, 403\)/.test(api), "API kapsam dışı isteği 403 ile reddediyor");

/* Sekme çubuğu: kapsam dışı sekme ÇİZİLMİYOR, tamamı süzülen grup hiç açılmıyor. */
{
  const topbar = kodu(read("../components/TopBar.tsx"));
  check(/\.map\(\(g\) => g\.filter\(\(k\) => allows\(allowedViews, k\)\)\)/.test(topbar),
    "sekmeler kapsama göre süzülüyor");
  check(/\.filter\(\(g\) => g\.length > 0\)/.test(topbar), "boşalan grup hiç çizilmiyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
