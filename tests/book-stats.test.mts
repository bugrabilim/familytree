import { computeAlmanac, computeGenerations } from "../lib/book-stats.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log(`✗ ${name}`); } };

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id,
  firstName: id,
  lastName: "Test",
  gender: "male",
  parentIds: [],
  spouseIds: [],
  ...extra,
});

// Dede(1) → Baba(2) → Çocuk(3); Anne(2) çocuğun diğer ebeveyni (köksüz → 1).
const people: Person[] = [
  P("dede", { birthDate: "1900-01-01", deathDate: "1980-01-01" }),
  P("baba", { birthDate: "1930-06-01", deathDate: "2010-06-01", parentIds: ["dede"] }),
  P("anne", { birthDate: "1935-01-01" }),
  P("cocuk", { birthDate: "1960-01-01", parentIds: ["baba", "anne"] }),
];

const gen = computeGenerations(people);
check("dede 1. kuşak", gen.get("dede") === 1);
check("baba 2. kuşak", gen.get("baba") === 2);
check("anne köksüz → 1. kuşak", gen.get("anne") === 1);
check("cocuk 3. kuşak", gen.get("cocuk") === 3);

const alm = computeAlmanac(people);
check("kuşak dağılımı 3 kuşak", alm.perGeneration.length === 3);
check("1. kuşakta 2 kişi (dede+anne)", alm.perGeneration.find((g) => g.gen === 1)?.count === 2);
check("3. kuşakta 1 kişi", alm.perGeneration.find((g) => g.gen === 3)?.count === 1);

check("en eski doğumlu ilk sırada dede", alm.eldest[0] === "dede");
check("en eski liste doğum tarihli 4 kişi", alm.eldest.length === 4);

// En uzun yaşamış (yaşayan + vefat): anne yaşıyor ve en yaşlı → ilk sırada;
// dede/baba (80'er) da listede.
check("en uzun ömürlü ilk sırada anne (yaşayan)", alm.longestLived[0].id === "anne");
check("en uzun ömürlü listede dede var", alm.longestLived.some((r) => r.id === "dede"));
check("dede yaşı 80", alm.longestLived.find((r) => r.id === "dede")?.age === 80);

// Yaşayan en yaşlı: anne (1935 doğumlu, yaşıyor) — cocuk'tan yaşlı.
check("yaşayan en yaşlı anne", alm.livingOldest[0]?.id === "anne");
check("yaşayan listede vefat eden yok", alm.livingOldest.every((r) => r.living));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
