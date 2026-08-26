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

/** Aile-dışı yakın (çevre) mi? (lib/associates.ts ile aynı kural — burada satır
 *  içi, çünkü bu modül testte bağımsız/importsuz kalmalı.) */
const isCevre = (p: Person): boolean => p.kind === "cevre";

/** Bağ türü anahtarı → okunur Türkçe etiket (AI bağlamı için; importsuz). */
const ASSOC_LABEL: Record<string, string> = {
  arkadas: "arkadaş", yakinarkadas: "yakın arkadaş", komsu: "komşu",
  ailedostu: "aile dostu", kirve: "kirve", vasi: "vasi", ogretmen: "öğretmen",
  ogrenci: "öğrenci", isortagi: "iş ortağı", meslektas: "meslektaş", diger: "diğer",
};

/**
 * Ağacın sayısal özeti — toplam/üye/yakın çevre (arkadaş) sayıları. Böylece
 * "toplam arkadaş sayısı nedir?" gibi toplu sorular yanıtlanabilir.
 */
export function buildTreeSummary(people: Person[]): string {
  const friends = people.filter(isCevre).length;
  const members = people.length - friends;
  return `ÖZET: toplam ${people.length} kişi — ${members} aile üyesi, ${friends} yakın çevre (arkadaş/komşu/aile dostu vb.).`;
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
    if (isCevre(p)) parts.push("yakın çevre (aile-dışı)");
    if (p.birthPlace) parts.push(p.birthPlace);
    const par = (p.parentIds ?? []).map(nameOf).filter(Boolean);
    if (par.length) parts.push(`ebeveyn: ${par.join(", ")}`);
    const sp = [...(p.spouseIds ?? []), ...(p.formerSpouseIds ?? [])].map(nameOf).filter(Boolean);
    if (sp.length) parts.push(`eş: ${sp.join(", ")}`);
    const assoc = (p.associations ?? [])
      .map((a) => { const n = nameOf(a.personId); return n ? `${n} (${ASSOC_LABEL[a.type] ?? a.type})` : ""; })
      .filter(Boolean);
    if (assoc.length) parts.push(`yakın çevresi: ${assoc.join(", ")}`);
    return "- " + parts.join(" · ");
  });
  const more = people.length > cap ? `\n(+${people.length - cap} kişi daha)` : "";
  return lines.join("\n") + more;
}

/** Sohbet geçmişindeki bir sıra (takip sorularının bağlamı için). */
export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** Son N konuşma sırasını istemde gösterilecek bir bloğa dönüştürür. */
function historyBlock(history: ChatTurn[], lang: "tr" | "en", max = 8): string[] {
  const recent = history.filter((h) => (h.text ?? "").trim()).slice(-max);
  if (recent.length === 0) return [];
  const head = lang === "en" ? "CONVERSATION SO FAR:" : "ÖNCEKİ KONUŞMA:";
  const uQ = lang === "en" ? "Q" : "S";
  const aA = lang === "en" ? "A" : "Y";
  return [head, ...recent.map((h) => `${h.role === "user" ? uQ : aA}: ${h.text.trim()}`), ""];
}

/**
 * Sohbet istemi — kurallar + bağlam + (varsa) önceki konuşma + soru tek metinde.
 * Yönerge sistem yerine isteme gömülür: bazı modeller sistem yönergesini yanıt
 * sanıp aynen geri döndürebiliyordu; bu yapı o "eko"yu önler. Geçmiş eklenir ki
 * "isimlerini ver" gibi takip soruları önceki bağlamı (neyin ismi?) korusun.
 */
export function buildChatPrompt(
  people: Person[],
  question: string,
  lang: "tr" | "en" = "tr",
  history: ChatTurn[] = []
): string {
  if (lang === "en") {
    return [
      "Below is a family tree's data. Answer the QUESTION using ONLY this data, briefly and factually, in English.",
      "Use CONVERSATION SO FAR to resolve follow-up references (e.g. \"give their names\" refers to the previous answer's subject).",
      "If the answer is not in the data, say \"That isn't in the tree.\" Do NOT repeat these rules or the data.",
      "",
      "FAMILY TREE:",
      buildTreeSummary(people),
      buildTreeContext(people),
      "",
      ...historyBlock(history, lang),
      `QUESTION: ${question.trim()}`,
      "",
      "ANSWER:",
    ].join("\n");
  }
  return [
    "Aşağıda bir soy ağacının verisi var. SORU'yu YALNIZ bu veriye dayanarak, kısa ve olgusal biçimde Türkçe yanıtla.",
    "Takip sorularındaki göndermeleri (ör. \"isimlerini ver\" = önceki yanıtın konusu) ÖNCEKİ KONUŞMA'dan çöz.",
    "Yanıt veride yoksa \"Bu bilgi ağaçta yok.\" de. Kuralları ya da veriyi tekrar ETME; yalnız yanıtı yaz.",
    "",
    "SOY AĞACI:",
    buildTreeSummary(people),
    buildTreeContext(people),
    "",
    ...historyBlock(history, lang),
    `SORU: ${question.trim()}`,
    "",
    "YANIT:",
  ].join("\n");
}
