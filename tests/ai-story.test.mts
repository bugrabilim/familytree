import { buildStoryPrompt } from "../lib/ai-story.ts";
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
  P({ id: "a", firstName: "Ahmet", lastName: "Yılmaz", birthDate: "1950", birthPlace: "İzmir", occupation: "Öğretmen", parentIds: ["f"], spouseIds: ["e"] }),
  P({ id: "f", firstName: "Baba", lastName: "Yılmaz" }),
  P({ id: "e", firstName: "Eş", lastName: "Yılmaz", gender: "female" }),
  P({ id: "c", firstName: "Çocuk", lastName: "Yılmaz", parentIds: ["a"] }),
];
const prompt = buildStoryPrompt(people[0], people, "tr");

check("ad geçiyor", prompt.includes("Ahmet Yılmaz"));
check("ebeveyn geçiyor", prompt.includes("Baba Yılmaz"));
check("eş geçiyor", prompt.includes("Eş Yılmaz"));
check("çocuk geçiyor", prompt.includes("Çocuk Yılmaz"));
check("meslek geçiyor", prompt.includes("Öğretmen"));
check("uydurma yasağı talimatı", prompt.toLowerCase().includes("uydurma"));

const en = buildStoryPrompt(people[0], people, "en");
check("en talimat", en.toLowerCase().includes("do not invent"));
check("en alan etiketi", en.includes("Occupation"));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
