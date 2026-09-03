import {
  applyEmailChange,
  canRecoverByEmail,
  emailTakenBy,
  isSyntheticEmail,
  normalizeEmail,
  planEmailChange,
  verifyWouldCollide,
} from "../lib/account-email.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/* ── Normalleştirme ──────────────────────────────────────────────────────── */

check(normalizeEmail("  Ali@Example.COM ") === "ali@example.com", "kırpılıp küçük harfe iniyor");
check(normalizeEmail("a@b.co") === "a@b.co", "kısa geçerli adres");
for (const kotu of ["", "  ", "ali", "ali@", "@x.com", "a@b", "a b@c.com", "a@b..com", null, 42, undefined]) {
  check(normalizeEmail(kotu) === null, `geçersiz reddediliyor: ${JSON.stringify(kotu)}`);
}
check(normalizeEmail("a".repeat(250) + "@b.com") === null, "aşırı uzun adres reddediliyor");
{
  /*
   * TÜRKÇE TUZAĞI. `toLowerCase()` Türkçe yerelde "I"yı "ı" yapar ve
   * "ALI@x.com" adresi "alı@x.com"a dönerdi — kullanıcı kendi adresiyle bir
   * daha asla eşleşemezdi.
   */
  check(normalizeEmail("ALI@X.COM") === "ali@x.com", "büyük I doğru küçülüyor (ı değil)");
  check(!normalizeEmail("ALI@X.COM")!.includes("ı"), "noktasız ı üretilmiyor");
}

/* ── Sentetik adres ──────────────────────────────────────────────────────── */

check(isSyntheticEmail(`${UUID}@soyagaci.local`), "sentetik adres tanınıyor");
check(isSyntheticEmail(`${UUID.toUpperCase()}@x.y`), "büyük harfli UUID de tanınıyor");
check(!isSyntheticEmail("ali@example.com"), "gerçek adres sentetik sayılmıyor");
check(!isSyntheticEmail("3f2504e0@example.com"), "kısa onaltılık sentetik değil");

/* ── ASIL KURAL: doğrulanmamış adres kurtarma yolu DEĞİL ─────────────────── */

check(!canRecoverByEmail({}), "adres yoksa kurtarma yok");
check(!canRecoverByEmail({ authEmail: "ali@x.com" }), "doğrulanmamış adresle kurtarma YOK");
check(!canRecoverByEmail({ authEmail: "ali@x.com", authEmailVerified: false }), "açıkça false da olmaz");
check(canRecoverByEmail({ authEmail: "ali@x.com", authEmailVerified: true }), "doğrulanmış adresle olur");
check(!canRecoverByEmail({ authEmail: "  ", authEmailVerified: true }), "boş adres doğrulanmış olsa da olmaz");
{
  /*
   * Sentetik adres KULLANICIYA AİT DEĞİL: kimse oraya posta alamaz. "Doğrulanmış"
   * işaretlenmiş olsa bile kurtarma yolu sayılamaz.
   */
  check(!canRecoverByEmail({ authEmail: `${UUID}@soyagaci.local`, authEmailVerified: true }),
    "sentetik adres doğrulanmış olsa bile kurtarma yolu değil");
}

/* ── Değişiklik planı ────────────────────────────────────────────────────── */

const mevcut = { authEmail: "ali@x.com", authEmailVerified: true };

check(planEmailChange(mevcut, undefined).kind === "degismedi", "undefined dokunmuyor");
check(planEmailChange(mevcut, "").kind === "temizle", "boş dize temizliyor");
check(planEmailChange(mevcut, null).kind === "temizle", "null temizliyor");
check(planEmailChange(mevcut, "yok").kind === "gecersiz", "geçersiz adres reddediliyor");
check(planEmailChange(mevcut, `${UUID}@soyagaci.local`).kind === "gecersiz",
  "kullanıcı sentetik adres YAZAMAZ");
{
  const p = planEmailChange(mevcut, "ALI@X.com");
  check(p.kind === "degismedi" && p.verified === true,
    "aynı adres yeniden gönderilince doğrulama KORUNUYOR (yalnız biçim farkı)");
}
{
  const p = planEmailChange(mevcut, "veli@y.com");
  check(p.kind === "ayarla" && p.email === "veli@y.com", "yeni adres ayarlanıyor");
}

/* ── İKİNCİ KURAL: adres değişirse doğrulama SIFIRLANIR ──────────────────── */
/*
 * Yoksa kullanıcı kendi adresini doğrulayıp sonra başkasınınkiyle
 * değiştirerek "doğrulanmış" bir yabancı adres elde ederdi.
 */
{
  const sonra = applyEmailChange(planEmailChange(mevcut, "baskasi@y.com"))!;
  check(sonra.authEmail === "baskasi@y.com", "yeni adres yazıldı");
  check(sonra.authEmailVerified === false, "doğrulama SIFIRLANDI");
  check(!canRecoverByEmail(sonra), "yeni adres hemen kurtarma yolu olmuyor");
}
{
  const sonra = applyEmailChange(planEmailChange(mevcut, "ali@x.com"))!;
  check(sonra.authEmailVerified === true, "aynı adreste doğrulama düşmüyor");
}
{
  const sonra = applyEmailChange(planEmailChange(mevcut, ""))!;
  check(sonra.authEmail === "" && sonra.authEmailVerified === false, "temizlenince ikisi de sıfır");
}
check(applyEmailChange({ kind: "gecersiz" }) === null, "geçersiz plan uygulanmıyor");

/* ── Tekillik: yalnız DOĞRULANMIŞ adresler çakışır ───────────────────────── */
/*
 * Doğrulanmamış adres henüz bir niyet beyanı. Birinin yanlışlıkla yazdığı
 * adres, gerçek sahibinin sonradan doğrulamasını ENGELLEMEMELİ — yoksa
 * hesabınızı başkasının yazım hatası kilitleyebilirdi.
 */
{
  const hesaplar = [
    { id: "a", authEmail: "ali@x.com", authEmailVerified: true },
    { id: "b", authEmail: "veli@x.com", authEmailVerified: false },
  ];
  check(emailTakenBy("ali@x.com", hesaplar, "c") === "a", "doğrulanmış adres tutulu");
  check(emailTakenBy("ALI@X.COM", hesaplar, "c") === "a", "biçim farkı tekilliği atlatmıyor");
  check(emailTakenBy("veli@x.com", hesaplar, "c") === null, "doğrulanmamış adres tutmuyor");
  check(emailTakenBy("ali@x.com", hesaplar, "a") === null, "kendi adresi çakışma değil");
  check(emailTakenBy("yok@x.com", hesaplar, "c") === null, "serbest adres");
  check(emailTakenBy("gecersiz", hesaplar, "c") === null, "geçersiz adres çakışma üretmiyor");

  // Tekillik DOĞRULAMA anında zorlanıyor.
  check(verifyWouldCollide("ali@x.com", hesaplar, "c"), "başkasının doğrulanmış adresi doğrulanamaz");
  check(!verifyWouldCollide("veli@x.com", hesaplar, "c"), "doğrulanmamış ikizi olan adres doğrulanabilir");
  check(!verifyWouldCollide("ali@x.com", hesaplar, "a"), "kendi adresini yeniden doğrulayabilir");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
