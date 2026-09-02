import {
  zodiacSign, elementOf, zodiacKey, elementKey, ZODIAC_ORDER,
  type ZodiacSign,
} from "../lib/zodiac.ts";
import { tr, en } from "../lib/i18n-dict.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}
const sign = (d: string) => zodiacSign(d)?.sign;

/* --- i18n bütünlüğü ------------------------------------------------------ */

eq(ZODIAC_ORDER.length, 12, "on iki burç");
eq(new Set(ZODIAC_ORDER).size, 12, "burçlar benzersiz");
let miss = 0;
for (const s of ZODIAC_ORDER) {
  if (!(zodiacKey(s) in tr)) { miss++; console.log(`  ✗ TR eksik: ${zodiacKey(s)}`); }
  if (!(zodiacKey(s) in en)) { miss++; console.log(`  ✗ EN eksik: ${zodiacKey(s)}`); }
}
for (const e of ["ates", "toprak", "hava", "su"] as const) {
  if (!(elementKey(e) in tr) || !(elementKey(e) in en)) miss++;
}
eq(miss, 0, "tüm burç ve element adları TR+EN");

/* --- Ay ortası: sınırdan uzak, kesin --------------------------------------*/

const mid: Array<[string, ZodiacSign]> = [
  ["2000-01-10", "oglak"], ["2000-02-05", "kova"], ["2000-03-05", "balik"],
  ["2000-04-05", "koc"],   ["2000-05-05", "boga"], ["2000-06-05", "ikizler"],
  ["2000-07-05", "yengec"],["2000-08-05", "aslan"],["2000-09-05", "basak"],
  ["2000-10-05", "terazi"],["2000-11-05", "akrep"],["2000-12-05", "yay"],
];
for (const [d, want] of mid) eq(sign(d), want, `ay ortası ${d}`);

// Oğlak yıl sınırını aşar
eq(sign("2000-12-25"), "oglak", "25 Aralık Oğlak");
eq(sign("2000-01-01"), "oglak", "1 Ocak hâlâ Oğlak");
eq(sign("2000-12-31"), "oglak", "yıl sonu Oğlak");

/* --- Elementler ----------------------------------------------------------- */

eq(elementOf("koc"), "ates", "Koç ateş");
eq(elementOf("boga"), "toprak", "Boğa toprak");
eq(elementOf("ikizler"), "hava", "İkizler hava");
eq(elementOf("yengec"), "su", "Yengeç su");
// Her elementte tam üç burç olmalı
const counts = new Map<string, number>();
for (const s of ZODIAC_ORDER) counts.set(elementOf(s), (counts.get(elementOf(s)) ?? 0) + 1);
eq([...counts.values()].sort(), [3, 3, 3, 3], "her elementte üç burç");
eq(zodiacSign("2000-04-05")?.element, "ates", "sonuç elementi taşır");

/* --- ASIL DÜRÜSTLÜK: sınır günleri --------------------------------------- */

// Sınırdan uzak günler sınırda İŞARETLENMEMELİ
for (const [d] of mid) eq(zodiacSign(d)?.cusp, false, `ay ortası sınırda değil: ${d}`);
for (const [d] of mid) eq(zodiacSign(d)?.alternative, null, `ay ortasında alternatif yok: ${d}`);

// Geçiş günü ve komşusu sınırda İŞARETLENMELİ
const r20 = zodiacSign("2000-04-20")!;
eq(r20.sign, "boga", "20 Nisan Boğa (tabloya göre)");
eq(r20.cusp, true, "geçiş günü sınırda");
eq(r20.alternative, "koc", "alternatif önceki burç");

const r19 = zodiacSign("2000-04-19")!;
eq(r19.sign, "koc", "19 Nisan Koç");
eq(r19.cusp, true, "geçişin bir gün öncesi de sınırda");
eq(r19.alternative, "boga", "alternatif sonraki burç");

// Geçişten iki gün uzak artık sınırda değil
eq(zodiacSign("2000-04-22")?.cusp, false, "geçişten iki gün sonra sınır bitti");
eq(zodiacSign("2000-04-17")?.cusp, false, "geçişten iki gün önce sınır yok");

// Yıl sınırındaki geçiş de yakalanmalı
const rOglak = zodiacSign("2000-12-22")!;
eq(rOglak.sign, "oglak", "22 Aralık Oğlak");
eq(rOglak.cusp, true, "Yay→Oğlak geçişi sınırda");
eq(rOglak.alternative, "yay", "alternatif Yay");

// Her burcun bir başlangıç sınırı olmalı — 12 geçiş
let cuspDays = 0;
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= 31; d++) {
    const iso = `2001-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const r = zodiacSign(iso);
    if (r?.cusp) cuspDays++;
  }
}
eq(cuspDays, 24, "12 geçişin her biri iki günü sınırda yapar");

/* --- Tüm yıl kapsanmalı --------------------------------------------------- */

const seen = new Set<ZodiacSign>();
let days = 0;
for (let m = 1; m <= 12; m++) {
  for (let d = 1; d <= 31; d++) {
    const iso = `2001-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const r = zodiacSign(iso);
    if (r) { seen.add(r.sign); days++; }
  }
}
eq(seen.size, 12, "yıl boyunca on iki burcun hepsi çıkar");
eq(days, 365, "2001'in 365 günü de burç veriyor");

/* --- Kısmi ve geçersiz tarihler ------------------------------------------ */

eq(zodiacSign("2000"), null, "yalnız yıl → null");
eq(zodiacSign("2000-04"), null, "yıl-ay → null");
eq(zodiacSign(undefined), null, "tanımsız → null");
eq(zodiacSign(""), null, "boş → null");
eq(zodiacSign("abc"), null, "geçersiz metin → null");
eq(zodiacSign("2000-13-01"), null, "geçersiz ay → null");
eq(zodiacSign("2000-02-31"), null, "var olmayan gün → null");
eq(sign("2000-02-29"), "balik", "artık gün geçerli");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
