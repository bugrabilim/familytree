/**
 * SAYFA KABUĞU KAPISI — tarayıcı incelemesinin iki küçük ama kalıcı bulgusu.
 *
 * İkisi de "bir kez düzeltilir, sonra sessizce geri gelir" türünden:
 *   · Dekoratif pazarlama metni yeniden bir başlık etiketine dönerse, sayfanın
 *     gerçek `h1`i başlık ana hattında ikinci sıraya düşer ve ekran okuyucu
 *     kullanıcısı sayfanın ne olduğunu ikinci sırada duyar.
 *   · Telif yılı yeniden sabitlenirse, sabitlendiği yıldan sonraki ilk gün
 *     site terk edilmiş görünmeye başlar — düzeltilen hatanın ta kendisi.
 *
 * Kaynak düzeyi denetim: bu iki kural çalışma zamanında değil, yazılırken
 * bozuluyor.
 */
import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}

/** Yorumları at — `{/* … *\/}` blokları da dahil, yoksa gerekçe metni eşleşir. */
function kodu(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const authShell = kodu(readFileSync("components/AuthShell.tsx", "utf8"));
const landing = kodu(readFileSync("components/Landing.tsx", "utf8"));
const anaSayfa = kodu(readFileSync("app/page.tsx", "utf8"));
const tanitim = kodu(readFileSync("app/tanitim/page.tsx", "utf8"));

/* --- 1) Başlık sırası ---------------------------------------------------- */

// Yan paneldeki pazarlama metni bir BAŞLIK olmamalı.
check(
  !/<h[1-6][^>]*>\s*\{t\("auth\.heroTitle1"\)/.test(authShell),
  "auth.heroTitle1 bir başlık etiketinde DEĞİL (dekoratif metin)"
);
check(
  /<p[^>]*>\s*\{t\("auth\.heroTitle1"\)/.test(authShell),
  "auth.heroTitle1 paragraf olarak yazılıyor"
);

// Sayfanın gerçek başlığı hâlâ h1 olmalı — süsü paragrafa çevirirken
// gerçeğini de düşürmek, sorunu çözmek değil ortadan kaldırmak olurdu.
check(/<h1[^>]*>\{title\}<\/h1>/.test(authShell), "sayfa başlığı hâlâ h1");

// Ve h1, dosyadaki İLK başlık olmalı.
const basliklar = [...authShell.matchAll(/<h([1-6])[\s>]/g)].map((m) => m[1]);
check(basliklar.length > 0, "AuthShell'de en az bir başlık var");
check(basliklar[0] === "1", `ilk başlık h1 olmalı (bulunan: h${basliklar[0]})`);

/* --- 2) Telif yılı ------------------------------------------------------- */

// Sabit tek yıl kalmamalı.
check(!/©\s*2013\s*\{t\(/.test(landing), "alt bilgide sabit '© 2013' yok");
check(/©\s*2013–\{year\}/.test(landing), "telif yılı aralığı `year`den geliyor");

// `year` PROP olmalı: Landing bir istemci bileşeni ve burada
// `new Date()` çağırmak yılbaşı gecesinde hidrasyon uyuşmazlığı demek.
check(/year:\s*number/.test(landing), "Landing `year` propunu tip düzeyinde alıyor");
check(!/new Date\(\)/.test(landing), "Landing içinde `new Date()` YOK (hidrasyon)");

// Her iki çağıran da yılı geçmeli; biri unutulursa o sayfa derlenmez ama
// bu iddia hatayı testte, tsc'yi beklemeden söyler.
for (const [ad, src] of [["app/page.tsx", anaSayfa], ["app/tanitim/page.tsx", tanitim]] as const) {
  check(/<Landing[^>]*year=\{new Date\(\)\.getFullYear\(\)\}/.test(src), `${ad} yılı sunucuda hesaplayıp geçiyor`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
