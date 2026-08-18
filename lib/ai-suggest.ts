import type { Person } from "@/types/family";

/**
 * Kişi-bazlı AI asistanı istemleri (prompt) — SAF, test edilebilir.
 * Kullanıcı bir mod SEÇER (öneri türü), model yalnız ağaçtaki gerçeklere
 * dayanarak o türde bir çıktı üretir (uydurma yok). Kendine yeterlidir
 * (çalışma-zamanı app-importu yok) — böylece node ile test edilebilir.
 */
export type SuggestMode = "story" | "summary" | "missing" | "timeline";

export const SUGGEST_MODES: SuggestMode[] = ["story", "summary", "missing", "timeline"];

export function isSuggestMode(v: unknown): v is SuggestMode {
  return typeof v === "string" && (SUGGEST_MODES as string[]).includes(v);
}

function names(ids: string[] | undefined, idx: Map<string, Person>): string[] {
  return (ids ?? [])
    .map((id) => idx.get(id))
    .filter((p): p is Person => !!p)
    .map((p) => `${p.firstName} ${p.lastName}`.trim());
}

/** Kişinin bilinen olgularını satır satır toplar (dile göre etiketli). */
function factLines(person: Person, people: Person[], L: boolean): string[] {
  const idx = new Map(people.map((p) => [p.id, p]));
  const f = (tr: string, en: string) => (L ? en : tr);
  const parents = names(person.parentIds, idx);
  const spouses = names([...(person.spouseIds ?? []), ...(person.formerSpouseIds ?? [])], idx);
  const children = people
    .filter((p) => (p.parentIds ?? []).includes(person.id))
    .map((p) => `${p.firstName} ${p.lastName}`.trim());

  const lines: string[] = [];
  lines.push(`${f("Ad", "Name")}: ${`${person.firstName} ${person.lastName}`.trim()}`);
  if (person.nickname) lines.push(`${f("Lakap", "Nickname")}: ${person.nickname}`);
  if (person.patronymic) lines.push(`${f("Baba adı", "Patronymic")}: ${person.patronymic}`);
  if (person.birthDate) lines.push(`${f("Doğum", "Birth")}: ${person.birthDate}${person.birthPlace ? ` (${person.birthPlace})` : ""}`);
  if (person.deathDate) lines.push(`${f("Ölüm", "Death")}: ${person.deathDate}`);
  if (person.occupation) lines.push(`${f("Meslek", "Occupation")}: ${person.occupation}`);
  if (person.education) lines.push(`${f("Eğitim", "Education")}: ${person.education}`);
  if (parents.length) lines.push(`${f("Ebeveynler", "Parents")}: ${parents.join(", ")}`);
  if (spouses.length) lines.push(`${f("Eş(ler)", "Spouse(s)")}: ${spouses.join(", ")}`);
  if (children.length) lines.push(`${f("Çocuklar", "Children")}: ${children.join(", ")}`);
  if (person.bio) lines.push(`${f("Notlar", "Notes")}: ${person.bio}`);
  for (const ev of person.events ?? []) {
    lines.push(`${f("Olay", "Event")}: ${ev.title || ev.type}${ev.date ? ` (${ev.date})` : ""}${ev.place ? ` - ${ev.place}` : ""}`);
  }
  return lines;
}

const INSTRUCTIONS: Record<SuggestMode, { tr: string[]; en: string[] }> = {
  story: {
    tr: ["Aşağıdaki soy ağacı verilerinden bu kişi için sıcak, saygılı ve akıcı bir Türkçe biyografi paragrafı yaz.",
         "Yalnız verilen bilgilere dayan; uydurma bilgi EKLEME. 120–180 kelime. Tek paragraf."],
    en: ["Write a warm, respectful, flowing biography paragraph in English for this person, based ONLY on the family-tree data below.",
         "Do not invent facts not present. 120–180 words. A single paragraph."],
  },
  summary: {
    tr: ["Aşağıdaki soy ağacı verilerinden bu kişi için TEK cümlelik, olgusal bir özet yaz.",
         "Yalnız verilen bilgilere dayan; uydurma bilgi ekleme."],
    en: ["From the family-tree data below, write a SINGLE factual sentence summarizing this person.",
         "Rely only on the given facts; do not invent anything."],
  },
  missing: {
    tr: ["Aşağıdaki bilgilere bakarak, bu kişi hakkında EKSİK olan ve yaşça büyük akrabalardan sorularak öğrenilebilecek 3–5 önemli bilgiyi listele.",
         "Her satır kısa bir SORU olsun ve '• ' ile başlasın. Bilgi UYDURMA; yalnız neyin eksik olduğunu ve ne sorulabileceğini yaz."],
    en: ["Looking at the data below, list 3–5 important pieces of information that are MISSING about this person and could be learned by asking older relatives.",
         "Each line should be a short QUESTION starting with '• '. Do NOT invent facts; only say what is missing and what to ask."],
  },
  timeline: {
    tr: ["Yalnız verilen tarihlerden yola çıkarak bu kişi için kronolojik bir zaman çizelgesi taslağı üret.",
         "Her satır 'YIL — olay' biçiminde ve '• ' ile başlasın. Tarihi verilmeyen olayları EKLEME, uydurma."],
    en: ["Using only the dates provided, produce a chronological timeline draft for this person.",
         "Each line as 'YEAR — event', starting with '• '. Do NOT add or invent events without a given date."],
  },
};

export function buildSuggestPrompt(
  person: Person,
  people: Person[],
  mode: SuggestMode,
  lang: "tr" | "en" = "tr"
): string {
  const L = lang === "en";
  const instr = INSTRUCTIONS[mode][L ? "en" : "tr"];
  return [...instr, "", factLines(person, people, L).join("\n")].join("\n");
}
