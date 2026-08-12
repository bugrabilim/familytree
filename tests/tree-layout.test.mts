import { buildUnions, layout, type LayoutDim } from "../lib/tree-layout.ts";
import { DEMO_PEOPLE } from "../lib/demo-data.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

const DIM: LayoutDim = { w: 150, h: 50, gap: 60, nodesep: 22 };

function coupleStats(people: Person[], pos: Map<string, { x: number; y: number }>) {
  const seen = new Set<string>();
  let total = 0, adjacent = 0, sameRank = 0;
  const adj = DIM.w + DIM.nodesep + 20;
  for (const p of people)
    for (const sid of p.spouseIds) {
      const key = [p.id, sid].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const a = pos.get(p.id), b = pos.get(sid);
      if (!a || !b) continue;
      total++;
      const same = Math.abs(a.y - b.y) < 1;
      if (same) sameRank++;
      if (same && Math.abs(a.x - b.x) <= adj) adjacent++;
    }
  return { total, adjacent, sameRank };
}

// --- buildUnions temel davranış ---
const trio: Person[] = [
  { id: "f", firstName: "F", lastName: "", gender: "male", parentIds: [], spouseIds: ["m"] },
  { id: "m", firstName: "M", lastName: "", gender: "female", parentIds: [], spouseIds: ["f"] },
  { id: "c", firstName: "C", lastName: "", gender: "male", parentIds: ["f", "m"], spouseIds: [] },
] as Person[];
const trioIds = new Set(trio.map((p) => p.id));
const trioUnions = buildUnions(trio, trioIds);
check("tek birlik üretilir", trioUnions.length === 1, `(${trioUnions.length})`);
check("birlik iki ebeveyn", trioUnions[0].parentIds.length === 2);
check("birlik bir çocuk", trioUnions[0].childIds.length === 1);

// Çocuksuz evlilik de birlik üretir (eşler yan yana dursun)
const childless: Person[] = [
  { id: "a", firstName: "A", lastName: "", gender: "male", parentIds: [], spouseIds: ["b"] },
  { id: "b", firstName: "B", lastName: "", gender: "female", parentIds: [], spouseIds: ["a"] },
] as Person[];
const clUnions = buildUnions(childless, new Set(["a", "b"]));
check("çocuksuz evlilik birliği", clUnions.length === 1);

// --- layout: küçük ağaçta eşler bitişik ve aynı rankta ---
const trioPos = layout(trio, trioUnions, { w: 190, h: 98, gap: 130, nodesep: 34 });
const pf = trioPos.get("f")!, pm = trioPos.get("m")!;
check("küçük ağaç: eşler aynı rankta", Math.abs(pf.y - pm.y) < 1);
check("küçük ağaç: eşler bitişik", Math.abs(pf.x - pm.x) <= 190 + 34 + 20, `(${Math.round(Math.abs(pf.x - pm.x))})`);
check("konumlar geçerli (NaN yok)", !Number.isNaN(pf.x) && !Number.isNaN(pm.y));

// --- Madde 11: gerçek demo ağacında eş bitişikliği (küme stratejisi) ---
const people = DEMO_PEOPLE as Person[];
const ids = new Set(people.map((p) => p.id));
const unions = buildUnions(people, ids);
const pos = layout(people, unions, DIM);
const st = coupleStats(people, pos);
check("tüm eşler aynı rankta", st.sameRank === st.total, `(${st.sameRank}/${st.total})`);
// Küme öncesi taban ~47/105; küme sonrası ölçümde 92/105. Regresyona karşı eşik.
check("eş bitişikliği yüksek (küme)", st.adjacent >= 80, `bitişik=${st.adjacent}/${st.total}`);

// --- Aynı rankta çakışma (overlap) yok ---
const byRank = new Map<number, number[]>();
for (const p of people) {
  const pp = pos.get(p.id);
  if (!pp) continue;
  const arr = byRank.get(pp.y) ?? [];
  arr.push(pp.x);
  byRank.set(pp.y, arr);
}
let overlaps = 0;
for (const arr of byRank.values()) {
  arr.sort((a, b) => a - b);
  for (let i = 1; i < arr.length; i++) if (arr[i] - arr[i - 1] < DIM.w - 1) overlaps++;
}
check("aynı rankta çakışma yok", overlaps === 0, `(${overlaps})`);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
