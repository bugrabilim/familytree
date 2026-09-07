import { readFileSync, existsSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const varMi = (rel: string) => existsSync(new URL(rel, import.meta.url));
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: sessiz çıkmazlar — ölü düğme, İngilizce 404, ayırt edilemeyen başlık.
 *
 * Üç bulgunun ortak yanı, hiçbirinin bir hata üretmemesi. Kayıt düğmesi
 * "çalışıyor" görünüyordu (tıklanınca hiçbir şey olmuyordu), 404 sayfası
 * çiziliyordu (İngilizce ve bağlantısız), her sayfanın bir başlığı vardı
 * (hepsi aynı). Testler yeşildi, derleme geçiyordu; sorunu yalnız tarayıcıda
 * gezinen biri görüyordu. Bu dosya o üç düzeltmenin geri alınmasını yakalıyor.
 */

/* ══ 1. KAYIT: ONAY KUTUSU DÜĞMEYİ ÖLDÜRMÜYOR ═══════════════════════════ */
/*
 * Eski hâl: `disabled={loading || !agreed}`. Onay kutusu işaretlenmeden
 * düğme devre dışıydı — tıklamak hiçbir şey yapmıyor, hiçbir mesaj çıkmıyor,
 * Tab sırası düğmeyi tümüyle atlıyordu. `handleSubmit` içindeki
 * `register.consentRequired` dalı yazılmıştı ama ÇAĞRILAMIYORDU.
 */
{
  const src = kodu(read("../app/register/RegisterForm.tsx"));

  /* Gönder düğmesinin `disabled` ifadesi — onaya BAKMAMALI. */
  const m = src.match(/<Button\s+type="submit"[^>]*disabled=\{([^}]*)\}/);
  check(!!m, "kayıt formunda gönder düğmesi bulundu");
  const disabled = m?.[1] ?? "";
  check(!/agreed/.test(disabled),
    `gönder düğmesi onaya göre devre dışı BIRAKILMIYOR (bulunan: ${disabled.trim()})`);
  /*
   * `loading` kalmalı: o başka bir şey — süren bir isteğin ikinci kez
   * gönderilmesini engelliyor. Kaldırılırsa çift kayıt açılırdı.
   */
  check(/loading/.test(disabled), "süren istek sırasında düğme yine de kilitli");

  /* Ölü dal artık canlı: onay yoksa gönderim mesajı gösteriyor. */
  check(/if \(!agreed\)/.test(src), "gönderimde onay kontrolü duruyor");
  check(/register\.consentRequired/.test(src), "eksik onay için mesaj anahtarı kullanılıyor");
  /*
   * İki yol da (JS gönderimi ve tarayıcının kendi doğrulaması) AYNI yere
   * inmeli; ayrı ayrı yazılsalardı biri güncellenip öbürü unutulurdu.
   */
  check(/onayEksik\(\)/.test(src) && (src.match(/onayEksik\(\)/g) ?? []).length >= 2,
    "eksik onay tek işlevden geçiyor (gönderim + tarayıcı doğrulaması)");
  check(/onInvalid=/.test(src), "yerel doğrulama balonu ele alınıyor");

  /* Onay kutusunun kendisi: zorunlu ve hataya bağlı. */
  const i = src.indexOf('type="checkbox"');
  check(i > -1, "onay kutusu bulundu");
  /*
   * Pencere DEĞİL, elemanın KENDİSİ okunuyor: `<input … type="checkbox" … />`
   * etiketinin başı ve sonu bulunuyor. Kaba bir pencere, hemen üstteki şifre
   * alanının `required`ını görüp sahte YEŞİL üretiyordu — mutasyon denemesi
   * (kutudan `required` silindi) ilk turda tam olarak böyle kaçtı.
   */
  const bas = src.lastIndexOf("<input", i);
  const son = src.indexOf("/>", i);
  const blok = bas > -1 && son > i ? src.slice(bas, son) : "";
  check(blok.length > 0, "onay kutusu etiketi ayrıştırıldı");
  /* `\brequired\b` yetmez: `aria-required` da eşleşirdi. */
  check(/(^|\s)required(\s|$)/m.test(blok), "onay kutusu `required`");
  check(/aria-invalid=/.test(blok), "hatalı durumda `aria-invalid`");
  check(/aria-describedby=/.test(blok), "hata metni `aria-describedby` ile bağlı");
  /* Bağ iki uçlu olmalı: `aria-describedby` var olmayan bir id'yi gösteremez. */
  const hedef = blok.match(/aria-describedby=\{[^}]*?"([^"]+)"/)?.[1];
  check(!!hedef && new RegExp(`id="${hedef}"`).test(src),
    `aria-describedby gerçek bir elemanı gösteriyor (${hedef})`);
  /* Kutu 18px'lik ortak sınıfı kullanmayı sürdürüyor (dokunma hedefi kapısı). */
  check(/ui-check/.test(blok), "ortak onay kutusu sınıfı duruyor");
}
{
  /* Görsel taraf: odak halkası ve hatalı kutu ayırt edilebilir olmalı. */
  const css = read("../app/globals.css");
  check(/\.ui-check:focus-visible/.test(css), "onay kutusunun klavye odağı görünür");
  check(/\.ui-check\[aria-invalid="true"\]/.test(css), "eksik onay kutuda da görünüyor");
}

/* ══ 2. ÇIKMAZ SAYFALARIN KENDİ EKRANI VAR ══════════════════════════════ */
/*
 * `app/not-found.tsx` ve `app/error.tsx` yokken Next'in yerleşik ekranları
 * çiziliyordu: İngilizce, markasız, TEK BİR BAĞLANTI olmadan ("404 — This
 * page could not be found."). Kullanıcının tek çıkışı geri tuşuydu.
 */
for (const [dosya, ad] of [
  ["../app/not-found.tsx", "404"],
  ["../app/error.tsx", "hata sınırı"],
  ["../app/global-error.tsx", "kök hata sınırı"],
] as const) {
  check(varMi(dosya), `${ad} sayfası var (${dosya})`);
}
{
  /* Hata sınırları İSTEMCİ bileşeni olmak zorunda. */
  for (const f of ["../app/error.tsx", "../app/global-error.tsx"]) {
    check(/^"use client";/.test(read(f).trimStart()), `${f}: istemci bileşeni`);
  }

  const hata = kodu(read("../app/error.tsx"));
  /*
   * TEKNİK AYRINTI SIZMIYOR. `error.message` istemciden gelen hatalarda
   * ORİJİNAL metni taşıyor (yığın izi, dosya yolu, sorgu parçası) ve
   * kullanıcıya hiçbir faydası yok. `digest` de öyle.
   */
  check(!/\{\s*error\.message\s*\}/.test(hata), "hata mesajı ekrana yazılmıyor");
  check(!/\{\s*error\.digest\s*\}/.test(hata), "hata digest'i ekrana yazılmıyor");
  check(/console\.error\(error\)/.test(hata), "ayrıntı günlüğe gidiyor");
  /* Kurtulma yolu: yeniden dene + çıkış. */
  check(/retry\(\)/.test(hata), "tekrar dene düğmesi sınırın retry'ını çağırıyor");
  check(/href="\/"/.test(hata), "hata ekranında ana sayfaya çıkış var");

  /*
   * TEMA. Kök yerleşimin `<head>`indeki tema betiği, sunucu çizimi sırasında
   * oluşan bir hatada HİÇ çalışmıyor: Next kendi asgari belgesini döndürüyor.
   * Ölçüldü — koyu tema seçili kullanıcı 500 ekranını beyaz zeminde görüyordu.
   */
  check(/applyStoredTheme\(\)/.test(hata), "hata ekranı tema tercihini geri koyuyor");
  const gh = kodu(read("../app/global-error.tsx"));
  check(/setAttribute\("data-tema"/.test(gh), "kök hata ekranı tema tercihini uyguluyor");
  /*
   * Ve bunu BETİKLE yapmıyor: React'in DOM'a eklediği `<script>` etiketleri
   * çalışmıyor; ilk denemede tam olarak böyle sessizce beyaz kalmıştı.
   */
  check(!/<script/.test(gh), "kök hata ekranında çalışmayan satır içi betik yok");
  check(/prefers-color-scheme: dark/.test(read("../app/global-error.tsx")),
    "kök hata ekranı seçim okunana kadar işletim sistemi temasına düşüyor");

  const nf = kodu(read("../app/not-found.tsx")) + kodu(read("../components/NotFoundView.tsx"));
  check(/href="\/"/.test(nf), "404 ekranında ana sayfaya çıkış var");
  /* Metin sözlükten geliyor — yani TR + EN. Sabit İngilizce metin geri gelmesin. */
  for (const k of ["notfound.title", "notfound.body", "notfound.home"]) {
    check(nf.includes(k), `404 metni sözlükten: ${k}`);
  }
  /* Temaya saygı: renkler jetonlardan, sabit beyaz zemin değil. */
  const kabuk = kodu(read("../components/StatusScreen.tsx"));
  check(/bg-bg/.test(kabuk) && /text-text/.test(kabuk), "çıkmaz ekranı tema jetonlarını kullanıyor");
  check(!/bg-white|#fff\b|#ffffff/i.test(kabuk), "sabit beyaz zemin yok");
}
{
  /* Sözlük parite testi anahtarların ikisini de zorluyor; burada varlıkları. */
  const dict = read("../lib/i18n-dict.ts");
  for (const k of ["notfound.title", "notfound.body", "notfound.home", "crash.title", "crash.retry"]) {
    check((dict.match(new RegExp(`"${k.replace(".", "\\.")}"`, "g")) ?? []).length === 2,
      `${k} hem tr hem en sözlüğünde`);
  }
}

/* ══ 3. HER HERKESE AÇIK SAYFANIN KENDİ BAŞLIĞI VAR ═════════════════════ */
/*
 * Kök yerleşimde bir `title.template` tanımlıydı ama hiçbir sayfa kendi
 * başlığını vermediği için şablon HİÇ kullanılmıyordu: `/`, `/tanitim`,
 * `/login`, `/register`, `/forgot-password`, `/privacy`, `/terms`, `/g`
 * sekmede birebir aynı görünüyordu. Altısı sitemap'te dizinlenebilir.
 */
{
  const layout = read("../app/layout.tsx");
  check(/template: `%s · \$\{SITE_NAME\}`/.test(layout), "başlık şablonu duruyor");

  const basliklar = new Map<string, string>();
  for (const yol of ["tanitim", "login", "register", "forgot-password", "privacy", "terms", "g"]) {
    const f = `../app/${yol}/page.tsx`;
    const src = read(f);
    /*
     * `metadata` YALNIZ sunucu bileşenlerinde çalışıyor (kılavuz:
     * generateMetadata — "Why generateMetadata is Server Component only").
     * İstemci bileşenine `export const metadata` yazmak sessizce hiçbir şey
     * yapmaz: derleme geçer, başlık gelmez. Bu yüzden iddia ikisini birden
     * kontrol ediyor.
     */
    check(!/^"use client";/.test(src.trimStart()), `/${yol}: page.tsx sunucu bileşeni`);
    check(/export const metadata: Metadata/.test(src), `/${yol}: kendi metadata'sı var`);
    const baslik = src.match(/title:\s*"([^"]+)"/)?.[1] ?? "";
    check(baslik.length > 0, `/${yol}: başlık verilmiş`);
    const aciklama = src.match(/description:\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
    check(aciklama.length > 40, `/${yol}: kendi açıklaması var`);
    basliklar.set(yol, baslik);
  }
  /* Ayırt edilebilirlik iddianın kendisi: iki sayfa aynı başlığı taşımamalı. */
  const hepsi = [...basliklar.values()];
  check(new Set(hepsi).size === hepsi.length,
    `başlıklar birbirinden farklı (${hepsi.join(" | ")})`);

  /* Kök sayfa şablonu değil, yerleşimin varsayılanını kullanıyor. */
  const kok = read("../app/page.tsx");
  check(/export const metadata: Metadata/.test(kok), "kök sayfanın metadata'sı var");
  check(!/title:/.test(kok), "kök sayfa başlığı yerleşim varsayılanından alıyor");

  /*
   * Sitemap'te dizinlenebilir denen her yolun bir başlığı olmalı — listeye
   * yeni bir yol eklenip başlığı unutulursa burası kırılır.
   */
  const sitemap = read("../app/sitemap.ts");
  const yollar = [...(sitemap.match(/const routes = \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]*)"/g)]
    .map((m) => m[1]);
  check(yollar.length >= 6, `sitemap yolları okundu (${yollar.length})`);
  for (const y of yollar) {
    if (y === "") continue; // kök: yerleşim varsayılanı
    check(basliklar.has(y.slice(1)), `sitemap'teki ${y} için başlık tanımlı`);
  }
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
