import type { Person } from "@/types/family";

/**
 * Ağaç hakkında AI sohbeti/sorgusu için SAF yardımcılar: modele verilecek
 * ağaç bağlamını (özet) ve sistem yönergesini üretir. App runtime importu yok
 * (yalnız Person TÜR'ü) → Node ile test edilebilir.
 */

export function buildChatSystem(lang: "tr" | "en" = "tr"): string {
  return lang === "en"
    ? "You are a helpful assistant for a family tree. Answer ONLY from the tree data given below; if the answer isn't there, say you don't know. Be concise and factual. Reply in English."
    : "Bir soy ağacı yardımcısısın. Yanıtı YALNIZ aşağıdaki ağaç verisinden ver; veri yoksa bilmediğini söyle. Kısa ve olgusal ol. Türkçe yanıtla.";
}

function span(p: Person): string {
  const b = p.birthDate?.slice(0, 4);
  const d = p.deathDate?.slice(0, 4);
  if (b && d) return ` (${b}–${d})`;
  if (b) return ` (d.${b})`;
  if (d) return ` (ö.${d})`;
  return "";
}

/**
 * Ağacı satır satır özetler (modelin bağlamı). Büyük ağaçlarda `cap` ile
 * sınırlanır. Her satır: Ad Soyad (yıllar) [yer] · ebeveyn: … · eş: …
 */
export function buildTreeContext(people: Person[], cap = 400): string {
  const byId = new Map(people.map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? `${p.firstName} ${p.lastName}`.trim() : "";
  };
  const lines = people.slice(0, cap).map((p) => {
    const parts: string[] = [`${p.firstName} ${p.lastName}`.trim() + span(p)];
    if (p.birthPlace) parts.push(p.birthPlace);
    const par = (p.parentIds ?? []).map(nameOf).filter(Boolean);
    if (par.length) parts.push(`ebeveyn: ${par.join(", ")}`);
    const sp = [...(p.spouseIds ?? []), ...(p.formerSpouseIds ?? [])].map(nameOf).filter(Boolean);
    if (sp.length) parts.push(`eş: ${sp.join(", ")}`);
    return "- " + parts.join(" · ");
  });
  const more = people.length > cap ? `\n(+${people.length - cap} kişi daha)` : "";
  return lines.join("\n") + more;
}

/**
 * Sohbet istemi — kurallar + bağlam + soru tek metinde. Yönerge sistem yerine
 * isteme gömülür: bazı modeller sistem yönergesini yanıt sanıp aynen geri
 * döndürebiliyordu; bu yapı o "eko"yu önler ve tutarlılığı artırır.
 */
export function buildChatPrompt(people: Person[], question: string, lang: "tr" | "en" = "tr"): string {
  if (lang === "en") {
    return [
      "Below is a family tree's data. Answer the QUESTION using ONLY this data, briefly and factually, in English.",
      "If the answer is not in the data, say \"That isn't in the tree.\" Do NOT repeat these rules or the data.",
      "",
      "FAMILY TREE:",
      buildTreeContext(people),
      "",
      `QUESTION: ${question.trim()}`,
      "",
      "ANSWER:",
    ].join("\n");
  }
  return [
    "Aşağıda bir soy ağacının verisi var. SORU'yu YALNIZ bu veriye dayanarak, kısa ve olgusal biçimde Türkçe yanıtla.",
    "Yanıt veride yoksa \"Bu bilgi ağaçta yok.\" de. Kuralları ya da veriyi tekrar ETME; yalnız yanıtı yaz.",
    "",
    "SOY AĞACI:",
    buildTreeContext(people),
    "",
    `SORU: ${question.trim()}`,
    "",
    "YANIT:",
  ].join("\n");
}
