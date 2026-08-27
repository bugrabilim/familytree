import { findIssues } from "../lib/consistency.ts";
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
  firstName: "X",
  lastName: "Y",
  gender: "male",
  parentIds: [],
  spouseIds: [],
  ...o,
});

const has = (people: Person[], id: string, kind: string) =>
  findIssues(people).some((i) => i.personId === id && i.kind === kind);

// Ölüm doğumdan önce
check("deathBeforeBirth", has([P({ id: "a", birthDate: "2000", deathDate: "1990" })], "a", "deathBeforeBirth"));
// Temiz kayıt uyarı vermez
check("temiz kayıt", findIssues([P({ id: "a", birthDate: "1950", deathDate: "2000" })]).length === 0);
// Gelecekte doğum
check("bornInFuture", has([P({ id: "a", birthDate: "3000" })], "a", "bornInFuture"));
// Ebeveyn çocuktan küçük
const fam = [P({ id: "c", birthDate: "1980", parentIds: ["p"] }), P({ id: "p", birthDate: "1990" })];
check("parentYoungerThanChild", has(fam, "c", "parentYoungerThanChild"));
// Çok genç ebeveyn
const fam2 = [P({ id: "c", birthDate: "2010", parentIds: ["p"] }), P({ id: "p", birthDate: "2000" })];
check("tooYoungParent", has(fam2, "c", "tooYoungParent"));
// Ebeveyn ölümünden sonra doğum (2 yıl sonra)
const fam3 = [P({ id: "c", birthDate: "2005", parentIds: ["p"] }), P({ id: "p", birthDate: "1960", deathDate: "2002" })];
check("bornAfterParentDeath", has(fam3, "c", "bornAfterParentDeath"));
// Kendine eş / kendine ebeveyn
check("selfSpouse", has([P({ id: "a", spouseIds: ["a"] })], "a", "selfSpouse"));
check("selfParent", has([P({ id: "a", parentIds: ["a"] })], "a", "selfParent"));
// İmkânsız yaş
check("implausibleAge", has([P({ id: "a", birthDate: "1800", deathDate: "1950" })], "a", "implausibleAge"));
// Kısmi tarihte yanlış-pozitif yok (yalnız yıl, aynı yıl)
check("aynı yıl belirsizlik", findIssues([P({ id: "a", birthDate: "1990", deathDate: "1990" })]).length === 0);

// Cinsiyet seçilmemiş kayıt uyarı verir; "other" (bilinçli seçim) VERMEZ.
check("missingGender: unknown → uyarı", has([P({ id: "a", gender: "unknown" })], "a", "missingGender"));
check("missingGender: other → uyarı yok", !has([P({ id: "a", gender: "other" })], "a", "missingGender"));
check("missingGender: male → uyarı yok", !has([P({ id: "a" })], "a", "missingGender"));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
