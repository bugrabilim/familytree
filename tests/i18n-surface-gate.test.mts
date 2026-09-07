import { readFileSync, readdirSync } from "node:fs";
import { tr, en } from "../lib/i18n-dict.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın ihlali değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: çevrilmemiş arayüz metni — parite testinin GÖREMEDİĞİ boşluk.
 *
 * `tests/i18n.test.mts` `tr` ve `en` yarılarını karşılaştırır: bir anahtarın
 * bir yarıda eksik olmasını yakalar. Ama `ThemeToggle` için anahtar HİÇ
 * OLUŞTURULMAMIŞTI — `aria-label="Koyu temaya geç"` doğrudan JSX'e yazılmıştı.
 * Parite iki boş kümeyi karşılaştırıp yeşil verdi; EN dilinde yedi genel
 * sayfanın hepsinde ekran okuyucu Türkçe konuşmaya devam etti. Düğmenin ikon
 * dışında metni yok, yani bu onun TEK adıydı.
 *
 * Boşluk iki yönden birden kapatılıyor:
 *   1. Genel yüzeydeki bileşenler `aria-label` / `title`ı SABİT DİZE olarak
 *      yazamaz (Türkçe de İngilizce de — "Language" da yanlıştı).
 *   2. Kaynakta istenen HER statik `t("...")` anahtarı İKİ yarıda da var
 *      olmalı: "anahtar hiç oluşturulmadı" hâli artık yakalanıyor.
 */

/* ══ 1. Genel yüzeyde sabit erişilebilir ad YOK ═════════════════════════ */
/*
 * Kapsam, oturum AÇMADAN görülen yüzey: açılış/tanıtım, kimlik ekranları,
 * hukuki sayfalar, durum ekranları. Uygulama içi diyaloglarda (PersonForm,
 * PersonNode) hâlâ sabit Türkçe etiketler var; onlar ayrı bir iş ve bu kapı
 * onları KAPSAMIYOR — kapsasaydı test kırmızı doğar, kimse de düzeltmezdi.
 */
const YUZEY = [
  "../components/ThemeToggle.tsx",
  "../components/LanguageSwitch.tsx",
  "../components/AuthShell.tsx",
  "../components/Landing.tsx",
  "../components/LegalPage.tsx",
  "../components/StatusScreen.tsx",
  "../components/NotFoundView.tsx",
  "../components/AboutDialog.tsx",
  "../app/login/LoginForm.tsx",
  "../app/register/RegisterForm.tsx",
  "../app/forgot-password/ForgotForm.tsx",
];
for (const f of YUZEY) {
  const src = kodu(read(f));
  const sabit: string[] = [];
  /* (a) Düz öznitelik:  aria-label="Koyu tema" */
  for (const m of src.matchAll(/\b(aria-label|title)="([^"]*)"/g)) sabit.push(`${m[1]}="${m[2]}"`);
  /*
   * (b) İfade içindeki dize: aria-label={dark ? "Açık temaya geç" : "…"}
   *
   * Bu dal olmadan mutasyon KAÇIYORDU: sabit metni süslü paranteze almak
   * (a)'yı atlatıp aynı arızayı geri getiriyordu. `t(` geçen ifadeler
   * geçerli — çeviri oradan zaten geliyor.
   */
  for (const m of src.matchAll(/\b(aria-label|title)=\{([^}]*)\}/g)) {
    if (/\bt\(/.test(m[2])) continue;
    if (/"[^"]*[A-Za-zçğıöşüÇĞİÖŞÜ][^"]*"|'[^']*[A-Za-zçğıöşüÇĞİÖŞÜ][^']*'/.test(m[2]))
      sabit.push(`${m[1]}={${m[2].slice(0, 60)}}`);
  }
  check(sabit.length === 0, `${f.replace("../", "")}: erişilebilir ad sözlükten geliyor (sabit: ${sabit.join(", ")})`);
}

/* ══ 2. Tema düğmesinin adı gerçekten çeviriden geliyor ═════════════════ */
{
  const src = kodu(read("../components/ThemeToggle.tsx"));
  check(/useT/.test(src), "ThemeToggle useT() kullanıyor");
  /*
   * İki hâl de çevrilmeli: yalnız biri bağlansaydı, koyu temadaki kullanıcı
   * İngilizce oturumda yine Türkçe duyardı — hatanın yarısı ayakta kalırdı.
   */
  check(/aria-label=\{dark \? t\("theme\.toLight"\) : t\("theme\.toDark"\)\}/.test(src),
    "aria-label iki hâlde de sözlükten");
  check(/title=\{dark \? t\("theme\.light"\) : t\("theme\.dark"\)\}/.test(src), "title iki hâlde de sözlükten");
}
{
  const src = kodu(read("../components/LanguageSwitch.tsx"));
  check(/aria-label=\{t\("lang\.group"\)\}/.test(src), "dil grubunun adı sözlükten (TR oturumda \"Language\" yazıyordu)");
}

/* ══ 3. İstenen HER statik anahtar İKİ yarıda da var ════════════════════ */
/*
 * Asıl kapı bu: parite yalnız VAR OLAN anahtarların iki yarısını karşılaştırır,
 * hiç oluşturulmamış anahtarı göremez. Burada yön ters — kaynağın istediği
 * anahtardan sözlüğe bakılıyor.
 *
 * Yalnız düz dizeler: `t(`auth.highlight.${k}.title`)` gibi şablonlar
 * çalışma anında kuruluyor, statik olarak çözülemez (parite testi onları
 * zaten kendi yarılarında yakalar).
 */
{
  const eksik: string[] = [];
  let sayi = 0;
  const gez = (d: string) => {
    for (const e of readdirSync(new URL(d + "/", import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) { gez(`${d}/${e.name}`); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      const src = kodu(read(`${d}/${e.name}`));
      for (const m of src.matchAll(/\bt\(\s*"([^"]+)"/g)) {
        sayi++;
        const k = m[1];
        if (!(k in tr) || !(k in en)) eksik.push(`${d}/${e.name}: ${k}`);
      }
    }
  };
  for (const d of ["../app", "../components"]) gez(d);
  check(sayi > 1000, `taranan statik anahtar sayısı beklenen büyüklükte (${sayi})`);
  check(eksik.length === 0, `her istenen anahtarın iki karşılığı da var (eksik: ${eksik.slice(0, 6).join(" | ")})`);
}

/* ══ 4. Bu turda eklenen anahtarlar iki yarıda da DOLU ══════════════════ */
for (const k of ["theme.toDark", "theme.toLight", "theme.dark", "theme.light", "lang.group", "land.footer.appearance"]) {
  check(!!tr[k]?.trim() && !!en[k]?.trim(), `${k}: TR+EN dolu`);
  /* Ve gerçekten ÇEVRİLMİŞ olmalı — iki yarıya aynı Türkçeyi kopyalamak
     pariteyi geçerdi ama İngilizce kullanıcıya hiçbir şey kazandırmazdı. */
  check(tr[k] !== en[k], `${k}: iki yarı birbirinin kopyası değil`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
