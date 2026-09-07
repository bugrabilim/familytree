import { readFileSync, readdirSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: form hataları ekran okuyucuya DUYURULUYOR.
 *
 * Hata paragrafında `role="alert"` (ya da `aria-live`) yoksa mesaj sessizce
 * beliriyor: gören kullanıcı kırmızı kutuyu fark ediyor, görmeyen kullanıcı
 * "gönder"e bastıktan sonra hiçbir şey duymuyor — gitti mi, gitmedi mi belli
 * değil. Yanlış şifre, süresi dolmuş kurtarma kodu, geçersiz davet
 * bağlantısı: hepsi bu sessizliğe düşüyordu.
 *
 * `/register` #328'de düzeltilmişti; kapı o zaman kurulmadığı için /login ve
 * /forgot-password aynı hâlde kalmıştı. Bu dosya artık ROTALARIN TAMAMINI
 * geziyor — tek tek dosya saymak, bir sonraki formun yine atlanması demekti.
 */

/* ══ 1. app/** içindeki HER hata paragrafı duyuruluyor ══════════════════ */
/*
 * Kapsam `app/**`: oturum AÇMADAN doldurulan formlar burada (giriş, kayıt,
 * şifre kurtarma/sıfırlama, davet, eşleştirme, katılım, hikâye, LCV, e-posta
 * doğrulama). `components/**` içindeki uygulama içi diyaloglar bu turda
 * kapsam dışı; orada da aynı desen gerekiyor ama ayrı bir iş.
 *
 * `app/admin` hariç: geliştirici/yönetici konsolu, genel yüzey değil.
 */
{
  const suphe: string[] = [];
  let sayi = 0;
  const gez = (d: string) => {
    for (const e of readdirSync(new URL(d + "/", import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === "admin" || e.name === "api") continue;
        gez(`${d}/${e.name}`);
        continue;
      }
      if (!e.name.endsWith(".tsx")) continue;
      const src = kodu(read(`${d}/${e.name}`));
      /*
       * `text-danger` taşıyan <p> elemanları taranıyor. Etiketin BAŞINDAN
       * `>`e kadar okunuyor (pencere değil): kaba bir pencere, komşu
       * elemanın `role`ünü görüp sahte YEŞİL üretirdi.
       */
      for (const m of src.matchAll(/<p\b[^>]*>/g)) {
        const etiket = m[0];
        if (!/text-danger/.test(etiket)) continue;
        sayi++;
        if (!/role="alert"|aria-live=/.test(etiket)) suphe.push(`${d}/${e.name}: ${etiket.slice(0, 70)}`);
      }
    }
  };
  gez("../app");
  check(sayi >= 10, `taranan hata paragrafı sayısı beklenen büyüklükte (${sayi})`);
  check(suphe.length === 0, `app/** içindeki her hata paragrafı duyuruluyor (eksik: ${suphe.join(" | ")})`);
}

/* ══ 2. Üç kritik kurtarma formu adıyla kilitleniyor ════════════════════ */
/*
 * Genel tarama bir dosyanın hata paragrafını tümüyle SİLİNMESİNE karşı kör:
 * silinen paragraf taranacak bir şey bırakmaz, sayaç düşer, test yeşil kalır.
 * Şifresini unutmuş / hesabına giremeyen kullanıcının gördüğü üç ekran bu
 * yüzden adıyla anılıyor.
 */
for (const [f, ad] of [
  ["../app/login/LoginForm.tsx", "giriş"],
  ["../app/forgot-password/ForgotForm.tsx", "şifremi unuttum"],
  ["../app/reset-password/[token]/ResetPasswordClient.tsx", "şifre sıfırlama"],
  ["../app/register/RegisterForm.tsx", "kayıt"],
] as const) {
  const src = kodu(read(f));
  check(/role="alert"/.test(src), `${ad}: hata mesajı role="alert" taşıyor`);
  check(/\{error &&|\{errors\./.test(src) || /error &&/.test(src), `${ad}: hata durumu çiziliyor`);
}
{
  /*
   * "E-posta gönderildi" bir hata değil, bir SONUÇ: `alert` sözü keser,
   * `status` sırasını bekler. Uç her durumda aynı cümleyi döndürdüğü için
   * (numaralandırma koruması) o cümle duyulmazsa kullanıcı düğmeye bastığını
   * bile doğrulayamıyor — yani sessiz kalamaz.
   */
  const src = kodu(read("../app/forgot-password/ForgotForm.tsx"));
  check(/\{mailInfo && \([\s\S]{0,120}?role="status"/.test(src), "e-posta bilgisi role=\"status\" ile duyuruluyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
