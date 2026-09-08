import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * KAPI: kurucunun bcrypt yolu kapandı, ÜYELERİNKİ kapanmadı (Faz 4/1b).
 *
 * Faz 4'ün tek cümlelik iddiası şu: "giriş artık Supabase Auth'tan
 * doğrulanıyor". Bu ancak Auth HAYIR dediğinde girişin de hayır demesi
 * hâlinde doğru. Bcrypt yedeği açık kaldığı sürece Auth asıl kaynak değil,
 * yalnız hızlı bir ön kontroldü: Auth'ta silinen, kilitlenen ya da şifresi
 * değiştirilen bir hesap `users.json`'daki eski hash'le girmeye devam
 * ediyordu.
 *
 * Karşı taraftaki tehlike daha büyük ve sessiz: ÜYELERİN `auth.users`
 * kaydı YOK. Bcrypt'i "giriş yolundan kaldırdık" diye toptan silmek,
 * davetli herkesi aynı anda dışarıda bırakırdı — üstelik kurucu girebildiği
 * için arıza günlerce fark edilmeyebilirdi. Bu yüzden aşağıdaki iddiaların
 * yarısı bir şeyin KALDIĞINI doğruluyor.
 *
 * Bayrakların doğruluk tablosu ayrıca çalıştırılarak sınanıyor
 * (`tests/auth-flags.test.mts`); burada o kararın DOĞRU YERDE uygulandığı
 * denetleniyor.
 */

/** Olumsuz iddialardan önce yorumlar ayıklanır: yasak deseni ANLATAN yorum
 *  desenin kendisiyle eşleşiyor. */
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const cred = kodu(read("../lib/credentials.ts"));
const flags = kodu(read("../lib/auth-flags.ts"));

const govdesi = (src: string, imza: string) => {
  const g = src.slice(src.indexOf(imza));
  return g.slice(0, g.indexOf("\n}\n") + 3);
};
const giris = govdesi(cred, "export async function verifyLogin");
const teyit = govdesi(cred, "export async function verifyFounderPassword");

/* --- 1. Kurucunun bcrypt yolu bayrağın arkasında ---------------------- */

check(
  /isBcryptFallbackEnabled\(\)\s*&&\s*\(await compare\(password, user\.passwordHash\)\)/.test(giris),
  "kurucu bcrypt karşılaştırması bayrağın ARKASINDA"
);
check(
  !/(^|[^&])\s*if \(await compare\(password, user\.passwordHash\)\)/.test(giris),
  "koşulsuz kurucu bcrypt yolu KALMADI"
);

/* --- 2. ÜYE yolları dokunulmadan duruyor ------------------------------ */
/*
 * Üyelerin Auth kaydı yok; bu iki satır giderse davetli hiç kimse giremez.
 */
check(
  /compare\(password, member\.passwordHash\)/.test(giris),
  "adla giriş: üyenin bcrypt doğrulaması DURUYOR"
);
check(
  /await findMemberByPassword\(user\.id, password\)/.test(giris),
  "adsız üye eşleşmesi DURUYOR"
);
/*
 * Kesitler SATIR BAŞINDAN alınıyor. `indexOf` konumundan başlamak yetmiyor:
 * bayrak aynı satırda, çağrının SOLUNA da konabilir
 *   (`isBcryptFallbackEnabled() ? await findMemberByPassword(...) : null`)
 * ve kesit onu görmez. Mutasyon tam bunu yaptı ve test yeşil kaldı.
 */
const satirBasindan = (src: string, imza: string, bitis?: string) => {
  const i = src.indexOf(imza);
  if (i < 0) return "";
  const bas = src.lastIndexOf("\n", i) + 1;
  return bitis ? src.slice(bas, src.indexOf(bitis)) : src.slice(bas);
};

for (const [ad, kesit] of [
  ["adla giriş", satirBasindan(giris, "const uyeAdi", "const founderSession")],
  ["adsız eşleşme", satirBasindan(giris, "findMemberByPassword")],
] as const) {
  check(kesit.length > 0, `${ad}: kesit bulundu`);
  check(!kesit.includes("isBcryptFallbackEnabled"), `${ad} bayrağa BAĞLI DEĞİL (üyeler kilitlenmiyor)`);
  check(!kesit.includes("isSupabaseLoginEnabled"), `${ad} Supabase bayrağına da bağlı değil`);
}

/* --- 3. Sıra: Auth önce, bcrypt sonra, üye en sonda ------------------- */

{
  const a = giris.indexOf("supabaseVerifyPassword");
  const b = giris.indexOf("isBcryptFallbackEnabled");
  const c = giris.indexOf("findMemberByPassword");
  check(a > -1 && a < b && b < c, "sıra: Supabase Auth → bcrypt (yedek) → adsız üye");
}

/* --- 4. Silme/geri alma teyidi aynı kapıdan --------------------------- */
/*
 * Ayrılsalardı girişte reddedilen bir şifre hesabın TAMAMINI silmeye
 * yetebilirdi ve bu, iki ayrı dosyaya bakmadan görülemezdi.
 */
check(teyit.includes("isBcryptFallbackEnabled"), "verifyFounderPassword aynı bayrağa bakıyor");
{
  const b = teyit.indexOf("isBcryptFallbackEnabled");
  const c = teyit.indexOf("compare(password, user.passwordHash)");
  check(b > -1 && c > -1 && b < c, "teyit: bcrypt karşılaştırmasından ÖNCE bayrak denetleniyor");
}
check(!/findMemberByPassword|findMemberByUsername/.test(teyit),
  "teyit üye şifresi kabul etmiyor (davetli ağacı silemez)");

/* --- 5. Kilitlenme imkânsız: bayrak tek başına karar vermiyor --------- */

{
  const g = govdesi(flags, "export function isBcryptFallbackEnabled");
  const kapali = g.indexOf("!isSupabaseLoginEnabled()");
  const env = g.indexOf("process.env.AUTH_BCRYPT_FALLBACK");
  check(kapali > -1 && env > -1 && kapali < env,
    "Supabase girişi kapalıysa bayrak HİÇ okunmadan yedek açık kalıyor");
  check(/if \(!isSupabaseLoginEnabled\(\)\) return true;/.test(g),
    "tek bir değişkeni silmek kurucuları kilitleyemiyor");
}

/* --- 6. Yedek açıkken de eski şifre kabul edilmiyor ------------------- */
/*
 * Acil durum anahtarı, sıfırlamaları geçersiz kılan bir arka kapı OLMAMALI.
 * Bu ancak yerel hash sıfırlamalarda güncelleniyorsa doğru — Faz 4/1a orada
 * duruyor ve kapısı `tests/auth-sync-gate.test.mts`te.
 */
const users = kodu(read("../lib/users.ts"));
check(/user\.passwordHash = patch\.passwordHash/.test(users) && /user\.passwordHash = newPasswordHash/.test(users),
  "yerel hash sıfırlamalarda hâlâ güncelleniyor (yedek açılınca eski şifre dirilmiyor)");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
