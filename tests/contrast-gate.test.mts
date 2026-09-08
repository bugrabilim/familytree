import { readFileSync, readdirSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * KAPI: metin kontrastı — ölçüyü YENİDEN HESAPLAYAN test.
 *
 * Bulgu: `--text-subtle` iki temada da AA'yı (4.5) geçmiyordu. Ölçülen hâli
 * açık temada 2.82 / 3.05 / 2.65 / 2.42, koyu temada 3.56 / 3.27 / 2.95 /
 * 2.56 idi (--bg / --surface / --surface-2 / --surface-3 sırasıyla) ve
 * geçtiği yerler süs değil, KURTARMA bağlantısı ve hukuki tarih bilgisiydi.
 *
 * Bu dosya "renk şu olsun" demiyor — WCAG 2.x oranını CSS'ten okuduğu
 * değerlerle KENDİSİ hesaplıyor. Yani tasarımcı tonu değiştirebilir, yeter ki
 * eşiği geçsin; ama sessizce açıp AA'nın altına düşüremez.
 */

/* ══ WCAG 2.x göreli parlaklık + kontrast oranı ═════════════════════════ */
function hex(h: string): [number, number, number] {
  let s = h.trim().replace("#", "");
  if (s.length === 3) s = [...s].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}
const kanal = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const parlaklik = (rgb: [number, number, number]) =>
  0.2126 * kanal(rgb[0]) + 0.7152 * kanal(rgb[1]) + 0.0722 * kanal(rgb[2]);
function oran(a: string, b: string): number {
  const [y1, y2] = [parlaklik(hex(a)), parlaklik(hex(b))].sort((p, q) => q - p);
  return (y1 + 0.05) / (y2 + 0.05);
}
/* Test kendi matematiğini de doğrulasın: bilinen iki uç. */
check(Math.abs(oran("#000000", "#ffffff") - 21) < 0.01, "kontrast matematiği: siyah/beyaz 21");
check(Math.abs(oran("#777777", "#ffffff") - 4.48) < 0.02, "kontrast matematiği: #777 üzerine beyaz ≈ 4.48");

const css = read("../app/globals.css");

/** `:root { … }` ya da `.dark { … }` bloğundan token okur. */
function blok(secici: string): Record<string, string> {
  const i = css.indexOf(secici + " {");
  const son = css.indexOf("\n}", i);
  const govde = css.slice(i, son);
  const m: Record<string, string> = {};
  for (const t of govde.matchAll(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/gm)) m[t[1]] = t[2];
  return m;
}
const acik = blok(":root");
const koyu = blok(".dark");

/* ══ 1. Metin tokenleri HER zeminde AA geçiyor ══════════════════════════ */
/*
 * Dört zeminin hepsi: "birinde geçiyor" demek, o metnin geçmediği zeminde
 * çizilmediğini varsaymaktır — açılır menü satırı `--surface-3`e, kart
 * `--surface`e, sayfa `--bg`ye oturuyor; hepsi gerçek.
 */
const ZEMIN = ["--bg", "--surface", "--surface-2", "--surface-3"] as const;
const METIN = ["--text", "--text-muted"] as const;
for (const [ad, tema] of [["açık", acik], ["koyu", koyu]] as const) {
  for (const m of METIN) {
    check(!!tema[m], `${ad} tema: ${m} tanımlı`);
    for (const z of ZEMIN) {
      check(!!tema[z], `${ad} tema: ${z} tanımlı`);
      if (!tema[m] || !tema[z]) continue;
      const k = oran(tema[m], tema[z]);
      check(k >= 4.5, `${ad} tema: ${m} (${tema[m]}) / ${z} (${tema[z]}) = ${k.toFixed(2)} — AA eşiği 4.5`);
    }
  }
}

/* ══ 1b. `--accent` ÇİFTİ de AA geçiyor ═════════════════════════════════ */
/*
 * Geçen tur yalnız `--text*` tokenlerini taramıştı; `--accent` "marka rengi"
 * diye kapsam dışı kalmıştı. Ama o renk METİN olarak çiziliyor — kuşak /
 * akrabalık rozeti (PersonDrawer), takvimde "Bugün" işareti, haritada seçili
 * yer etiketi, tarif süzgeçleri — ve ölçüldüğünde dördü de eşiğin altındaydı:
 *
 *   #ffffff / --accent (koyu #d0a065)      2.36   ← "odak" rozeti, 🤝 nub
 *   #ffffff / --accent (açık #a8763e)      3.94   ← aynı
 *   --accent / --accent-soft (açık)        3.45   ← rozet + süzgeç etiketleri
 *   --accent / --surface (açık)            3.94   ← takvim bölüm başlığı
 *
 * İki ayrı rol vardı ve tek token taşıyordu: ZEMİN olarak marka rengi ve
 * METİN olarak marka rengi. Ayrıldılar — `--accent` (açık temada koyulaştı)
 * metin rolünü, `--accent-on` ise dolgunun ÜSTÜNDEKİ metni taşıyor.
 *
 * Aşağısı da oranı kendisi hesaplıyor: ton değişebilir, eşik değişemez.
 */
for (const [ad, tema] of [["açık", acik], ["koyu", koyu]] as const) {
  check(!!tema["--accent"], `${ad} tema: --accent tanımlı`);
  check(!!tema["--accent-soft"], `${ad} tema: --accent-soft tanımlı`);
  check(!!tema["--accent-on"], `${ad} tema: --accent-on tanımlı`);
  if (!tema["--accent"] || !tema["--accent-soft"] || !tema["--accent-on"]) continue;
  /* METİN rolü: dört zeminin hepsi + `--accent-soft` (rozetlerin zemini). */
  for (const z of [...ZEMIN, "--accent-soft"] as const) {
    const k = oran(tema["--accent"], tema[z]);
    check(k >= 4.5, `${ad} tema: --accent (${tema["--accent"]}) / ${z} (${tema[z]}) = ${k.toFixed(2)} — AA eşiği 4.5`);
  }
  /* DOLGU rolü: `bg-accent` üzerine konan metin. */
  const kd = oran(tema["--accent-on"], tema["--accent"]);
  check(kd >= 4.5, `${ad} tema: --accent-on (${tema["--accent-on"]}) / --accent (${tema["--accent"]}) = ${kd.toFixed(2)} — AA eşiği 4.5`);
}
{
  /*
   * Ve `bg-accent` dolgusunun üstüne DÜZ `text-white` yazılmıyor: koyu
   * temada tam olarak bu 2.36'yı üretiyordu ve hiçbir derleme hatası
   * vermiyordu. İddia kaynak düzeyinde, çünkü CSS'ten görülemez.
   */
  const gez = (d: string, bul: string[]) => {
    for (const e of readdirSync(new URL(d + "/", import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) { gez(`${d}/${e.name}`, bul); continue; }
      if (!e.name.endsWith(".tsx")) continue;
      const src = read(`${d}/${e.name}`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/bg-accent(?![-\w/])[^"`\n]*\btext-white\b|\btext-white\b[^"`\n]*bg-accent(?![-\w/])/.test(src)) bul.push(`${d}/${e.name}`);
    }
  };
  const bulunan: string[] = [];
  for (const d of ["../app", "../components"]) gez(d, bulunan);
  check(bulunan.length === 0, `bg-accent üstünde text-white yok (bulundu: ${bulunan.join(", ")})`);
  const cssKod = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check(/--color-accent-on: var\(--accent-on\);/.test(cssKod), "@theme eşlemesi var (Tailwind `text-accent-on` üretebilsin)");
}

/* ══ 2. `--text-subtle` GERİ GELMİYOR ═══════════════════════════════════ */
/*
 * Neden emekliye ayrıldı: kendi ton rampasında dört zeminde birden 4.5'i
 * geçen EN AÇIK renk açık temada #6b665c (L* 43.4) — `--text-muted`
 * (#6d675b, L* 43.8) ile arasında 0.4 L* fark var; koyu temada sınır #9e9685
 * (L* 62.2), `--text-muted` #a09a8c (L* 63.7), fark 1.5 L*. Yani "geçen bir
 * --text-subtle" gözle --text-muted'den ayırt edilemez.
 *
 * İddia KAYNAK DÜZEYİNDE ve TÜM ağaçta: Tailwind v4 tanımsız bir yardımcıyı
 * hata vermeden yok sayıyor, yani geri gelen tek bir `text-text-subtle`
 * sınıfı derlemeyi kırmaz — metni sessizce miras rengine düşürür.
 */
{
  const gecerli = (p: string) => /\.(tsx|ts|css)$/.test(p);
  const bulunan: string[] = [];
  const gez = (d: string) => {
    for (const e of readdirSync(new URL(d + "/", import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) { gez(`${d}/${e.name}`); continue; }
      if (!gecerli(e.name)) continue;
      const src = read(`${d}/${e.name}`)
        /* Yorumlar hariç: bu kararı ANLATAN metin, kararın ihlali değil. */
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/text-subtle/.test(src)) bulunan.push(`${d}/${e.name}`);
    }
  };
  for (const d of ["../app", "../components", "../lib"]) gez(d);
  check(bulunan.length === 0, `emekli token hiçbir yerde kullanılmıyor (bulundu: ${bulunan.join(", ")})`);
  const cssKod = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check(!/--color-text-subtle/.test(cssKod), "@theme eşlemesi de silinmiş (Tailwind sınıfı üretemesin)");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
