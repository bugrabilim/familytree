import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * KAPI: kurtarma koduyla sıfırlama.
 *
 * Kod artık TEK BAŞINA bir şifre sıfırlama sırrı — ağaç adı sorulmuyor.
 * Bunun ayakta durduğu dört kural var ve dördü de sessizce delinebilir:
 *
 *  1. İndeks yalnız SATIRI BULUR; asıl doğrulamayı bcrypt yapar. Bcrypt
 *     kaldırılırsa tuzsuz tek turlu SHA-256 kimlik doğrulama katmanı olur.
 *  2. Uç sınırlı — IP'nin yanında KOD BAŞINA da. 80 bitlik bir sırrı sınırsız
 *     denemeye açmak çevrimiçi kaba kuvvet demek.
 *  3. Tek hata mesajı: "kod yanlış" ile "hesap yok" ayrılırsa uç hesap
 *     numaralandırma aracına döner.
 *  4. İndeksi olmayan ESKİ hesaplar ağaç adıyla bulunmaya DEVAM ETMELİ —
 *     yoksa kodunu kâğıda yazmış eski kullanıcılar kilitlenir.
 *
 * Rota mantığı birim testi edilemiyor (Blob/bcrypt bağımlı), o yüzden sınırın
 * doğru katmanda durduğu kaynaktan doğrulanıyor.
 */

/** Olumsuz iddialardan önce yorumlar ayıklanır: yasak deseni ANLATAN yorum
 *  desenin kendisiyle eşleşiyor. */
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const rotaHam = read("../app/api/reset-password/route.ts");
const rota = kodu(rotaHam);
const users = kodu(read("../lib/users.ts"));
const lib = kodu(read("../lib/recovery-code.ts"));
const kayit = kodu(read("../app/api/register/route.ts"));
const mobil = kodu(read("../app/api/mobile/register/route.ts"));
const sayfa = kodu(read("../app/forgot-password/page.tsx"));
const tipler = read("../types/user.ts");

/* --- 1. İki katman: indeks bulur, bcrypt doğrular --------------------- */

check(rota.includes("findUserByRecoveryIndex"), "rota hesabı indeksten buluyor");
check(/compare\(aday, user\.recoveryCodeHash\)/.test(rota), "bcrypt doğrulaması DURUYOR");
check(/planRecoveryLookup/.test(rota), "arama kararı saf katmanda");
{
  // Sıra: önce indeks, sonra (ad verildiyse) eski yol.
  const i = rota.indexOf("findUserByRecoveryIndex");
  const a = rota.indexOf("findUserByFamilyName(plan.familyName)");
  check(i > 0 && a > i, "indeks aramasi ad aramasından ÖNCE");
}
{
  // bcrypt, kullanıcı bulunduktan SONRA ve dönüşten ÖNCE çalışmalı.
  const c = rota.indexOf("compare(aday");
  const g = rota.indexOf("if (!gecerli) return reddet();");
  const h = rota.indexOf("await applyRecoveryReset");
  check(c > 0 && g > c && h > g, "geçersiz kod şifreyi yazmadan önce reddediliyor");
}
check(!/recoveryCodeIndex\s*===\s*plan\.index/.test(rota),
  "rota indeks eşitliğini TEK doğrulama olarak kullanmıyor");

/* --- 2. Sınırlar ------------------------------------------------------ */

check(rota.includes("rateLimitShared"), "uç sınırlı");
{
  const anahtarlar = [...rota.matchAll(/rateLimitShared\(`([^`]+)`/g)].map((m) => m[1]);
  check(anahtarlar.length >= 2, `iki katman sınır var (${anahtarlar.length})`);
  check(anahtarlar.some((k) => k.includes("ipOf(req)")), "IP başına sınır");
  check(anahtarlar.some((k) => k.includes("plan.index")), "KOD başına sınır");
}

/* --- 3. Ayırt edilemeyen yanıt ---------------------------------------- */
{
  /*
   * 401 dönen bütün dallar AYNI gövdeyi kullanmalı. Mesaj tek bir sabitte
   * toplandığı için dalların ayrışması mümkün olmasın.
   */
  check(rota.includes("const reddet = ()"), "tek reddetme yardımcısı var");
  check((rota.match(/return reddet\(\);/g) ?? []).length >= 3, "bütün reddetme dalları aynı yardımcıyı çağırıyor");
  check(!/hesap bulunamadı|böyle bir hesap/i.test(rota), "hesap yokluğu ayrı mesajla söylenmiyor");
}
check((rotaHam.match(/status: 401/g) ?? []).length === 1, "401 tek yerden dönüyor");

/* --- 4. Eski hesapların yolu korunuyor -------------------------------- */

check(rota.includes("findUserByFamilyName"), "ağaç adıyla bulma YOLU DURUYOR (indekssiz eski hesaplar)");
check(!/if \(!familyName/.test(rota), "ağaç adı ZORUNLU değil");
check(/if \(!recoveryCode \|\| !newPassword\)/.test(rota), "kod ve yeni şifre hâlâ zorunlu");
check(/recoveryCodeIndex\?: string/.test(tipler), "indeks alanı İSTEĞE BAĞLI (eski kayıtlarda yok)");
check(/planRecoveryLookup[\s\S]*?familyName: ad \|\| null/.test(lib), "plan adı isteğe bağlı taşıyor");

/* --- 5. Fırsat varken indeks doldurma (kod yenileme) ------------------ */

check(rota.includes("issueRecoveryCode"), "başarılı sıfırlamada yeni kod üretiliyor");
check(/recoveryCodeIndex: yeni\.index/.test(rota), "yeni kodun indeksi yazılıyor (eski hesap yeni düzene geçiyor)");
check(/recoveryCodeHash: yeni\.hash/.test(rota), "kullanılan eski kod düşüyor");
check(/user\.resetTokenHash = undefined/.test(users), "başarılı sıfırlamada bekleyen jeton düşüyor");

/* --- 6. Benzersizlik ve tek üretim yeri ------------------------------- */

check(users.includes("pickUniqueRecoveryCode"), "üretim benzersizlik denetiminden geçiyor");
/*
 * Denetim DEPODAKİ indekslere karşı yapılmalı. Boş bir kümeyle çağırmak,
 * işlevi çağırmış gibi görünüp benzersizliği hiç denetlememek olurdu.
 */
check(/pickUniqueRecoveryCode\(kullanilan\)/.test(users), "denetim depodaki indekslere karşı");
check(/users\.map\(\(u\) => u\.recoveryCodeIndex\)/.test(users), "kullanılan indeksler depodan okunuyor");
check(/export async function issueRecoveryCode/.test(users), "üretim TEK yerde");
for (const [ad, src] of [["web kayıt", kayit], ["mobil kayıt", mobil]] as const) {
  check(src.includes("issueRecoveryCode"), `${ad} ortak üreticiyi çağırıyor`);
  check(!/function generateRecoveryCode/.test(src), `${ad} kendi kopyasını taşımıyor`);
  check(!/Math\.random/.test(src), `${ad} Math.random kullanmıyor (kimlik doğrulama sırrı)`);
  // İndeks YAZILMAZSA yeni hesaplar da eski düzende kalır: kod tek başına
  // hesabı bulamaz ve ağaç adı yeniden zorunlu hâle gelirdi.
  check(/createUser\([\s\S]{0,200}kurtarma\.index/.test(src), `${ad} indeksi kayda yazıyor`);
}
check(!/Math\.random/.test(lib), "kod üretimi kriptografik üreteçle");
check(/randomInt/.test(lib), "randomInt kullanılıyor");

/* --- 7. Depo katmanı --------------------------------------------------- */

check(/u\.recoveryCodeIndex && timingSafeEqualHex\(u\.recoveryCodeIndex, index\)/.test(users),
  "indeks araması sabit süreli ve boş indeksi eşleştirmiyor");
check(/if \(!index\) return null;/.test(users), "boş indeksle arama yapılmıyor");

/* --- 8. Saf katman birim testi edilebilir kalmalı ---------------------- */

check(!/from "@\//.test(lib), "recovery-code.ts çalışma-zamanı @/ içe aktarımı taşımıyor");
check(/toLocaleUpperCase\("en"\)/.test(lib), "yerel AÇIKÇA en (Türkçe I tuzağı)");
check(!/[^e]\.toUpperCase\(\)/.test(lib) && !/\.toLowerCase\(\)/.test(lib), "yerelsiz büyük/küçük harf çevrimi yok");

/* --- 9. Arayüz ---------------------------------------------------------- */

check(/required=\{yol === "eposta"\}/.test(sayfa), "ağaç adı yalnız e-posta yolunda zorunlu");
check(sayfa.includes("forgot.treeNameOptional") && sayfa.includes("forgot.nameOptionalNote"),
  "kod yolunda alan 'isteğe bağlı' diye işaretli ve notu var");
check(!sayfa.includes("forgot.bothNeedName"), "artık 'iki yolda da ad gerekir' denmiyor");
check(sayfa.includes("forgot.emailNeedsName"), "e-posta yolunda ad gerekliliği hâlâ söyleniyor");
check(sayfa.includes("forgot.newCodeTitle"), "yeni kurtarma kodu kullanıcıya gösteriliyor");
{
  // E-posta yolu ADSIZ istek göndermemeli — orada hesabı bulmanın başka yolu yok.
  check(/if \(!familyName\.trim\(\)\)/.test(sayfa), "e-posta yolu boş adı erkenden reddediyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
