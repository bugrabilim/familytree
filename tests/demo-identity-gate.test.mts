import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: DEMO BİR HESAP DEĞİL, BİR VİTRİNDİR.
 *
 * Demo herkese açık, şifresiz, her girişte sıfırlanan bir oyun alanı: ortada
 * doğrulanacak bir kimlik, korunacak bir sır, sahiplenilecek bir veri yok.
 * Eskiden yine de `users.json`a normal bir hesap gibi yazılıyordu — rastgele
 * üretilen, hiçbir yerde saklanmayan bir bcrypt karmasıyla. O satır hiçbir
 * kimlik işlevi görmüyor, yalnız `findUserById(demo)` çağrılarına bir nesne
 * döndürüyordu; bedeli ise Faz 4'ün (`users.json`ın emekliye ayrılması)
 * önünde durmasıydı.
 *
 * Bu dosya kararın İKİ YÜZÜNÜ birden kilitliyor, çünkü ikisi de tek satırlık
 * ve ikisi de "tutarlılık olsun" diye sessizce geri alınabilir:
 *
 *   A. Demo kimlik deposuna YAZILMIYOR ve oradan OKUNMUYOR.
 *   B. Demonun bundan zarar görmemesi gereken davranışları duruyor:
 *      giriş, ağaç sıfırlama, silinemezlik, normal formdan girilememe.
 *
 * Kilit kaynak düzeyinde: bu modüller `@/` çalışma zamanı içe aktarımı
 * taşıdığı için `node --experimental-strip-types` ile birim testi
 * koşulamıyor (bkz. CLAUDE.md).
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: korumayı ANLATAN metin, korumanın kendisi değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const demoHam = read("../lib/demo-account.ts");
const demo = kodu(demoHam);

/* ══ A. DEMO KİMLİK DEPOSUNA DOKUNMUYOR ═════════════════════════════════ */

{
  /*
   * Depoya ne yazma ne okuma. `@/lib/users` içe aktarımının hiç olmaması en
   * dayanıklı kilit: tek tek işlev adı saymak, yarın eklenen bir yenisini
   * kaçırırdı.
   */
  check(!/from "@\/lib\/users"/.test(demo), "lib/users (kimlik deposu) hiç içe aktarılmıyor");
  check(!/createUser\(/.test(demo), "demo için hesap AÇILMIYOR");
  check(!/findUserByFamilyName\(|findUserById\(/.test(demo), "kimlik deposunda demo ARANMIYOR");

  /* Şifre karması: olmayan bir kimliğin şifresi de olmaz. */
  check(!/bcryptjs/.test(demo), "bcrypt içe aktarılmıyor");
  check(!/passwordHash|recoveryCodeHash/.test(demo), "şifre/kurtarma karması üretilmiyor");

  /*
   * KİMLİK AYNALARI DA HAYIR. `accounts` satırı ve Supabase Auth kaydı,
   * `users.json`ın Postgres/Auth tarafındaki karşılıkları; demoyu oraya
   * yazmak, kapıdan çıkarıp pencereden sokmak olurdu.
   */
  check(!/dbUpsertAccount\(/.test(demo), "accounts (kimlik aynası) satırı yazılmıyor");
  check(!/importAccountToAuth\(|supabaseVerifyPassword\(/.test(demo), "Supabase Auth kaydı açılmıyor");
}
{
  /*
   * Oturum SABİTTEN geliyor: doğrulanacak bir şey olmadığı için okunacak bir
   * satır da yok.
   */
  check(/export const DEMO_SESSION/.test(demo), "demo oturumu koddaki sabit");
  check(/isFounder: true/.test(demo), "ziyaretçi ağacın sahibi (ekleyip düzenleyebilsin)");
  check(/role: "yonetici"/.test(demo), "ortak oyun alanı → yönetici rolü");
  check(/return DEMO_SESSION;/.test(demo), "hazırlık işlevi o sabiti döndürüyor");
}
{
  /*
   * AĞAÇ SATIRI İSTİSNA DEĞİL: `trees` satırı kimlik değil VERİ —
   * `people.tree_id` yabancı anahtarı ona bağlı, satır yoksa demo ağacının
   * Postgres aynası hiç yazılamaz. Eskiden `createUser`ın yan etkisiydi;
   * demo oradan geçmediği için burada kendi gerekçesiyle duruyor.
   */
  check(/dbUpsertTree\(/.test(demo), "demo ağacının Postgres satırı açılıyor (FK için)");
  check(/isHome: true/.test(demo), "ana ağaç olarak işaretleniyor");
}

/* ══ B. DEMONUN DEĞİŞMEMESİ GEREKEN DAVRANIŞLARI ════════════════════════ */

{
  /* Giriş: ayrı sağlayıcı, sunucudan çağrılıyor, kimlik deposuna uğramıyor. */
  const auth = kodu(read("../auth.ts"));
  check(/id: "demo"/.test(auth), "ayrı demo sağlayıcısı duruyor");
  check(/prepareDemoAccount\(\)/.test(auth), "demo girişi ağacı hazırlıyor");

  const iDemo = auth.indexOf('id: "demo"');
  const demoBlok = auth.slice(iDemo, iDemo + 400);
  check(!/findUser|verifyLogin|compare\(/.test(demoBlok),
    "demo kapısı hiçbir kimlik doğrulaması YAPMIYOR (yapacak bir şey yok)");
}
{
  /* Ağaç sıfırlama, kapak ve ekstra ağaç temizliği: demo vitrininin kendisi. */
  check(/saveFamilyData\(/.test(demo) && /DEMO_PEOPLE/.test(demo), "her girişte ağaç sıfırlanıyor");
  check(/coverPhoto: "\/demo-book-cover\.svg"/.test(demo), "varsayılan kitap kapağı geri geliyor");
  check(/listTrees\(/.test(demo) && /purgeTree\(/.test(demo), "ziyaretçilerin ekstra ağaçları temizleniyor");
  check(/if \(!t\.home\)/.test(demo), "temizlik ANA ağacı atlıyor");
  check(!/resetShares\(/.test(demo), "paylaşım bağlantıları SIFIRLANMIYOR (bilerek)");
}
{
  /*
   * NORMAL GİRİŞ FORMUNDAN DEMOYA GİRİLEMEZ.
   *
   * Eskiden bunu sağlayan şey rastgele şifreydi — yani bir TESADÜF. Artık
   * ortada satır bile yok: `verifyLogin` hesabı yalnız `users.json`dan
   * arıyor ve bulamazsa erkenden `null` dönüyor. İki iddia da kilitli,
   * çünkü ikisinden biri düşerse kapı sessizce açılır.
   */
  const cred = kodu(read("../lib/credentials.ts"));
  check(/const user = await findUserByFamilyName\(familyName\);/.test(cred),
    "giriş hesabı YALNIZ kimlik deposundan arıyor");
  check(/if \(!user\) return null;/.test(cred), "bulunamayan ad için giriş yok");
  check(!/DEMO_|demo-hesap/.test(cred), "giriş yolunda demoya özel bir kapı YOK");
}
{
  /*
   * DEMO SİLİNEMEZ. Bu kapılar `users.json` satırına değil KİMLİĞE bakıyor;
   * satırın kalkması onları etkilememeli. İki katman: uç ve yaşam döngüsü.
   */
  const yasam = kodu(read("../lib/account-lifecycle.ts"));
  check(/accountId === DEMO_USER_ID/.test(yasam), "yumuşak silme demoyu reddediyor");
  check(/user\.id === DEMO_USER_ID/.test(yasam), "kalıcı silme demoyu reddediyor");
  check(/reason: "demo"/.test(yasam), "ret sebebi ayrı bir değer (çağıran ayırt edebilsin)");

  const ucu = kodu(read("../app/api/account/delete/route.ts"));
  check(/ctx\.accountId === DEMO_USER_ID/.test(ucu), "silme ucunda demo kapısı duruyor");
  /*
   * SIRA: demo kapısı, hesabı depodan aramadan ÖNCE. Sonra gelseydi demo
   * isteği "Hesap bulunamadı" (400) ile düşerdi — doğru sonuç, YANLIŞ
   * gerekçe: ziyaretçiye demonun korunduğu değil, bozuk olduğu söylenirdi.
   */
  const iKapi = ucu.indexOf("ctx.accountId === DEMO_USER_ID");
  const iArama = ucu.indexOf("findUserById(");
  check(iKapi > 0 && iArama > iKapi, "demo kapısı kimlik aramasından ÖNCE");
}
{
  /*
   * DEMONUN ADI REZERVE. Rezervi eskiden `users.json`daki satır tutuyordu
   * ("bu ad zaten var mı"); satır kalkınca biri demonun adıyla gerçek bir
   * ağaç açabilir, giriş formunda o ada şifre koyabilirdi. Rezerv artık kodda
   * ve İKİ kayıt ucunda birden — mobil, web kaydını çağırmıyor.
   */
  for (const yol of ["../app/api/register/route.ts", "../app/api/mobile/register/route.ts"]) {
    const src = kodu(read(yol));
    const ad = yol.includes("mobile") ? "mobil kayıt" : "web kaydı";
    check(/isDemoFamilyName\(/.test(src), `${ad}: demo adı reddediliyor`);
    const iAd = src.indexOf("isDemoFamilyName(");
    const iAc = src.indexOf("createUser(");
    check(iAd > 0 && iAc > iAd, `${ad}: denetim hesap AÇILMADAN önce`);
  }
  check(/toLowerCase\(\)/.test(demo), "ad karşılaştırması büyük/küçük harf duyarsız");
}
{
  /*
   * DEMOYA KİMLİK/BİLDİRİM E-POSTASI BAĞLANAMAZ.
   *
   * Demo oturumu founder olduğu için ayarlar ekranındaki bu iki bölüm ona da
   * açık. Adres PAYLAŞILAN bir kayda düşerdi: bir sonraki ziyaretçi onu
   * görür, günlük cron da her sabah o adrese yabancı bir ağacın doğum
   * günlerini yollardı. Kapı KİMLİĞE bakıyor — satırın yokluğuna güvenip
   * "Hesap bulunamadı" (404) demek doğru sonuç, yanlış gerekçe olurdu.
   */
  for (const yol of ["../app/api/account/email/route.ts", "../app/api/account/notify/route.ts"]) {
    const src = kodu(read(yol));
    const ad = yol.includes("notify") ? "bildirim ayarı" : "kimlik e-postası";
    check(/ctx\.accountId === DEMO_USER_ID/.test(src), `${ad}: demo kapısı var`);
    check(/status: 403/.test(src), `${ad}: ret 403 (arıza değil, karar)`);
    check(/Demo/.test(src), `${ad}: gerekçe kullanıcıya söyleniyor`);
  }
}
{
  /*
   * KİMLİKSİZ AĞACIN ADI. Kurucunun adını `users.json`dan çözen yüzeyler demo
   * için `null` alıyor. İkisi de sessizce bozulurdu: katkı akışında her
   * kurucu kaydı "biri" görünür, davet bağlantısı ise geçerliyken "davet
   * geçersiz" (404) verirdi.
   */
  for (const yol of ["../app/api/family/activity/route.ts", "../app/api/tree/join/route.ts"]) {
    const src = kodu(read(yol));
    check(/demoTreeName\(/.test(src), `${yol.split("/").slice(-3).join("/")}: ad sabitten çözülüyor`);
  }
  check(/export function demoTreeName/.test(demo), "ad çözümü TEK yerde (çağıranlar karşılaştırma tekrarlamıyor)");
}

/* ══ C. KAPININ ANLAMI: DEMO SATIRI ARTIK BİR KALINTI ═══════════════════ */

{
  /*
   * `lib/phase4-readiness.ts`teki `demo-acikta` engelinin anlamı TERSİNE
   * çevrildi: eskiden "demonun Auth kaydı yok" (yani demoyu kimlik sistemine
   * sok) derken, artık "demo hâlâ users.json'da bir hesap satırı olarak
   * duruyor" diyor. Karar kuralları `tests/phase4-readiness.test.mts`te
   * mutasyonla sınanıyor; burada kilitlenen şey, ölçümün kaldırılmamış
   * olması — yokluğu kanıtlamanın tek yolu, varsa göstermek.
   */
  const rota = kodu(read("../app/api/admin/phase4/route.ts"));
  check(/isDemo: demo/.test(rota), "kapı hesap envanterinde demoyu hâlâ işaretliyor");
  check(/DEMO_USER_ID/.test(rota), "işaret KİMLİĞE bakıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
