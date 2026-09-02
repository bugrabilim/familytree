import {
  PROMPTS, promptKey, promptById,
  eligiblePrompts, isEligible, nextPrompt, ageReached, subjectFromPerson,
  type PromptSubject,
} from "../lib/prompts.ts";
import { MEMORY_PROMPTS } from "../types/family.ts";
import { tr, en } from "../lib/i18n-dict.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}

const base = (over: Partial<PromptSubject> = {}): PromptSubject => ({
  id: "p1", hasSpouse: false, hasChildren: false, hasOccupation: false,
  hasEducation: false, hasBirthPlace: false, living: true, answered: [], ...over,
});
const TODAY = new Date("2026-01-01T00:00:00Z");

/* --- Banka bütünlüğü ---------------------------------------------------- */

const ids = PROMPTS.map((p) => p.id);
eq(new Set(ids).size, ids.length, "soru kimlikleri benzersiz");

// Haftalık soru motoru bir yıl tekrara düşmemeli
check(PROMPTS.length >= 52, `banka haftalık rotasyona yeter (${PROMPTS.length} soru)`);
check(PROMPTS.some((p) => p.voice === "self"), "self sesli soru var");
check(PROMPTS.filter((p) => p.voice === "about").length >= 20,
  `vefat edenler için yeterli "about" sorusu (${PROMPTS.filter((p) => p.voice === "about").length})`);

// i18n kayması olmasın — her sorunun TR ve EN karşılığı olmalı
let missTr = 0, missEn = 0;
for (const p of PROMPTS) {
  const k = promptKey(p.id);
  if (!(k in tr)) { missTr++; console.log(`  ✗ TR eksik: ${k}`); }
  if (!(k in en)) { missEn++; console.log(`  ✗ EN eksik: ${k}`); }
}
eq(missTr, 0, "tüm soruların TR karşılığı var");
eq(missEn, 0, "tüm soruların EN karşılığı var");

// "about" soruları adı taşımalı, "self" soruları taşımamalı
let voiceOk = 0;
for (const p of PROMPTS) {
  const s = (tr as Record<string, string>)[promptKey(p.id)] ?? "";
  const hasName = s.includes("{name}");
  if (p.voice === "about" ? hasName : !hasName) voiceOk++;
  else console.log(`  ✗ ses/ad uyuşmazlığı: ${p.id} (${p.voice}) → "${s}"`);
}
eq(voiceOk, PROMPTS.length, "about → {name} taşır, self → taşımaz");

// Eski MEMORY_PROMPTS bankadan sapmasın
for (const legacy of MEMORY_PROMPTS) {
  check(!!promptById(legacy), `eski soru bankada duruyor: ${legacy}`);
}

eq(promptById("yokBöyleBirŞey"), undefined, "olmayan kimlik → undefined");
eq(promptKey("childhood"), "memoryPrompt.childhood", "i18n anahtarı");

/* --- Uygunluk ----------------------------------------------------------- */

// Vefat etmiş kişiye kendisi hakkında soru sorulamaz
const dead = base({ living: false, deathDate: "2010-05-01", birthDate: "1930" });
check(eligiblePrompts(dead, {}, TODAY).every((p) => p.voice === "about"),
  "vefat edende yalnız about soruları");
check(eligiblePrompts(dead, {}, TODAY).length > 0, "vefat edende soru kalıyor");

// Koşullu sorular
const plain = base({ birthDate: "1990" });
check(!eligiblePrompts(plain, {}, TODAY).some((p) => p.id === "work"),
  "mesleği yoksa iş sorusu sorulmaz");
check(eligiblePrompts(base({ birthDate: "1990", hasOccupation: true }), {}, TODAY)
  .some((p) => p.id === "work"), "mesleği varsa iş sorusu sorulur");
check(!eligiblePrompts(plain, {}, TODAY).some((p) => p.id === "love"),
  "eşi yoksa evlilik sorusu sorulmaz");

// Cinsiyet koşulu
const man = base({ birthDate: "1980", gender: "male" });
const woman = base({ birthDate: "1980", gender: "female" });
check(eligiblePrompts(man, {}, TODAY).some((p) => p.id === "selfMilitary"),
  "erkeğe askerlik sorusu sorulur");
check(!eligiblePrompts(woman, {}, TODAY).some((p) => p.id === "selfMilitary"),
  "kadına askerlik sorusu sorulmaz");

// Yaş koşulu — çocuğa yetişkin sorusu sorulmaz
const child = base({ birthDate: "2020", gender: "male" });
check(!eligiblePrompts(child, {}, TODAY).some((p) => p.id === "selfFirstJob"),
  "6 yaşındakine ilk iş sorulmaz");
check(!eligiblePrompts(child, {}, TODAY).some((p) => p.id === "selfMilitary"),
  "6 yaşındakine askerlik sorulmaz");

// Yaş bilinmiyorsa yaş koşullu soru atlanır
const noAge = base({ gender: "male" });
check(!eligiblePrompts(noAge, {}, TODAY).some((p) => p.requires?.minAge !== undefined),
  "yaş bilinmiyorsa yaş koşullu soru sorulmaz");

// Vefat edende yaş = ölüm yaşı
eq(ageReached(base({ birthDate: "1930", deathDate: "2010" }), TODAY), 80, "ölüm yaşı");
eq(ageReached(base({ birthDate: "1990" }), TODAY), 36, "yaşayan yaşı");
eq(ageReached(base({}), TODAY), null, "doğum yılı yoksa null");

/* --- Filtreler ---------------------------------------------------------- */

check(eligiblePrompts(plain, { voice: "about" }, TODAY).every((p) => p.voice === "about"),
  "ses filtresi");
check(eligiblePrompts(plain, { category: "ogut" }, TODAY).every((p) => p.category === "ogut"),
  "kategori filtresi");

// Yanıtlanmışlar varsayılan olarak elenir
const asked = base({ birthDate: "1990", answered: ["childhood", "advice"] });
check(!eligiblePrompts(asked, {}, TODAY).some((p) => p.id === "childhood"),
  "yanıtlanan soru tekrar sorulmaz");
check(eligiblePrompts(asked, { includeAnswered: true }, TODAY).some((p) => p.id === "childhood"),
  "includeAnswered ile geri gelir");

/* --- Seçim: deterministik olmalı ---------------------------------------- */

const subj = base({ id: "abc", birthDate: "1950", hasSpouse: true, hasOccupation: true });
const a = nextPrompt(subj, "2026-W05", {}, TODAY);
const b = nextPrompt(subj, "2026-W05", {}, TODAY);
check(!!a && a.id === b?.id, "aynı seed → aynı soru (cron yeniden denemesi güvenli)");

// Farklı hafta farklı soru üretebilmeli
const weeks = new Set<string>();
for (let w = 1; w <= 30; w++) {
  const p = nextPrompt(subj, `2026-W${w}`, {}, TODAY);
  if (p) weeks.add(p.id);
}
check(weeks.size > 5, `farklı haftalar farklı sorular (${weeks.size} ayrı soru)`);

// Farklı kişiye aynı hafta farklı soru düşebilmeli
const other = nextPrompt({ ...subj, id: "xyz" }, "2026-W05", {}, TODAY);
check(!!other, "başka kişide de soru üretiliyor");

// Seçilen soru daima uygun olmalı
let picked = 0, pickOk = 0;
for (let w = 1; w <= 60; w++) {
  const p = nextPrompt(subj, `s${w}`, {}, TODAY);
  if (p) { picked++; if (isEligible(p, subj, TODAY)) pickOk++; }
}
check(picked > 0 && picked === pickOk, `seçilen soru daima uygun (${pickOk}/${picked})`);

// Banka bitince null
const exhausted = base({ birthDate: "1950", answered: PROMPTS.map((p) => p.id) });
eq(nextPrompt(exhausted, "x", {}, TODAY), null, "banka bitince null");

/* --- Person → özne ------------------------------------------------------ */

const P = (over: Partial<Person>): Person => ({
  id: "x", firstName: "A", lastName: "B", gender: "male",
  parentIds: [], spouseIds: [], ...over,
} as Person);

const dad = P({ id: "dad", occupation: "Öğretmen", birthPlace: "Sivas", deathDate: "2015-03-02" });
const kid = P({ id: "kid", parentIds: ["dad"] });
const s1 = subjectFromPerson(dad, [dad, kid]);
eq(s1.hasChildren, true, "çocuğu olan tespit edildi");
eq(s1.hasOccupation, true, "mesleği tespit edildi");
eq(s1.hasBirthPlace, true, "doğum yeri tespit edildi");
eq(s1.living, false, "ölüm tarihi → yaşamıyor");
eq(subjectFromPerson(kid, [dad, kid]).hasChildren, false, "çocuğu olmayan");
eq(subjectFromPerson(kid, [dad, kid]).living, true, "ölüm tarihi yok → yaşıyor");

// Yanıtlanmış sorular memories'ten okunur
const withMem = P({ id: "m", memories: [{ id: "1", prompt: "childhood", text: "…" }] });
eq(subjectFromPerson(withMem, [withMem]).answered, ["childhood"], "memories → answered");

// Boşanmış eş de "eşi var" sayılır
eq(subjectFromPerson(P({ id: "d", formerSpouseIds: ["z"] }), []).hasSpouse, true,
  "eski eş de eş sayılır");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
