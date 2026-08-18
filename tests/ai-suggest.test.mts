import { buildSuggestPrompt, isSuggestMode, SUGGEST_MODES } from "../lib/ai-suggest.ts";
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
  gender: "unknown",
  parentIds: [],
  spouseIds: [],
  ...o,
});

const people = [
  P({ id: "a", firstName: "Ahmet", lastName: "Yılmaz", birthDate: "1950", deathDate: "2010", birthPlace: "İzmir", occupation: "Öğretmen", parentIds: ["f"], spouseIds: ["e"] }),
  P({ id: "f", firstName: "Baba", lastName: "Yılmaz" }),
  P({ id: "e", firstName: "Eş", lastName: "Yılmaz", gender: "female" }),
  P({ id: "c", firstName: "Çocuk", lastName: "Yılmaz", parentIds: ["a"] }),
];

check("mod doğrulama", isSuggestMode("story") && isSuggestMode("timeline") && !isSuggestMode("xyz"));
check("dört mod", SUGGEST_MODES.length === 4);

// story = biyografi istemi (uydurma yasağı)
const story = buildSuggestPrompt(people[0], people, "story", "tr");
check("story: uydurma yasağı", story.toLowerCase().includes("uydurma"));
check("story: ad", story.includes("Ahmet Yılmaz"));

// summary = tek cümle
const summary = buildSuggestPrompt(people[0], people, "summary", "tr");
check("summary: tek cümle talimatı", summary.toLowerCase().includes("tek cümle"));
check("summary: olgular var", summary.includes("Öğretmen"));

// missing = eksik bilgi soruları
const missing = buildSuggestPrompt(people[0], people, "missing", "en");
check("missing: EN soru talimatı", missing.toLowerCase().includes("question"));

// timeline = tarihlerden zaman çizelgesi
const timeline = buildSuggestPrompt(people[0], people, "timeline", "tr");
check("timeline: yıl-olay talimatı", timeline.toLowerCase().includes("zaman çizelgesi"));
check("timeline: doğum/ölüm tarihleri", timeline.includes("1950") && timeline.includes("2010"));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
