import {
  observancesFor, memorialCalendar, upcomingMemorials, observanceKey,
  DEFAULT_OBSERVANCES, DEFAULT_OFFSETS, type ObservanceKind,
} from "../lib/memorials.ts";
import { hijriAnniversariesInGregorianYear, hijriYearsBetween } from "../lib/hijri.ts";
import { tr, en } from "../lib/i18n-dict.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}

const P = (id: string, deathDate?: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: "X", gender: "unknown",
  parentIds: [], spouseIds: [], deathDate, ...extra,
} as Person);

const WIDE = { from: "1900-01-01", to: "2100-12-31" };
const dates = (o: { date: string }[]) => o.map((x) => x.date);
const kinds = (o: { kind: string }[]) => o.map((x) => x.kind);

/* --- i18n bütünlüğü ------------------------------------------------------ */

const all: ObservanceKind[] = [
  "gece3", "gece7", "gece40", "gece52", "seneiDevriye", "seneiDevriyeHicri",
];
let miss = 0;
for (const k of all) {
  if (!(observanceKey(k) in tr)) { miss++; console.log(`  ✗ TR eksik: ${observanceKey(k)}`); }
  if (!(observanceKey(k) in en)) { miss++; console.log(`  ✗ EN eksik: ${observanceKey(k)}`); }
}
eq(miss, 0, "tüm anmaların TR ve EN adı var");

/* --- Geceler: gün aritmetiği --------------------------------------------- */

const olen = P("a", "2020-01-01");
const nights = observancesFor(olen, WIDE, { enabled: ["gece3", "gece7", "gece40", "gece52"] });
eq(dates(nights), ["2020-01-04", "2020-01-08", "2020-02-10", "2020-02-22"],
  "3/7/40/52. gece gün sayısına göre");
eq(kinds(nights), ["gece3", "gece7", "gece40", "gece52"], "türler doğru");
eq(DEFAULT_OFFSETS.gece40, 40, "kırkıncı gece varsayılanı 40 gün");

// Ay ve yıl sınırını aşan sayım
eq(dates(observancesFor(P("b", "2019-12-01"), WIDE, { enabled: ["gece52"] })),
  ["2020-01-22"], "52. gece yıl sınırını aşabiliyor");
// Artık yıl içinden geçen sayım
eq(dates(observancesFor(P("c", "2020-02-01"), WIDE, { enabled: ["gece40"] })),
  ["2020-03-12"], "artık yılda 29 Şubat sayıma dâhil");
eq(dates(observancesFor(P("c", "2019-02-01"), WIDE, { enabled: ["gece40"] })),
  ["2019-03-13"], "artık olmayan yılda bir gün önce");

/* --- BETİMLEYİCİ: yapılandırılabilir olmalı ------------------------------ */

eq(DEFAULT_OBSERVANCES.includes("gece3"), false, "3. gece varsayılanda kapalı — her hanede tutulmaz");
eq(DEFAULT_OBSERVANCES.includes("seneiDevriyeHicri"), false, "hicri yıl dönümü isteğe bağlı");
check(DEFAULT_OBSERVANCES.includes("gece40") && DEFAULT_OBSERVANCES.includes("seneiDevriye"),
  "yaygın olanlar varsayılanda açık");

// Aile gün sayısını değiştirebilmeli — yöreye göre değişir
eq(dates(observancesFor(olen, WIDE, { enabled: ["gece7"], offsets: { gece7: 6 } })),
  ["2020-01-07"], "gün sayısı ailenin elinde");

// Hiçbiri seçilmezse hiçbir şey üretilmez
eq(observancesFor(olen, WIDE, { enabled: [] }), [], "boş yapılandırma → anma yok");

/* --- Sene-i devriye ------------------------------------------------------ */

const yearly = observancesFor(P("d", "2020-06-15"), { from: "2020-01-01", to: "2023-12-31" },
  { enabled: ["seneiDevriye"] });
eq(dates(yearly), ["2021-06-15", "2022-06-15", "2023-06-15"], "her yıl tekrar eder");
eq(yearly.map((o) => o.year), [1, 2, 3], "kaçıncı yıl sayılıyor");
// Ölüm yılı sene-i devriye değildir
check(!dates(yearly).includes("2020-06-15"), "ölüm yılı yıl dönümü sayılmaz");

// 29 Şubat'ta ölen: artık olmayan yılda 28'e kırpılır
const leap = observancesFor(P("e", "2020-02-29"), { from: "2021-01-01", to: "2024-12-31" },
  { enabled: ["seneiDevriye"] });
eq(dates(leap), ["2021-02-28", "2022-02-28", "2023-02-28", "2024-02-29"],
  "29 Şubat artık olmayan yıllarda 28'e kırpılır");

/* --- Tam tarih şart ------------------------------------------------------ */

eq(observancesFor(P("f", "2020"), WIDE), [], "yalnız yıl → anma üretilmez");
eq(observancesFor(P("g", "2020-06"), WIDE), [], "yıl-ay → anma üretilmez");
eq(observancesFor(P("h"), WIDE), [], "ölüm tarihi yoksa anma yok");
eq(observancesFor(P("i", "2020-02-31"), WIDE), [], "var olmayan gün → anma yok");
eq(observancesFor(P("j", "abc"), WIDE), [], "geçersiz metin → anma yok");

/* --- Pencere ------------------------------------------------------------- */

const win = observancesFor(P("k", "2020-01-01"), { from: "2020-02-01", to: "2020-02-28" },
  { enabled: ["gece7", "gece40", "gece52"] });
eq(dates(win), ["2020-02-10", "2020-02-22"], "pencere dışındakiler elenir");
eq(observancesFor(P("l", "2020-01-01"), { from: "2020-03-01", to: "2020-03-31" },
  { enabled: ["gece7"] }), [], "pencerede hiç yoksa boş");
// Sınırlar dâhil
eq(dates(observancesFor(P("m", "2020-01-01"), { from: "2020-01-08", to: "2020-01-08" },
  { enabled: ["gece7"] })), ["2020-01-08"], "pencere sınırı dâhil");
eq(observancesFor(P("n", "2020-01-01"), { from: "2020-12-31", to: "2020-01-01" }), [],
  "ters pencere → boş");

/* --- Hicri: dışarıdan enjekte ------------------------------------------- */

const noHijri = observancesFor(P("o", "2020-06-15"), { from: "2021-01-01", to: "2021-12-31" },
  { enabled: ["seneiDevriyeHicri"] });
eq(noHijri, [], "fonksiyon verilmezse hicri anma üretilmez");

const withHijri = observancesFor(P("p", "2020-06-15"), { from: "2021-01-01", to: "2021-12-31" },
  { enabled: ["seneiDevriyeHicri"], hijriAnniversaries: hijriAnniversariesInGregorianYear });
check(withHijri.length >= 1, `hicri yıl dönümü üretildi (${withHijri.length})`);
check(withHijri.every((o) => o.kind === "seneiDevriyeHicri"), "türü doğru");
check(withHijri.every((o) => o.date >= "2021-01-01" && o.date <= "2021-12-31"), "pencerede");
// Hicri yıl ~354 gün: miladi yıl dönümünden ERKEN düşer
const gregorian = observancesFor(P("p", "2020-06-15"), { from: "2021-01-01", to: "2021-12-31" },
  { enabled: ["seneiDevriye"] });
check(withHijri[0].date < gregorian[0].date, "hicri yıl dönümü miladiden erken düşer");

/* --- Tüm ağaç ------------------------------------------------------------ */

const tree = [
  P("x", "2020-01-01"),
  P("y", "2020-01-05"),
  P("z"),                    // yaşıyor
  P("w", "2020"),            // kısmi tarih
];
const cal = memorialCalendar(tree, { from: "2020-01-01", to: "2020-01-31" },
  { enabled: ["gece7"] });
eq(dates(cal), ["2020-01-08", "2020-01-12"], "tüm ağaç, tarihe göre sıralı");
check(cal.every((o) => o.personId === "x" || o.personId === "y"),
  "yaşayan ve kısmi tarihli kişi takvime girmez");
eq(memorialCalendar([], WIDE), [], "boş ağaç");

// Aynı güne düşenler kararlı sırada
const sameDay = memorialCalendar([P("b1", "2020-01-01"), P("a1", "2020-01-01")],
  { from: "2020-01-01", to: "2020-12-31" }, { enabled: ["gece7"] });
eq(sameDay.map((o) => o.personId), ["a1", "b1"], "aynı günde kimliğe göre kararlı");

/* --- Yaklaşan anmalar ---------------------------------------------------- */

const today = new Date("2020-02-01T13:45:00Z");
const soon = upcomingMemorials([P("q", "2020-01-01")], { today, days: 30 },
  { enabled: ["gece40", "gece52"] });
eq(dates(soon), ["2020-02-10", "2020-02-22"], "30 gün içindekiler");
eq(upcomingMemorials([P("r", "2020-01-01")], { today, days: 5 },
  { enabled: ["gece40"] }), [], "pencere dışı");
// Bugün olan anma dâhil
eq(dates(upcomingMemorials([P("s", "2019-12-23")], { today, days: 0 },
  { enabled: ["gece40"] })), ["2020-02-01"], "bugünkü anma dâhil");

/* --- H3: ölümün KENDİ miladi yılındaki hicri devriye kaybolmamalı -------- */

// Hicri yıl ~354 gün: devriye, ölümün kendi miladi yılı içinde ikinci kez
// düşebilir. Miladi yıl farkı 1'den küçük diye atlamak onu kaybediyordu.
const HCFG = {
  enabled: ["seneiDevriyeHicri" as const],
  hijriAnniversaries: hijriAnniversariesInGregorianYear,
  hijriYearsBetween,
};
const ölüm = "2000-01-01";
const aynıYıl = observancesFor(P("h1", ölüm), { from: "2000-01-01", to: "2000-12-31" }, HCFG);
eq(dates(aynıYıl), ["2000-12-21"], "ölüm yılındaki hicri devriye üretiliyor");
eq(aynıYıl[0]?.year, 1, "ilk hicri devriye 1. yıl");

// Ölüm gününün KENDİSİ devriye değildir
check(!dates(aynıYıl).includes(ölüm), "ölüm gününün kendisi devriye sayılmaz");

/* --- H4: devriye numarası HİCRİ farktan gelmeli ------------------------- */

const uzun = observancesFor(P("h2", ölüm), { from: "2001-01-01", to: "2032-12-31" }, HCFG);
for (const o of uzun) {
  const gercek = hijriYearsBetween(ölüm, o.date);
  if (o.year !== gercek) {
    fail++; console.log(`✗ ${o.date}: year=${o.year}, gerçek hicri fark=${gercek}`);
  } else ok++;
}
check(uzun.length > 30, `uzun pencerede çok devriye üretildi (${uzun.length})`);

// Bir miladi yıla iki devriye düşerse FARKLI numara almalı
const iki = uzun.filter((o) => o.date.startsWith("2032"));
eq(iki.length, 2, "2032'de iki hicri devriye var");
check(iki[0]?.year !== iki[1]?.year, `aynı yıldaki iki devriye farklı numara alıyor (${iki[0]?.year}, ${iki[1]?.year})`);
eq(iki.map((o) => o.year), [33, 34], "numaralar hicri farka göre 33 ve 34");

// Miladi fark hicri farktan KÜÇÜK olmalı (32 miladi ≈ 33 hicri)
const miladi = observancesFor(P("h3", ölüm), { from: "2032-01-01", to: "2032-12-31" },
  { enabled: ["seneiDevriye"] });
eq(miladi.length, 1, "miladi devriye yılda bir");
check((miladi[0]?.year ?? 0) < (iki[0]?.year ?? 0),
  `miladi sayı (${miladi[0]?.year}) hicri sayıdan (${iki[0]?.year}) küçük`);

// Devriye numaraları hep artmalı ve 1'den başlamalı
const seq = observancesFor(P("h4", ölüm), { from: "2000-01-01", to: "2020-12-31" }, HCFG);
eq(seq[0]?.year, 1, "ilk devriye 1");
check(seq.every((o, i) => i === 0 || (o.year ?? 0) > (seq[i - 1].year ?? 0)),
  "devriye numaraları artıyor");
check(seq.every((o) => (o.year ?? 0) >= 1), "hiçbir devriye 0 ya da negatif değil");

/* --- hijriYearsBetween verilmezse SAYI BASILMAZ ------------------------- */

// Yanlış bir sayı basmaktansa hiç basmamak doğru.
const sayısız = observancesFor(P("h5", ölüm), { from: "2001-01-01", to: "2001-12-31" },
  { enabled: ["seneiDevriyeHicri"], hijriAnniversaries: hijriAnniversariesInGregorianYear });
check(sayısız.length > 0, "sayaç verilmese de anma üretiliyor");
eq(sayısız[0]?.year, undefined, "sayaç yoksa year boş bırakılıyor");

/* --- Miladi devriye bu değişiklikten etkilenmemeli ---------------------- */

const sadeceMiladi = observancesFor(P("h6", "2020-06-15"), { from: "2020-01-01", to: "2023-12-31" },
  { enabled: ["seneiDevriye"] });
eq(dates(sadeceMiladi), ["2021-06-15", "2022-06-15", "2023-06-15"], "miladi devriye aynı");
eq(sadeceMiladi.map((o) => o.year), [1, 2, 3], "miladi numaralar aynı");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
