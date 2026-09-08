import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * KAPI: kimlik ve şifrenin Supabase Auth'a yazılması ARTIK BEST-EFFORT DEĞİL
 * (Faz 4 / 1a).
 *
 * Faz 4'te bcrypt yedeği kalkıyor: giriş yalnız Supabase Auth'tan
 * doğrulanacak. O yedek, bugün üç ayrı sessiz düşüşün ağıydı ve ağ çekilince
 * her biri gerçek bir arızaya dönüşüyor:
 *
 *  1. KAYIT — `createUser` içindeki içe aktarma düşerse hesap yalnız
 *     users.json'da doğar. Bcrypt'siz o hesaba HİÇ girilemez, üstelik bu
 *     ancak kullanıcı giriş denediğinde anlaşılır.
 *  2. SIFIRLAMA — Auth'a yazılamayan yeni şifre, Auth'ta ESKİ şifreyi
 *     bırakır. Giriş önce Auth'u denediği için (SUPABASE_AUTH_LOGIN) eski
 *     şifreyi bilen girmeye DEVAM eder: kullanıcıya "sıfırlandı" denmiş,
 *     saldırgan dışarı atılmamıştır. Bu, bcrypt'ten bağımsız olarak BUGÜN
 *     de bir açık.
 *  3. SIRA — yazma yerelde önce yapılırsa, Auth düştüğünde geri alınamayan
 *     bir yarım durum kalır. Önce Auth, sonra yerel: Auth düşerse yerelde
 *     hiçbir şey değişmemiş olur.
 *
 * Rota mantığı birim testi edilemiyor (Blob/Supabase/bcrypt bağımlı), o
 * yüzden kural kaynaktan doğrulanıyor.
 */

/** Olumsuz iddialardan önce yorumlar ayıklanır: yasak deseni ANLATAN yorum
 *  desenin kendisiyle eşleşiyor. */
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const authHam = read("../lib/auth-users.ts");
const auth = kodu(authHam);
const users = kodu(read("../lib/users.ts"));
const kodRota = kodu(read("../app/api/reset-password/route.ts"));
const jetonRota = kodu(read("../app/api/reset-password/token/route.ts"));

/* --- 1. Zayıf kapı kaldırıldı ---------------------------------------- */

check(
  !auth.includes("updateAccountAuthPassword"),
  "best-effort `updateAccountAuthPassword` KALDIRILDI (ikinci, zayıf kapı bırakılmıyor)"
);
check(auth.includes("export async function syncAccountAuthPassword"), "yerine kanıtlayan senkron var");

/* --- 2. Senkron kanıtlayamadığına 'oldu' demiyor ---------------------- */

{
  const g = auth.slice(auth.indexOf("export async function syncAccountAuthPassword"));
  const govde = g.slice(0, g.indexOf("\n}\n") + 3);
  check(/if\s*\(!isSupabaseConfigured\(\)\s*\|\|\s*!isUuid\(account\.id\)\)\s*return "atlandi"/.test(govde),
    "Supabase yoksa / kimlik UUID değilse atlanıyor (kendi kendine kesinti yok)");
  check(/updateUserById\(/.test(govde), "önce mevcut kaydın şifresi güncelleniyor");
  check(/importAccountToAuth\(account\)/.test(govde), "kayıt yoksa ONARILIYOR (bir kez düşmüş içe aktarma hesabı kilitlemesin)");
  {
    // Biçimden bağımsız: "exists" dalında İLK gelen anahtar sözcük `throw`
    // olmalı. Yalnız "yakınında bir throw var" demek yetmez — mutasyon
    // `return "onarildi"` koyduğunda bir sonraki satırdaki throw'a bakıp
    // testi yeşil bırakıyordu.
    const i = govde.indexOf('=== "exists"');
    const at = govde.indexOf("throw", i);
    const don = govde.indexOf("return", i);
    check(i > -1 && at > -1 && (don === -1 || at < don),
      "'zaten var' FIRLATIYOR — id ile yazılamadıysa şifrenin yazıldığı kanıtlanamaz");
  }
  check((govde.match(/throw new Error/g) || []).length >= 3, "gerçek hatalar yutulmuyor, fırlatılıyor");
  check(!/catch\s*\{\s*\}/.test(govde) && !/console\.warn/.test(govde),
    "senkronun içinde sessiz yutma yok");
}

/* --- 3. Kayıt: önce Auth, sonra users.json; hata kaydı iptal eder ----- */

{
  const g = users.slice(users.indexOf("export async function createUser"));
  const govde = g.slice(0, g.indexOf("\n}\n") + 3);
  const iceAktar = govde.indexOf("importAccountToAuth");
  const yaz = govde.indexOf("saveUsersData");
  check(iceAktar > -1 && yaz > -1 && iceAktar < yaz,
    "içe aktarma users.json yazmasından ÖNCE (düşerse ad rezerve kalmasın)");
  check(/importAccountToAuth[\s\S]{0,300}throw new Error/.test(govde),
    "içe aktarma düşerse kayıt FIRLATIYOR — girilemeyen hesap doğmuyor");
  check(!/try\s*\{\s*await importAccountToAuth/.test(govde),
    "içe aktarma try/catch ile yutulmuyor");
  check(/isSupabaseConfigured\(\)\s*&&\s*isUuid\(user\.id\)/.test(govde),
    "kural yalnız Supabase'li kurulumlarda ve UUID kimliklerde işliyor");
}

/* --- 4. Sıfırlama (kurtarma kodu): önce Auth, sonra yerel ------------- */

{
  const senk = kodRota.indexOf("syncAccountAuthPassword(");
  const yerel = kodRota.indexOf("applyRecoveryReset(");
  check(senk > -1, "kurtarma kodu yolu kanıtlayan senkronu çağırıyor");
  check(senk < yerel, "Auth yazması yerel yazmadan ÖNCE");
  check(/catch[\s\S]{0,400}status:\s*503/.test(kodRota.slice(senk, yerel)),
    "senkron düşerse 503 ile dönülüyor");
  check(!/applyRecoveryReset/.test(kodRota.slice(senk, kodRota.indexOf("status: 503"))),
    "503 yolunda yerel yazma YOK — hesapta hiçbir şey değişmiyor");
}

/* --- 5. Sıfırlama (e-posta jetonu): aynı sıra ------------------------- */

{
  const senk = jetonRota.indexOf("syncAccountAuthPassword(");
  const yerel = jetonRota.indexOf("updateUserPassword(");
  check(senk > -1, "jeton yolu kanıtlayan senkronu çağırıyor");
  check(senk < yerel, "Auth yazması yerel yazmadan ÖNCE");
  check(/catch[\s\S]{0,400}status:\s*503/.test(jetonRota.slice(senk, yerel)),
    "senkron düşerse 503 ile dönülüyor");
}

/* --- 6. Onarım YENİ hash ile ------------------------------------------
 *
 * Onarım yolu `account.passwordHash`i kullanıyor. Rotalar oraya hesabın
 * DEPODAKİ (eski) hash'ini geçerse, Auth kaydı ESKİ şifreyle doğar ve
 * kapatmaya çalıştığımız açık — sıfırlamadan sonra eski şifrenin geçerli
 * kalması — aynen sürer. Bu yüzden iki rota da yeni hash'i geçmek zorunda.
 */

for (const [ad, src] of [["kurtarma kodu", kodRota], ["jeton", jetonRota]] as const) {
  const i = src.indexOf("syncAccountAuthPassword(");
  check(/passwordHash:\s*newPasswordHash/.test(src.slice(i, i + 200)),
    `${ad}: onarım YENİ hash ile (eski şifreyle Auth kaydı doğmuyor)`);
}

/* --- 6. Kullanıcıya doğru şey söyleniyor ------------------------------ */

for (const [ad, src] of [["kurtarma kodu", kodRota], ["jeton", jetonRota]] as const) {
  check(/hiçbir şey değişmedi/.test(src), `${ad}: 503 mesajı "değişmedi" diyor (kullanıcı boşuna yeni şifre aramasın)`);
}

console.log(`${ok} ok, ${fail} fail`);
if (fail) process.exit(1);
