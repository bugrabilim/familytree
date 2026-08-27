import { parseActResponse, buildActPrompt, buildActSystem } from "../lib/ai-act.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean, d = "") => { if (c) ok++; else { fail++; console.log(`✗ ${n} ${d}`); } };

const P = (over: Partial<Person>): Person => ({
  id: "x", firstName: "A", lastName: "B", gender: "male", parentIds: [], spouseIds: [], ...over,
});
const people: Person[] = [
  P({ id: "penpe1", firstName: "Penpe", lastName: "", gender: "female", birthDate: "1849" }),
  P({ id: "ahmet1", firstName: "Ahmet", lastName: "", gender: "male" }),
];
const valid = new Set(people.map((p) => p.id));

// Model tipik add çıktısı (kod bloklu)
const addOut = "```json\n" + JSON.stringify({
  action: "add",
  person: { firstName: "Kuzu", lastName: "", gender: "female", birthDate: null, birthPlace: null },
  relation: { type: "parent", targetId: "penpe1" },
  say: "Kuzu'yu Penpe'nin annesi olarak ekledim.",
}) + "\n```";
const act = parseActResponse(addOut, valid);
check("add tanındı", act.action === "add");
if (act.action === "add") {
  check("ad", act.person.firstName === "Kuzu");
  check("cinsiyet", act.person.gender === "female");
  check("ilişki parent + hedef", act.relation?.type === "parent" && act.relation?.targetId === "penpe1");
  check("onay cümlesi", (act.say ?? "").includes("Penpe"));
}

// Uydurma hedef id reddedilir (ilişki düşer, kişi yine eklenir)
const badTarget = parseActResponse(JSON.stringify({ action: "add", person: { firstName: "Zeynep" }, relation: { type: "spouse", targetId: "yok123" } }), valid);
check("geçersiz hedef id → ilişki yok", badTarget.action === "add" && badTarget.action === "add" && !("relation" in badTarget && (badTarget as { relation?: unknown }).relation));

// Ekleme değilse none
check("none: düz soru", parseActResponse(JSON.stringify({ action: "none" }), valid).action === "none");
check("none: bozuk JSON", parseActResponse("merhaba", valid).action === "none");
check("none: adsız add", parseActResponse(JSON.stringify({ action: "add", person: {} }), valid).action === "none");

// İstem içeriği
check("istem hedef listesi + pembe ipucu", buildActPrompt("pembenin annesi kuzu, ekle", people, "tr").includes("penpe1") && buildActPrompt("x", people, "tr").toLowerCase().includes("pembe"));
check("istem EN", buildActSystem("en").toLowerCase().includes("family tree") && buildActPrompt("add x", people, "en").includes("penpe1"));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
