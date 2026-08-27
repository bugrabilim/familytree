import { findDuplicatePairs, mergePeople, applyBulkMerge } from "../lib/duplicates.ts";
import type { Person } from "../types/family.ts";

let ok = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
};

const P = (o: Partial<Person> & { id: string }): Person => ({
  firstName: "Ali",
  lastName: "Veli",
  gender: "male",
  parentIds: [],
  spouseIds: [],
  ...o,
});

// Aynı ad + aynı yıl → kopya
let pairs = findDuplicatePairs([
  P({ id: "a", birthDate: "1950" }),
  P({ id: "b", birthDate: "1950" }),
]);
check("aynı ad+yıl kopya", pairs.length === 1 && pairs[0].reason === "yearMatch");

// Aynı ad, farklı yıl (>1) → kopya değil
check("farklı yıl kopya değil", findDuplicatePairs([P({ id: "a", birthDate: "1950" }), P({ id: "b", birthDate: "1980" })]).length === 0);

// Aynı ad + ortak ebeveyn (yıl yok) → kopya
pairs = findDuplicatePairs([
  P({ id: "a", parentIds: ["m"] }),
  P({ id: "b", parentIds: ["m"] }),
  P({ id: "m", firstName: "Anne", lastName: "V" }),
]);
check("ortak ebeveyn kopya", pairs.some((x) => x.reason === "sharedParent"));

// Eş olan aynı adlılar → kopya DEĞİL (doğrudan bağlı)
check("eşler kopya değil", findDuplicatePairs([P({ id: "a", spouseIds: ["b"] }), P({ id: "b", spouseIds: ["a"] })]).length === 0);

// Farklı ad → kopya değil
check("farklı ad", findDuplicatePairs([P({ id: "a" }), P({ id: "b", firstName: "Ayşe", gender: "female" })]).length === 0);

// 3C: soyadsız "Buğra" ile soyadlı "Buğra Bilim", aynı yıl → kopya önerisi.
pairs = findDuplicatePairs([
  P({ id: "x", firstName: "Buğra", lastName: "", birthDate: "1984" }),
  P({ id: "y", firstName: "Buğra", lastName: "Bilim", birthDate: "1984" }),
]);
check("soyadsız+soyadlı aynı ad/yıl kopya", pairs.length === 1 && pairs[0].reason === "yearMatch");

// Aynı ad, İKİ farklı soyad, yalnız yıl (yapısal bağ yok) → kopya DEĞİL (yanlış-pozitif koruması).
check(
  "farklı soyad + yalnız yıl kopya değil",
  findDuplicatePairs([
    P({ id: "a", firstName: "Ahmet", lastName: "Yılmaz", birthDate: "1950" }),
    P({ id: "b", firstName: "Ahmet", lastName: "Kaya", birthDate: "1950" }),
  ]).length === 0
);

// Birleştirme: referanslar keep'e taşınır, drop silinir
const people = [
  P({ id: "keep", birthDate: "1950", photos: ["u1"] }),
  P({ id: "drop", birthPlace: "İzmir", photos: ["u2"], spouseIds: ["s"] }),
  P({ id: "child", parentIds: ["drop"] }),
  P({ id: "s", firstName: "Eş", gender: "female", spouseIds: ["drop"] }),
];
const merged = mergePeople(people, "keep", "drop");
check("drop silindi", !merged.some((p) => p.id === "drop"));
check("keep sayısı", merged.length === 3);
const child = merged.find((p) => p.id === "child")!;
check("çocuğun ebeveyni keep'e taşındı", child.parentIds.includes("keep") && !child.parentIds.includes("drop"));
const spouse = merged.find((p) => p.id === "s")!;
check("eşin bağı keep'e taşındı", spouse.spouseIds.includes("keep"));
const keep = merged.find((p) => p.id === "keep")!;
check("keep boş alanı drop'tan doldurdu", keep.birthPlace === "İzmir");
check("foto birleşti", (keep.photos ?? []).length === 2);
check("keep eş bağı aldı", (keep.spouseIds ?? []).includes("s"));
check("kendine-referans yok", !keep.parentIds.includes("keep") && !(keep.spouseIds ?? []).includes("keep"));

// Toplu birleştirme — birden çok çift, daha eksiksiz kayıt korunur, zincir
const bulkPeople = [
  P({ id: "a1", birthDate: "1950", birthPlace: "Ordu", photos: ["u"] }), // daha dolu
  P({ id: "a2", birthDate: "1950" }),
  P({ id: "b1", firstName: "Ayşe", gender: "female", birthDate: "1970", occupation: "öğretmen" }),
  P({ id: "b2", firstName: "Ayşe", gender: "female", birthDate: "1970" }),
];
const bulk = applyBulkMerge(bulkPeople, [
  { aId: "a1", bId: "a2" },
  { aId: "b1", bId: "b2" },
]);
check("iki çift birleşti", bulk.merged === 2);
check("dört kayıt ikiye indi", bulk.people.length === 2);
check("daha dolu kayıt (a1) korundu", bulk.people.some((p) => p.id === "a1") && !bulk.people.some((p) => p.id === "a2"));
check("daha dolu kayıt (b1) korundu", bulk.people.some((p) => p.id === "b1") && !bulk.people.some((p) => p.id === "b2"));

// Zincir: a==b==c → tüketilmiş kimlik içeren çift atlanır (çökme yok)
const chain = [
  P({ id: "c1", birthDate: "1900" }),
  P({ id: "c2", birthDate: "1900" }),
  P({ id: "c3", birthDate: "1900" }),
];
const chained = applyBulkMerge(chain, [
  { aId: "c1", bId: "c2" },
  { aId: "c2", bId: "c3" }, // c2 tüketildi → atlanır
]);
check("zincirde tüketilen çift atlanır", chained.merged === 1 && chained.people.length === 2);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
