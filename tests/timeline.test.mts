import { buildTimeline, axisStep, axisTicks } from "../lib/timeline.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

const P = (over: Partial<Person>): Person => ({
  id: "x", firstName: "A", lastName: "B", gender: "male", parentIds: [], spouseIds: [], ...over,
});

const NOW = 2026;

// Vefat etmiş + yaşayan + tarihsiz karışık
const people: Person[] = [
  P({ id: "a", birthDate: "1900-01-01", deathDate: "1970" }),
  P({ id: "b", birthDate: "1945", deathDate: "2010-05" }),
  P({ id: "c", birthDate: "1980" }),          // yaşayan
  P({ id: "d" }),                              // tarihsiz → atlanır
  P({ id: "e", birthDate: "1850", deathDate: "1840" }), // hatalı: ölüm<doğum
];

const tl = buildTimeline(people, NOW);

check("tarihsiz atlanır", tl.rows.length === 4, `(${tl.rows.length})`);
check("başlangıç yılına göre sıralı", tl.rows.map((r) => r.id).join(",") === "e,a,b,c", tl.rows.map((r) => r.id).join(","));
check("min yıl", tl.minYear === 1850, `(${tl.minYear})`);
check("max yıl (yaşayan → bugün)", tl.maxYear === NOW, `(${tl.maxYear})`);

const c = tl.rows.find((r) => r.id === "c")!;
check("yaşayan bugüne uzanır", c.living && c.endYear === NOW);
const a = tl.rows.find((r) => r.id === "a")!;
check("vefat ölüm yılında biter", !a.living && a.endYear === 1970 && a.startYear === 1900);
const e = tl.rows.find((r) => r.id === "e")!;
check("hatalı tarih doğumda tutulur", e.endYear === e.startYear && e.startYear === 1850);

// Boş
const empty = buildTimeline([P({ id: "z" })], NOW);
check("boş → bugün aralığı", empty.rows.length === 0 && empty.minYear === NOW && empty.maxYear === NOW);

// axisStep / axisTicks
check("axisStep makul", axisStep(176) >= 20 && axisStep(176) <= 50, String(axisStep(176)));
const ticks = axisTicks(1850, 2026, 50);
check("ticks adıma hizalı", ticks[0] === 1850 && ticks.includes(1900) && ticks.includes(2000));
check("ticks aralık dışına taşmaz", ticks.every((y) => y >= 1850 && y <= 2026));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
