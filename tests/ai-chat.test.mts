import { buildTreeContext, buildChatPrompt, buildChatSystem, buildTreeSummary } from "../lib/ai-chat.ts";
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

// Yakın çevre (arkadaş) — özet + bağlam (Madde 4)
const withFriend = [
  ...people,
  P({ id: "f1", firstName: "Kemal", lastName: "Demir", kind: "cevre", associations: [{ id: "x", personId: "a", type: "komsu" }] }),
];
const sum = buildTreeSummary(withFriend);
check("özet toplam", sum.includes("toplam 4 kişi"));
check("özet üye/arkadaş sayısı", sum.includes("3 aile üyesi") && sum.includes("1 yakın çevre"));
const fctx = buildTreeContext(withFriend);
check("bağlam çevre etiketi", fctx.includes("yakın çevre (aile-dışı)"));
check("bağlam bağ türü etiketi", fctx.includes("Ahmet Yıldız (komşu)"));
check("istem özeti içerir", buildChatPrompt(withFriend, "kaç arkadaş var?", "tr").includes("yakın çevre"));

// Takip sorusu için konuşma geçmişi isteme eklenir (Madde: "isimlerini ver")
const hist = [
  { role: "user" as const, text: "kaç arkadaş girilmiş" },
  { role: "assistant" as const, text: "12" },
];
const fp = buildChatPrompt(withFriend, "isimlerini ver", "tr", hist);
check("istem geçmiş başlığı", fp.includes("ÖNCEKİ KONUŞMA:"));
check("istem geçmiş soruyu içerir", fp.includes("kaç arkadaş girilmiş"));
check("istem geçmiş yanıtı içerir", fp.includes("Y: 12"));
check("geçmişsiz istemde başlık bloğu yok", !buildChatPrompt(withFriend, "x", "tr").includes("ÖNCEKİ KONUŞMA:"));
check("EN geçmiş başlığı", buildChatPrompt(withFriend, "give names", "en", hist).includes("CONVERSATION SO FAR:"));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
