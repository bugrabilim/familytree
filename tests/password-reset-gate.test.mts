import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: e-postayla şifre sıfırlama (madde 51).
 *
 * Bu iki uç HESABIN KENDİSİNİ veriyor — bir kusur, doğru ağaç adını bilen
 * birine başkasının ailesinin bütün kaydını açar. Rotalar birim testi
 * koşulamadığı için kritik özellikler kaynak düzeyinde kilitleniyor.
 */

const istek = readFileSync(new URL("../app/api/reset-password/email/route.ts", import.meta.url), "utf8");
const kullan = readFileSync(new URL("../app/api/reset-password/token/route.ts", import.meta.url), "utf8");
const users = readFileSync(new URL("../lib/users.ts", import.meta.url), "utf8");

/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı sayılmamalı. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const iK = kodu(istek), kK = kodu(kullan), uK = kodu(users);

/* --- Erişim: oturumsuz açık OLMALI -------------------------------------- */
/*
 * Şifresini unutmuş kullanıcının tanımı gereği oturumu yok. Kapalı olsalardı
 * sıfırlama hiçbir zaman tamamlanamazdı.
 */
check(isPublicPath("/api/reset-password/email"), "istek ucu oturumsuz erişilebilir");
check(isPublicPath("/api/reset-password/token"), "kullanma ucu oturumsuz erişilebilir");
check(isPublicPath("/reset-password/abc123"), "sıfırlama sayfası oturumsuz erişilebilir");

/* --- NUMARALANDIRMA: istek ucu her dalda AYNI yanıt ---------------------- */
/*
 * "Hesap yok" ile "adres doğrulanmamış" ayırt edilebilseydi, dışarıdan hangi
 * aile adlarının kayıtlı olduğunu ve hangilerinin e-posta bağladığını sayan
 * bir kâhin doğardı. Aynı hata bu depoda kurtarma kodu ucunda bir kez
 * yapılmış ve düzeltilmişti.
 */
check(/const AYNI_YANIT = \{ ok: true \} as const;/.test(iK), "tek bir ortak yanıt sabiti var");
{
  // Başarısız dalların HİÇBİRİ ayrı bir gövde/durum kodu döndürmemeli.
  const planDali = iK.slice(iK.indexOf('if (plan.kind === "gonderme")'));
  const ilkDonus = planDali.slice(0, planDali.indexOf("\n\n"));
  check(ilkDonus.includes("AYNI_YANIT"), "gönderilmeyen dal ortak yanıtı dönüyor");
}
check(!/status: 404/.test(iK), "istek ucu 404 dönmüyor (hesabın yokluğunu ele vermez)");
check(!/status: 403/.test(iK), "istek ucu 403 dönmüyor");
/*
 * Hesap başına sınır aşımı da ortak yanıt dönmeli: 429 dönmek o ağaç adının
 * varlığını ele vermezdi ama "bu ada çok istek geldi" bilgisini sızdırırdı.
 */
check(/if \(!perAccount\.ok\) return NextResponse\.json\(AYNI_YANIT\);/.test(iK),
  "hesap sınırı aşımında da ortak yanıt");
// Sebep yalnız günlüğe.
check(/console\.warn\(`\[51\] sıfırlama bağlantısı gönderilmedi/.test(istek), "sebep günlüğe yazılıyor");

/* --- Sınırlama: iki katman ---------------------------------------------- */
/*
 * IP katmanı kaba kuvvet için; hesap katmanı TEK BİR kurbanın kutusuna posta
 * yağdırmayı engelliyor — saldırgan IP değiştirse bile.
 */
check((iK.match(/await rateLimitShared\(/g) ?? []).length >= 2, "istek ucunda iki katmanlı sınır");
check(/await rateLimitShared\(/.test(kK), "kullanma ucunda sınır var");

/* --- Jeton depoda HAM durmuyor ------------------------------------------ */
/*
 * Blob'u okuyabilen biri (ya da bir yedek görüntüsü) bekleyen sıfırlama
 * bağlantılarını elde edememeli.
 */
check(/resetTokenHash: sha256\(token\)/.test(iK), "yalnız özet saklanıyor");
check(!/resetTokenHash: token\b/.test(iK), "ham jeton saklanmıyor");
check(/randomBytes\(32\)/.test(iK), "jeton en az 32 bayt rastgele");

/* --- Sağlayıcı yoksa jeton ÜRETİLMİYOR ---------------------------------- */
/*
 * Üretilseydi hesapta, kimseye ulaşmayan ama bir saat geçerli bir jeton
 * dururdu: kimsenin işine yaramayan, yalnız saldırı yüzeyi olan bir kayıt.
 */
{
  const iKontrol = iK.indexOf("isEmailConfigured()");
  const iUret = iK.indexOf("randomBytes(32)");
  check(iKontrol > 0 && iUret > iKontrol, "jeton, e-posta yapılandırması denetlendikten SONRA üretiliyor");
}

/* --- TEK KULLANIM -------------------------------------------------------- */
/*
 * Jeton kullanıldıktan sonra düşmezse, aynı bağlantı postada durduğu sürece
 * hesabı tekrar tekrar ele geçirmeye yarar.
 */
check(/updateUserResetToken\(user!\.id, \{ resetTokenHash: null, resetTokenExpires: null \}\)/.test(kK),
  "kullanımdan sonra jeton temizleniyor");
/*
 * Şifre HANGİ YOLDAN değişirse değişsin bekleyen jeton düşmeli — kullanıcı
 * kurtarma koduyla şifresini değiştirdiğinde postadaki bağlantı hâlâ geçerli
 * kalmamalı.
 */
check(/user\.resetTokenHash = undefined;/.test(uK), "şifre değişince jeton düşüyor");
{
  const iSifre = uK.indexOf("user.passwordHash = newPasswordHash;");
  const iJeton = uK.indexOf("user.resetTokenHash = undefined;", iSifre);
  check(iSifre > 0 && iJeton > iSifre, "jeton temizliği şifre yazımıyla aynı kayıtta");
}

/* --- JETON KARIŞMASI: doğrulama jetonu ≠ sıfırlama jetonu --------------- */
/*
 * `emailTokenHash` bir ADRESİ doğruluyor; `resetTokenHash` HESABIN KENDİSİNİ
 * veriyor. Sıfırlama ucu ilkine hiç bakmamalı — baksaydı, adres doğrulama
 * postasını ele geçiren biri şifreyi de değiştirebilirdi.
 */
check(!/emailTokenHash/.test(kK), "kullanma ucu doğrulama jetonuna BAKMIYOR");
check(!/emailTokenHash/.test(iK), "istek ucu doğrulama jetonuna dokunmuyor");

/* --- Hesap jetondan bulunuyor, kullanıcının verdiği addan değil --------- */
/*
 * Ad sorulsaydı saldırgan "bu jeton şu hesaba mı ait?" diye deneyebilirdi.
 */
check(/u\.resetTokenHash === ozet/.test(kK), "hesap jeton özetinden bulunuyor");
check(!/findUserByFamilyName/.test(kK), "kullanma ucu ağaç adı istemiyor");

/* --- Reddetme sebebi TEK mesaj ------------------------------------------ */
/*
 * "yok" / "süresi dolmuş" / "eşleşmiyor" ayrılsaydı, geçerli ama süresi
 * dolmuş bir jetonun VARLIĞI doğrulanmış olurdu.
 */
{
  /*
   * İddia "kaç kez geçiyor" değil, "kaç FARKLI mesaj var": aynı cümle birden
   * çok dalda kullanılabilir (depo hatası da jeton reddi gibi görünmeli).
   * Önemli olan, jeton reddine dair AYRIŞTIRILABİLİR ikinci bir cümlenin
   * olmaması.
   */
  const mesajlar = [...kK.matchAll(/error: "([^"]+)"/g)].map((m) => m[1]);
  // Jeton reddiyle ilgisi olmayan mesajlar: girdi doğrulama ve hız sınırı.
  const dogrulama = [
    "Geçersiz istek",
    "Şifre en az 6 karakter olmalı.",
    "Bağlantı geçersiz.",
    "Çok fazla deneme. Lütfen biraz bekleyin.",
  ];
  const red = new Set(mesajlar.filter((m) => !dogrulama.includes(m)));
  check(red.size === 1, `jeton reddi için tek mesaj (${[...red].join(" | ")})`);
  check([...red][0]?.includes("Bağlantı geçersiz ya da süresi dolmuş"), "mesaj beklenen cümle");
}

/* --- Supabase Auth şifresi de senkronlanıyor ---------------------------- */
/*
 * Yoksa SIFIRLANMIŞ ESKİ şifre Supabase üzerinden hâlâ kabul edilirdi.
 */
check(/updateAccountAuthPassword\(/.test(kK), "Supabase Auth şifresi senkronlanıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
