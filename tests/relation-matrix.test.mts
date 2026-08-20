import { buildMatrixLayout, type MatrixEntry } from "../lib/relation-matrix.ts";

let ok = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log(`✗ ${name}`); } };

const entries: MatrixEntry[] = [
  { id: "c", name: "Cemal", gen: 2, birthYear: 1950 },
  { id: "a", name: "Ahmet", gen: 1, birthYear: 1920 },
  { id: "b", name: "Zeynep", gen: 1, birthYear: 1925 },
  { id: "d", name: "Deniz", gen: 3, birthYear: 1980 },
];

const m = buildMatrixLayout(entries);
check("order kuşağa göre: ilk Ahmet (1. kuşak)", m.order[0].id === "a");
check("order: 2. sırada Zeynep (aynı kuşak, sonraki yıl)", m.order[1].id === "b");
check("order: Cemal 3., Deniz 4.", m.order[2].id === "c" && m.order[3].id === "d");
check("kısaltma yok", m.truncated === false && m.total === 4);

// İndeks alfabetik (tr): Ahmet, Cemal, Deniz, Zeynep
check("indeks alfabetik ilk Ahmet", m.index[0].name === "Ahmet");
check("indeks son Zeynep", m.index[m.index.length - 1].name === "Zeynep");
// Ahmet matriste 1. konumda → satır=sütun=1
check("Ahmet koordinat 1,1", m.index[0].row === 1 && m.index[0].col === 1);
// Deniz matriste 4. konumda
const deniz = m.index.find((x) => x.id === "d")!;
check("Deniz koordinat 4,4", deniz.row === 4 && deniz.col === 4);

// Limit kırpması
const m2 = buildMatrixLayout(entries, 2);
check("limit=2 → 2 kişi", m2.order.length === 2);
check("limit=2 → truncated", m2.truncated === true && m2.total === 4);
check("limit=2 indeks de 2", m2.index.length === 2);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
