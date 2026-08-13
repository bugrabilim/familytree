import { findDuplicatePairs, mergePeople } from "../lib/duplicates.ts";
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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
