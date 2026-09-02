import { exportGedcom, importGedcom } from "../lib/gedcom.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const people: Person[] = [
  {
    id: "a", firstName: "Mehmet", lastName: "Yılmaz", gender: "male",
    birthDate: "1920-03-12", deathDate: "1994-11-02", birthPlace: "Trabzon",
    photo: "https://cdn.test/foto.jpg",
    photos: ["https://cdn.test/ikinci.PNG", "https://cdn.test/foto.jpg"],
    parentIds: [], spouseIds: ["b"],
  },
  { id: "b", firstName: "Fatma", lastName: "Yılmaz", gender: "female", birthDate: "1925", parentIds: [], spouseIds: ["a"] },
  {
    id: "c", firstName: "Ali", lastName: "Yılmaz", gender: "male", birthDate: "1948",
    parentIds: ["a", "b"], spouseIds: [],
    parentLinks: { a: { kind: "adoptive" }, b: { kind: "adoptive" } },
  },
  {
    id: "d", firstName: "Ayşe", lastName: "Yılmaz", gender: "female", birthDate: "1950",
    parentIds: ["a", "b"], spouseIds: [],
    parentLinks: { a: { kind: "step" }, b: { kind: "step" } },
  },
  {
    id: "e", firstName: "Veli", lastName: "Yılmaz", gender: "male", birthDate: "1952",
    parentIds: ["a", "b"], spouseIds: [],
    parentLinks: { a: { kind: "foster" }, b: { kind: "foster" } },
  },
];

const g7 = exportGedcom(people, { version: "7.0" });
const g55 = exportGedcom(people);
const l7 = g7.split("\r\n");
const l55 = g55.split("\r\n");

/* --- Başlık ------------------------------------------------------------- */
// 7.0 her zaman UTF-8'dir; CHAR kaldırıldı. GEDC.FORM da artık gerekmiyor.
check(l7.includes("2 VERS 7.0"), "7.0 sürüm satırı");
check(!l7.some((x) => x.startsWith("1 CHAR")), "7.0'da CHAR yok");
check(!l7.includes("2 FORM LINEAGE-LINKED"), "7.0'da GEDC.FORM yok");
check(l7[0] === "0 HEAD" && l7[l7.length - 1] === "0 TRLR", "HEAD ile başlar, TRLR ile biter");

// Varsayılan DEĞİŞMEDİ: sürüm verilmezse 5.5.1.
check(l55.includes("2 VERS 5.5.1"), "varsayılan 5.5.1");
check(l55.includes("1 CHAR UTF-8"), "5.5.1'de CHAR duruyor");
check(l55.includes("2 FORM LINEAGE-LINKED"), "5.5.1'de GEDC.FORM duruyor");

/* --- Medya: 7.0 işaretçi + üst düzey kayıt ------------------------------ */
// 5.5.1: INDI altında satır içi OBJE/FILE.
check(l55.includes("1 OBJE"), "5.5.1 satır içi OBJE");
check(l55.includes("2 FILE https://cdn.test/foto.jpg"), "5.5.1 FILE satır içi");
check(l55.includes("2 FORM jpg"), "5.5.1 FORM uzantı");

// 7.0: INDI'de yalnız işaretçi, dosya üst düzey kayıtta, FORM medya türü.
const objePtrs = l7.filter((x) => /^1 OBJE @O\d+@$/.test(x));
eq(objePtrs.length, 2, "7.0'da iki OBJE işaretçisi (yinelenen URL tekilleşti)");
check(!l7.some((x) => x === "1 OBJE"), "7.0'da satır içi OBJE yok");
const objeRecs = l7.filter((x) => /^0 @O\d+@ OBJE$/.test(x));
eq(objeRecs.length, 2, "iki üst düzey OBJE kaydı");
check(l7.includes("2 FORM image/jpeg"), "FORM IANA medya türü (jpg)");
check(l7.includes("2 FORM image/png"), "FORM IANA medya türü (büyük harfli PNG uzantısı)");
check(!l7.some((x) => x === "2 FORM jpg"), "7.0'da uzantı biçimi yok");
// Kayıtlar TRLR'den önce gelmeli.
check(l7.lastIndexOf("0 TRLR") > l7.findIndex((x) => /^0 @O\d+@ OBJE$/.test(x)), "OBJE kayıtları TRLR'den önce");

/* --- PEDI --------------------------------------------------------------- */
// 7.0 kümesi BÜYÜK harf: ADOPTED / BIRTH / FOSTER / SEALING / OTHER.
check(l7.includes("2 PEDI ADOPTED"), "7.0 ADOPTED");
check(l7.includes("2 PEDI FOSTER"), "7.0 FOSTER");
check(l7.includes("2 PEDI OTHER"), "7.0 üvey → OTHER");
check(l7.includes("3 PHRASE step"), "OTHER'ın yanında PHRASE");
check(!l7.some((x) => x.toUpperCase() === "2 PEDI STEP"), "7.0'da PEDI step yok (küme dışı)");

// 5.5.1'in kümesi de adopted/birth/foster/sealing — "step" ONDA DA yok.
// Yıllardır `2 PEDI step` yazılıyordu; artık satıcı uzantısına taşındı.
check(l55.includes("2 PEDI adopted"), "5.5.1 adopted");
check(l55.includes("2 PEDI foster"), "5.5.1 foster");
check(!l55.includes("2 PEDI step"), "5.5.1'de geçersiz `PEDI step` YAZILMIYOR");
check(l55.includes("2 _PEDI step"), "5.5.1'de üvey satıcı uzantısıyla taşınıyor");

/* --- Gidiş-dönüş -------------------------------------------------------- */
for (const [name, text] of [["7.0", g7], ["5.5.1", g55]] as const) {
  const back = importGedcom(text);
  eq(back.length, people.length, `${name}: kişi sayısı korunuyor`);
  const byName = new Map(back.map((p) => [p.firstName, p]));
  eq(byName.get("Mehmet")?.birthDate, "1920-03-12", `${name}: doğum tarihi`);
  eq(byName.get("Mehmet")?.birthPlace, "Trabzon", `${name}: doğum yeri`);
  eq(byName.get("Mehmet")?.deathDate, "1994-11-02", `${name}: ölüm tarihi`);

  // Fotoğraflar: iki benzersiz URL, iki biçimde de geri gelmeli.
  const m = byName.get("Mehmet")!;
  const urls = [m.photo, ...(m.photos ?? [])].filter(Boolean);
  check(urls.includes("https://cdn.test/foto.jpg"), `${name}: kapak fotoğrafı geri geldi`);
  check(urls.includes("https://cdn.test/ikinci.PNG"), `${name}: galeri fotoğrafı geri geldi`);

  // Ebeveyn bağı türleri.
  const kindOf = (first: string) => {
    const p = byName.get(first)!;
    return p.parentIds.map((pid) => p.parentLinks?.[pid]?.kind).find(Boolean);
  };
  eq(kindOf("Ali"), "adoptive", `${name}: evlat edinme geri geldi`);
  eq(kindOf("Veli"), "foster", `${name}: koruyucu aile geri geldi`);
  eq(kindOf("Ayşe"), "step", `${name}: üvey geri geldi`);
}

/* --- 7.0 satırlarının biçimi -------------------------------------------- */
// Her satır "<seviye> <etiket|xref> …" olmalı; seviye atlaması olmamalı.
let prev = -1;
for (const line of l7) {
  if (!line) continue;
  const m = /^(\d+) /.exec(line);
  if (!m) { fail++; console.log(`✗ biçimsiz satır: ${line}`); break; }
  const lvl = Number(m[1]);
  if (lvl > prev + 1) { fail++; console.log(`✗ seviye atlaması: ${line}`); break; }
  prev = lvl;
}
ok++;

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
