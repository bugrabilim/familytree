import { findCrossMatches } from "../lib/crossmatch.ts";
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

// Aynı ad + aynı yıl → kesişim
let m = findCrossMatches([P({ id: "a1", birthDate: "1940" })], [P({ id: "b1", birthDate: "1940" })]);
check("ad+yıl kesişim", m.length === 1 && m[0].aId === "a1" && m[0].bId === "b1" && m[0].reason === "yearMatch");

// Farklı yıl → yok
check("farklı yıl", findCrossMatches([P({ id: "a", birthDate: "1940" })], [P({ id: "b", birthDate: "1980" })]).length === 0);

// Ortak ebeveyn ADI (farklı ağaç, farklı id) → kesişim
const A = [P({ id: "a", parentIds: ["ap"] }), P({ id: "ap", firstName: "Hasan", lastName: "V" })];
const B = [P({ id: "b", parentIds: ["bp"] }), P({ id: "bp", firstName: "Hasan", lastName: "Y" })];
m = findCrossMatches(A, B);
check("ortak ebeveyn adı", m.some((x) => x.aId === "a" && x.bId === "b" && x.reason === "sharedParent"));

// Farklı ad → yok
check("farklı ad", findCrossMatches([P({ id: "a" })], [P({ id: "b", firstName: "Veli" })]).length === 0);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
