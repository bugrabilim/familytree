import {
  zodiacSign, elementOf, zodiacKey, elementKey, traitKey, traitsOf, ZODIAC_ORDER,
  type ZodiacSign,
} from "../lib/zodiac.ts";
import { maskPerson } from "../lib/privacy.ts";
import type { Person } from "../types/family.ts";
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

/* --- Sabit tarih: sınır günü uyarısı YOK ---------------------------------*/

// Burç tarihleri her yıl aynıdır. Yıla göre değişen bir sınır ya da
// "sınırdasın" uyarısı yok; sonuç yalnız burç ve elementten ibaret.
eq(Object.keys(zodiacSign("2000-04-20")!).sort(), ["element", "sign"],
  "sonuçta yalnız sign ve element var (cusp/alternative yok)");
eq(sign("2000-04-19"), "koc", "19 Nisan Koç");
eq(sign("2000-04-20"), "boga", "20 Nisan Boğa — sınır kesin");
eq(sign("2000-04-21"), "boga", "21 Nisan Boğa");

// Aynı ay/gün, farklı yıllar → HEP aynı burç
const yillar = [1900, 1950, 1999, 2000, 2001, 2004, 2023, 2024, 2100];
for (const [ay, gun, bekl] of [["03", "21", "koc"], ["04", "20", "boga"],
                                ["12", "22", "oglak"], ["01", "20", "kova"]] as const) {
  const hepsi = yillar.map((y) => sign(`${y}-${ay}-${gun}`));
  eq(new Set(hepsi).size, 1, `${ay}-${gun} tüm yıllarda aynı burç`);
  eq(hepsi[0], bekl, `${ay}-${gun} → ${bekl}`);
}

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

/* --- H10: yıl 0-99 ve gün denetimi -------------------------------------- */

// Doğrulama `Date.UTC` ile yapılınca yıl 0-99, 1900+y'ye kayıyordu:
// 0000 proleptik Gregoryen'de artık yıldır, 1900 değildir.
eq(sign("0000-02-29"), "balik", "yıl 0 artık yıl — 29 Şubat geçerli");
eq(zodiacSign("0100-02-29"), null, "yıl 100 artık değil (yüzyıl kuralı)");
eq(sign("0400-02-29"), "balik", "yıl 400 artık (400 kuralı)");
eq(zodiacSign("0001-02-29"), null, "yıl 1 artık değil");
eq(sign("0050-07-04"), "yengec", "yıl 50 normal gün");

// Var olmayan günler
eq(zodiacSign("2023-04-31"), null, "31 Nisan → null");
eq(zodiacSign("2023-06-31"), null, "31 Haziran → null");
eq(zodiacSign("2023-09-31"), null, "31 Eylül → null");
eq(zodiacSign("2023-11-31"), null, "31 Kasım → null");
eq(sign("2023-01-31"), "kova", "31 Ocak geçerli");

/* --- Karakteristik özellikler ------------------------------------------- */

// Bunlar BURÇ hakkında bilgidir, kişi hakkında iddia değildir.
for (const sg of ZODIAC_ORDER) {
  const traits = traitsOf(sg);
  check(traits.length >= 3, `${sg} en az üç özellik taşıyor (${traits.length})`);
  eq(new Set(traits).size, traits.length, `${sg} özellikleri benzersiz`);
}

// Her özelliğin TR ve EN karşılığı olmalı
let traitMiss = 0;
for (const sg of ZODIAC_ORDER) {
  for (const t of traitsOf(sg)) {
    if (!(traitKey(t) in tr)) { traitMiss++; console.log(`  ✗ TR eksik: ${traitKey(t)}`); }
    if (!(traitKey(t) in en)) { traitMiss++; console.log(`  ✗ EN eksik: ${traitKey(t)}`); }
  }
}
eq(traitMiss, 0, "tüm özelliklerin TR ve EN karşılığı var");

eq(traitKey("atilgan"), "zodiacTrait.atilgan", "özellik anahtarı");
check(traitsOf("koc").includes("atilgan"), "Koç atılgan");
check(traitsOf("boga").includes("inatci"), "Boğa inatçı");

// Etiket anahtarları da yerinde
check("zodiac.label" in tr && "zodiac.label" in en, "burç etiketi TR+EN");
check("zodiac.traits" in tr && "zodiac.traits" in en, "özellikler başlığı TR+EN");
check("zodiac.traitsNote" in tr && "zodiac.traitsNote" in en, "uyarı notu TR+EN");

// Sınır uyarısı anahtarı KALDIRILDI — sabit tarih modelinde anlamsız
check(!("zodiac.cusp" in tr) && !("zodiac.cusp" in en), "cusp anahtarı sözlükten kaldırıldı");

/* --- Gizlilik: maskeli kişide burç görünmemeli -------------------------- */

// Burç, doğum tarihinin ~1 aylık aralığını ele verir. Maskeli kişide
// birthDate taşınmadığından burç kendiliğinden boş kalmalı.
const gizli = maskPerson({
  id: "g", firstName: "A", lastName: "B", gender: "male",
  parentIds: [], spouseIds: [], birthDate: "1990-04-05",
} as unknown as Person);
eq(gizli.birthDate, undefined, "maskeli kişide doğum tarihi yok");
eq(zodiacSign(gizli.birthDate), null, "maskeli kişide burç hesaplanmıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
