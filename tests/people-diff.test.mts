import { diffPeople } from "../lib/people-diff.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

const P = (over: Partial<Person>): Person => ({
  id: "x", firstName: "A", lastName: "B", gender: "male", parentIds: [], spouseIds: [], ...over,
});

const a = P({ id: "a", firstName: "Ali" });
const b = P({ id: "b", firstName: "Beste" });
const c = P({ id: "c", firstName: "Can" });

// Değişiklik yok → boş
let d = diffPeople([a, b], [a, b]);
check("değişiklik yok → changed boş", d.changed.length === 0);
check("değişiklik yok → removed boş", d.removed.length === 0);

// Yeni kişi eklendi → yalnız o changed'te
d = diffPeople([a, b], [a, b, c]);
check("ekleme → 1 changed", d.changed.length === 1 && d.changed[0].id === "c");
check("ekleme → removed boş", d.removed.length === 0);

// Bir kişi düzenlendi → yalnız o changed'te
const aEdited = P({ id: "a", firstName: "Ahmet" });
d = diffPeople([a, b], [aEdited, b]);
check("düzenleme → 1 changed", d.changed.length === 1 && d.changed[0].firstName === "Ahmet");
check("düzenleme → değişmeyen changed'te değil", !d.changed.some((p) => p.id === "b"));

// Bir kişi silindi → removed'ta
d = diffPeople([a, b, c], [a, b]);
check("silme → removed = [c]", d.removed.length === 1 && d.removed[0] === "c");
check("silme → changed boş", d.changed.length === 0);

// Karışık: biri düzenlendi, biri silindi, biri eklendi
d = diffPeople([a, b], [aEdited, c]);
check("karışık → changed a(düzenli)+c(yeni)", d.changed.length === 2);
check("karışık → removed = [b]", d.removed.length === 1 && d.removed[0] === "b");

// Boş → hepsi eklenir
d = diffPeople([], [a, b]);
check("boştan → 2 changed", d.changed.length === 2 && d.removed.length === 0);

// Hepsi silinir
d = diffPeople([a, b], []);
check("hepsi silinir → removed 2", d.removed.length === 2 && d.changed.length === 0);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
