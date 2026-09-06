import { readFileSync } from "node:fs";
import {
  USERNAME_MAX, USERNAME_MIN, checkUsername, normalizeUsername, suggestUsername, usernameTaken,
} from "../lib/username.ts";

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

/* ── 1. normalizeUsername ─────────────────────────────────────────────────── */
eq(normalizeUsername("Ayse"), "ayse", "küçük harfe iniyor");
eq(normalizeUsername("  ayse  "), "ayse", "kırpılıyor");
eq(normalizeUsername(""), "", "boş boş kalıyor");
eq(normalizeUsername(undefined), "", "undefined → boş");
eq(normalizeUsername(null), "", "null → boş");
eq(normalizeUsername(42), "", "sayı → boş");

/*
 * YEREL DUYARSIZ küçültme. `toLocaleLowerCase` kullanılsaydı Türkçe
 * yerelinde "I" → "ı" olurdu; yani SUNUCUNUN yereli, kullanıcı adının
 * hangi kayda çözüleceğini belirlerdi. Kimlik çözen bir alanda bu, yanlış
 * kişiyi bulmak demek.
 */
eq(normalizeUsername("AYSEI"), "aysei", "büyük I, ASCII 'i'ye iniyor (yerelden bağımsız)");

/* ── 2. checkUsername ─────────────────────────────────────────────────────── */
check(checkUsername("ayse").ok, "normal ad geçerli");
check(checkUsername("ayse.yilmaz").ok, "nokta serbest");
check(checkUsername("ayse_yilmaz").ok, "alt çizgi serbest");
check(checkUsername("ayse-yilmaz").ok, "tire serbest");
check(checkUsername("a".repeat(USERNAME_MAX)).ok, "üst sınır dâhil");
check(checkUsername("abc").ok, "alt sınır dâhil");

const fails = (u: string) => { const r = checkUsername(u); return r.ok ? "GEÇTİ" : r.fail; };
eq(fails("ab"), "kisa", "kısa ad reddediliyor");
eq(fails("a".repeat(USERNAME_MAX + 1)), "uzun", "uzun ad reddediliyor");
eq(fails("Ayse"), "gecersiz", "büyük harf reddediliyor (normalleştirilmemiş girdi)");
eq(fails("ayşe"), "gecersiz", "Türkçe harf reddediliyor");
eq(fails("ayse yilmaz"), "gecersiz", "boşluk reddediliyor");
eq(fails("ayse@ev"), "gecersiz", "@ reddediliyor");
eq(fails("123abc"), "basi-harf-degil", "rakamla başlayamıyor");
eq(fails("_ayse"), "basi-harf-degil", "alt çizgiyle başlayamıyor");
eq(fails(".ayse"), "basi-harf-degil", "noktayla başlayamıyor");

/* ── 3. usernameTaken ─────────────────────────────────────────────────────── */
const uyeler = [{ username: "ayse" }, { username: "mehmet" }, { displayName: "eski" } as { username?: string }];
check(usernameTaken(uyeler, "ayse"), "alınmış ad bulunuyor");
check(usernameTaken(uyeler, "AYSE"), "karşılaştırma büyük/küçük harf duyarsız");
check(usernameTaken(uyeler, "  ayse "), "boşluklar önemsiz");
check(!usernameTaken(uyeler, "zeynep"), "boş ad serbest");
/*
 * Adsız eski üyeler karşılaştırmaya GİRMİYOR: hepsinin `username`i
 * `undefined` ve boş hedefle eşleşselerdi, ilk adsız üye her adı "dolu"
 * gösterirdi.
 */
check(!usernameTaken(uyeler, ""), "boş hedef hiçbir şeyle eşleşmiyor");
check(!usernameTaken([{ username: undefined }], ""), "adsız üye boş hedefle eşleşmiyor");

/* ── 4. suggestUsername ───────────────────────────────────────────────────── */
eq(suggestUsername("Ayşe Yılmaz"), "ayseyilmaz", "Türkçe harfler karşılığına iniyor");
eq(suggestUsername("Mehmet Ali"), "mehmetali", "boşluk düşüyor");
eq(suggestUsername("Ömer Çağrı Şahin"), "omercagrisahin", "ö/ç/ş dönüşüyor");
eq(suggestUsername(""), "", "boş addan öneri yok");
eq(suggestUsername("123"), "", "harfle başlamayan öneri BOŞ (form hatayla açılmasın)");
check(suggestUsername("A".repeat(40)).length === USERNAME_MAX, "öneri üst sınıra kırpılıyor");
check(checkUsername(suggestUsername("Ayşe Yılmaz")).ok, "önerilen ad kendi kuralından geçiyor");

/* ── 5. Kaynak kapıları ──────────────────────────────────────────────────── */
const cred = kodu(read("../lib/credentials.ts"));
const members = kodu(read("../lib/members.ts"));
const join = kodu(read("../app/api/tree/join/route.ts"));
const auth = kodu(read("../auth.ts"));
const login = kodu(read("../app/login/page.tsx"));
const joinUi = kodu(read("../app/join/[token]/page.tsx"));
const access = kodu(read("../app/api/tree/access/route.ts"));

/*
 * ADLA GİRİŞTE KURUCU YOLU HİÇ DENENMEMELİ.
 *
 * Kurucunun kullanıcı adı yok. Ad yazılıp kurucu şifresiyle girilebilseydi
 * ad bir kimlik değil, göz ardı edilen bir süs olurdu — ve kuralın kendisi
 * (kimliği addan çözmek) delinmiş olurdu.
 */
{
  const i = cred.indexOf("export async function verifyLogin");
  const govde = cred.slice(i);
  const iAd = govde.indexOf("if (uyeAdi)");
  const iKurucu = govde.indexOf("const founderSession");
  check(iAd > -1, "adla giriş dalı var");
  check(iKurucu > iAd, "kurucu yolu ad dalından SONRA (yani ad varken çalışmıyor)");
  const dal = govde.slice(iAd, iKurucu);
  check(/findMemberByUsername\(user\.id, uyeAdi\)/.test(dal), "üye ADLA aranıyor");
  check(/compare\(password, member\.passwordHash\)/.test(dal), "şifre YALNIZ o üyenin özetiyle");
  check(!/supabaseVerifyPassword/.test(dal), "ad dalında kurucu doğrulaması yok");
  /*
   * Ad bulunamadığında da bir bcrypt yürütülüyor: yoksa "böyle bir kullanıcı
   * yok" yanıtı ölçülebilir biçimde hızlı döner ve dışarıdan biri hangi
   * adların var olduğunu yalnız SÜREYE bakarak çıkarabilirdi.
   */
  check(/await bedeliOde\(password\)/.test(dal), "bulunamayan adda da bcrypt bedeli ödeniyor");
}

/*
 * ESKİ YOL DARALDI: adı olan üye şifreyle kimlik çözen döngüden GEÇEMEZ.
 *
 * Geçebilseydi belirsizlik geri gelirdi — adlı katılımda şifre çakışması
 * artık denetlenmiyor, yani adsız bir üye, adlı bir üyeyle aynı şifreyi
 * taşıyabilir ve döngü ilk eşleşeni döndürdüğü için onun kimliğiyle VE
 * ROLÜYLE oturum açabilirdi.
 */
{
  const i = members.indexOf("export async function findMemberByPassword");
  const govde = members.slice(i, members.indexOf("\nexport", i + 10));
  check(i > -1, "findMemberByPassword bulundu");
  check(/if \(m\.username\) continue;/.test(govde), "adı olan üye eski yoldan giremiyor");
  const iAtla = govde.indexOf("m.username");
  const iCompare = govde.indexOf("compare(password");
  check(iAtla > -1 && iCompare > iAtla, "atlama, şifre karşılaştırmasından ÖNCE");
}

/* Adla arama şifreye BAKMIYOR: karşılaştırma çağıranda, tek bcrypt. */
{
  const i = members.indexOf("export async function findMemberByUsername");
  const govde = members.slice(i, members.indexOf("\n}", i));
  check(i > -1, "findMemberByUsername bulundu");
  check(!/compare\(/.test(govde), "adla arama şifre karşılaştırmıyor");
  check(/isSoftDeleted\(data\)/.test(govde), "silinmekte olan ağaçta ad da çözülmüyor");
}

/*
 * ŞİFRE ÇAKIŞMASI DENETİMİ YALNIZ ADSIZ KATILIMDA. Ad varken sürdürmek,
 * geçerli bir şifreyi "başkası kullanıyor" diye reddetmek olurdu — üstelik
 * bu, başkasının şifresini doğrulayan bir bilgi sızıntısı.
 */
{
  const i = members.indexOf("export async function acceptInvite");
  const govde = members.slice(i);
  check(/if \(!ad && plainPassword\)/.test(govde), "şifre çakışması denetimi adsız katılıma özel");
  check(/usernameTaken\(data\.members, ad\)/.test(govde), "ad çakışması denetleniyor");
  check(/\.\.\.\(ad \? \{ username: ad \} : \{\}\)/.test(govde), "ad normalleştirilmiş hâliyle saklanıyor");
  const iAdDenetim = govde.indexOf("usernameTaken(");
  const iYaz = govde.indexOf("saveTreeAccess(");
  check(iAdDenetim > -1 && iYaz > iAdDenetim, "denetim yazmadan ÖNCE");
}

/*
 * YENİ KATILIMLARDA AD ZORUNLU. İsteğe bağlı olsaydı adsız katılan her üye
 * eski (şifreyle kimlik çözen) yolda kalır ve düzeltmeye çalıştığımız
 * belirsizlik yeni kayıtlarla büyümeye devam ederdi.
 */
check(/if \(!username\)/.test(join), "katılmada ad zorunlu");
check(/checkUsername\(username\)/.test(join), "ad kuralı sunucuda da uygulanıyor");
check(/normalizeUsername\(body\.username\)/.test(join), "ad sunucuda normalleştiriliyor");
check(/username: result\.member\.username/.test(join), "yanıt, saklanan adı geri veriyor");

/* Kimlik alanı uçtan uca taşınıyor. */
check(/username: \{ label/.test(auth), "NextAuth sağlayıcısı ad alanını tanıyor");
check(/verifyLogin\(familyName \?\? "", password \?\? "", username \?\? ""\)/.test(auth), "ad doğrulamaya geçiyor");
check(/signIn\("credentials", \{ familyName, username, password, redirect: false \}\)/.test(login),
  "giriş formu adı gönderiyor");
check(/username: data\.username \?\? username/.test(joinUi), "katılma sonrası otomatik giriş adı taşıyor");

/*
 * Şifre özeti hâlâ dışarı çıkmıyor; ad çıkıyor — ad bir kimlik, sır değil
 * ve üye "giremiyorum" dediğinde yöneticinin bakabileceği tek yer o.
 */
check(/username: m\.username \?\? ""/.test(access), "yönetici üyenin adını görüyor");
check(!/passwordHash/.test(access), "şifre özeti hâlâ sızmıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
