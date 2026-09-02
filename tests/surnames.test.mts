import { aggregateSurnames, surnamesByPlace } from "../lib/surnames.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}

const P = (id: string, lastName: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName, gender: "unknown",
  parentIds: [], spouseIds: [], ...extra,
} as Person);

/* --- Temel sayım --------------------------------------------------------- */

const basic = [
  P("1", "Yılmaz"), P("2", "Yılmaz"), P("3", "Yılmaz"),
  P("4", "Kaya"), P("5", "Kaya"),
  P("6", "Demir"),
];
const b = aggregateSurnames(basic);
eq(b.surnames.map((s) => [s.surname, s.count]),
  [["Yılmaz", 3], ["Kaya", 2], ["Demir", 1]], "çoktan aza sıralı");
eq(b.total, 6, "toplam kişi");
eq(b.patronymicOnly, 0, "patronimli yok");
eq(b.unnamed, 0, "adsız yok");
eq(b.surnames[0].personIds, ["1", "2", "3"], "kişi kimlikleri taşınıyor");
eq(aggregateSurnames([]).surnames, [], "boş ağaç");
eq(aggregateSurnames([]).total, 0, "boş ağaçta toplam 0");

// Eşit sayıda Türkçe alfabetik — kararlı sıra
const tie = [P("1", "Çelik"), P("2", "Arslan"), P("3", "Zorlu"), P("4", "İnal")];
eq(aggregateSurnames(tie).surnames.map((s) => s.surname),
  ["Arslan", "Çelik", "İnal", "Zorlu"], "eşitlikte Türkçe alfabetik");

/* --- ASIL MESELE: 1934 öncesi kayıtlar ---------------------------------- */

const preLaw = [
  P("1", "Yılmaz"),
  P("2", "", { patronymic: "Bali oğlu" }),
  P("3", "", { patronymic: "Veli kızı" }),
  P("4", ""),                                  // ne soyad ne patronim
];
const pl = aggregateSurnames(preLaw);
eq(pl.patronymicOnly, 2, "1934 öncesi kayıtlar ayrı sayılır");
eq(pl.unnamed, 1, "gerçekten eksik olan ayrı sayılır");
eq(pl.surnames.length, 1, "patronimliler soyad grubuna girmez");
eq(pl.surnames[0].count, 1, "yalnız soyadı olan sayıldı");
// Patronimli kişi "eksik" sayılmamalı — bu ayrım işin bütün noktası
check(pl.patronymicOnly !== pl.unnamed, "patronimli ile eksik ayrı kovalar");

// Boşluk-yalnız soyad eksik sayılır
eq(aggregateSurnames([P("1", "   ")]).unnamed, 1, "boşluk soyad eksik sayılır");
eq(aggregateSurnames([P("1", "   ", { patronymic: "Ali oğlu" })]).patronymicOnly, 1,
  "boşluk soyad + patronim → patronimli");
// Noktalama-yalnız soyad da eksik (katlama sonrası boşalır)
eq(aggregateSurnames([P("1", "--")]).unnamed, 1, "anlamsız soyad eksik sayılır");

/* --- Türkçe katlama ------------------------------------------------------ */

const folded = [
  P("1", "İNCE"), P("2", "İnce"), P("3", "ince"), P("4", "İnce"),
];
const f = aggregateSurnames(folded);
eq(f.surnames.length, 1, "büyük/küçük harf varyantları tek soyad");
eq(f.surnames[0].count, 4, "hepsi aynı grupta");
eq(f.surnames[0].surname, "İnce", "gösterimde EN SIK özgün yazım");
check(f.surnames[0].key !== "İnce", "anahtar katlanmış, gösterimden farklı");

// Türkçe karakterler katlanır ama gösterim korunur
const diacritic = [P("1", "Şahin"), P("2", "SAHIN"), P("3", "Şahin")];
eq(aggregateSurnames(diacritic).surnames.length, 1, "ş/s katlanır");
eq(aggregateSurnames(diacritic).surnames[0].surname, "Şahin", "özgün yazım korunur");

// Baştaki/sondaki boşluk gruplamayı bozmaz
eq(aggregateSurnames([P("1", " Kaya "), P("2", "Kaya")]).surnames[0].count, 2,
  "boşluk kırpılır");

/* --- Yer kümelenmesi (harita katmanının verisi) ------------------------- */

const withPlaces = [
  P("1", "Yılmaz", { birthPlace: "Sivas" }),
  P("2", "Yılmaz", { birthPlace: "Sivas" }),
  P("3", "Yılmaz", { birthPlace: "İstanbul" }),
  P("4", "Kaya", { birthPlace: "İstanbul" }),
  P("5", "Kaya"),                                  // doğum yeri yok
];
const wp = aggregateSurnames(withPlaces);
const yilmaz = wp.surnames.find((s) => s.surname === "Yılmaz")!;
eq(yilmaz.places, [{ place: "Sivas", count: 2 }, { place: "İstanbul", count: 1 }],
  "soyadın yerleri çoktan aza");
eq(wp.surnames.find((s) => s.surname === "Kaya")!.places, [{ place: "İstanbul", count: 1 }],
  "doğum yeri olmayan kişi yer sayımına girmez");
eq(wp.surnames.find((s) => s.surname === "Kaya")!.count, 2,
  "ama soyad sayımına girer");

/* --- Zaman aralığı ------------------------------------------------------- */

const dated = [
  P("1", "Yılmaz", { birthDate: "1890" }),
  P("2", "Yılmaz", { birthDate: "1955-03-12" }),
  P("3", "Yılmaz", { birthDate: "1930-06" }),
  P("4", "Yılmaz"),                                // tarih yok
];
const d = aggregateSurnames(dated).surnames[0];
eq(d.firstBirthYear, 1890, "en erken doğum yılı");
eq(d.lastBirthYear, 1955, "en geç doğum yılı");
eq(d.count, 4, "tarihsiz kişi de sayılır");
eq(aggregateSurnames([P("1", "Kaya")]).surnames[0].firstBirthYear, null,
  "hiç tarih yoksa null");

/* --- Yer merkezli görünüm ------------------------------------------------ */

const bp = surnamesByPlace(withPlaces);
// Türk alfabesinde i harfi s'den önce gelir → İstanbul, Sivas'tan önce
eq(bp.map((x) => [x.place, x.count]), [["İstanbul", 2], ["Sivas", 2]],
  "yerler çoktan aza, eşitlikte Türkçe alfabetik (i < s)");
eq(bp.find((x) => x.place === "İstanbul")!.surnames.map((s) => s.surname).sort(),
  ["Kaya", "Yılmaz"], "bir yerdeki soyadlar listeleniyor");
eq(bp.find((x) => x.place === "Sivas")!.surnames, [{ surname: "Yılmaz", count: 2 }],
  "tek soyadlı yer");

// Patronimli kayıtlar soyad haritasına girmez
const mixedPlace = [
  P("1", "Yılmaz", { birthPlace: "Sivas" }),
  P("2", "", { birthPlace: "Sivas", patronymic: "Bali oğlu" }),
];
eq(surnamesByPlace(mixedPlace)[0].count, 1,
  "soyad haritası nüfus haritası değil — patronimli sayılmaz");

eq(surnamesByPlace([]), [], "boş ağaçta yer yok");
eq(surnamesByPlace([P("1", "Kaya")]), [], "doğum yeri yoksa yer üretilmez");

// Yer görünümünde de katlama
const foldedPlace = [
  P("1", "İnce", { birthPlace: "Ordu" }),
  P("2", "İNCE", { birthPlace: "Ordu" }),
];
eq(surnamesByPlace(foldedPlace)[0].surnames, [{ surname: "İnce", count: 2 }],
  "yer görünümünde de varyantlar birleşir");

/* --- Kararlılık ---------------------------------------------------------- */

const shuffled = [...withPlaces].reverse();
eq(aggregateSurnames(shuffled).surnames.map((s) => s.surname),
  aggregateSurnames(withPlaces).surnames.map((s) => s.surname),
  "giriş sırası sonucu değiştirmez");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
