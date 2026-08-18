import { buildTreeContext, buildChatPrompt, buildChatSystem } from "../lib/ai-chat.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log(`✗ ${name}`); } };

const P = (o: Partial<Person> & { id: string }): Person => ({
  firstName: "X", lastName: "Y", gender: "unknown", parentIds: [], spouseIds: [], ...o,
});
const people = [
  P({ id: "a", firstName: "Ahmet", lastName: "Yıldız", birthDate: "1950", deathDate: "2010", birthPlace: "Ankara", spouseIds: ["b"] }),
  P({ id: "b", firstName: "Ayşe", lastName: "Yıldız", birthDate: "1955", spouseIds: ["a"] }),
  P({ id: "c", firstName: "Zeynep", lastName: "Yıldız", parentIds: ["a", "b"] }),
];

const ctx = buildTreeContext(people);
check("bağlam ad içerir", ctx.includes("Ahmet Yıldız"));
check("bağlam yıl aralığı", ctx.includes("(1950–2010)"));
check("bağlam yer", ctx.includes("Ankara"));
check("bağlam ebeveyn", ctx.includes("ebeveyn: Ahmet Yıldız, Ayşe Yıldız"));
check("bağlam eş", ctx.includes("eş: Ayşe Yıldız"));

check("cap sınırlar + fazlası notu", buildTreeContext(people, 1).includes("+2 kişi daha"));

const prompt = buildChatPrompt(people, "En yaşlı kim?", "tr");
check("istem soruyu içerir", prompt.includes("En yaşlı kim?"));
check("istem bağlamı içerir", prompt.includes("Ahmet Yıldız"));

check("sistem: yalnız veriden (tr)", buildChatSystem("tr").includes("YALNIZ"));
check("sistem EN", buildChatSystem("en").toLowerCase().includes("only"));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
