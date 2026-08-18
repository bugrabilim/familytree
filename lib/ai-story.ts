import type { Person } from "@/types/family";

/**
 * Kişi biyografisi için AI istemi (prompt) üretir — SAF, test edilebilir.
 * Ağaç verisinden ilgili gerçekleri toplar; model yalnız bu gerçeklere dayanıp
 * kısa bir anlatı yazar (uydurma yok). Dil `tr`/`en`.
 */

function names(ids: string[] | undefined, idx: Map<string, Person>): string[] {
  return (ids ?? [])
    .map((id) => idx.get(id))
    .filter((p): p is Person => !!p)
    .map((p) => `${p.firstName} ${p.lastName}`.trim());
}

export function buildStoryPrompt(person: Person, people: Person[], lang: "tr" | "en" = "tr"): string {
  const idx = new Map(people.map((p) => [p.id, p]));
  const parents = names(person.parentIds, idx);
  const spouses = names([...(person.spouseIds ?? []), ...(person.formerSpouseIds ?? [])], idx);
  const children = people
    .filter((p) => (p.parentIds ?? []).includes(person.id))
    .map((p) => `${p.firstName} ${p.lastName}`.trim());

  const L = lang === "en";
  const f = (tr: string, en: string) => (L ? en : tr);

  const lines: string[] = [];
  lines.push(`${f("Ad", "Name")}: ${`${person.firstName} ${person.lastName}`.trim()}`);
  if (person.nickname) lines.push(`${f("Lakap", "Nickname")}: ${person.nickname}`);
  if (person.patronymic) lines.push(`${f("Baba adı", "Patronymic")}: ${person.patronymic}`);
  if (person.birthDate) lines.push(`${f("Doğum", "Birth")}: ${person.birthDate}${person.birthPlace ? ` (${person.birthPlace})` : ""}`);
  if (person.deathDate) lines.push(`${f("Ölüm", "Death")}: ${person.deathDate}`);
  if (person.occupation) lines.push(`${f("Meslek", "Occupation")}: ${person.occupation}`);
  if (person.education) lines.push(`${f("Eğitim", "Education")}: ${person.education}`);
  if (person.birthPlace) lines.push(`${f("Doğum yeri", "Birthplace")}: ${person.birthPlace}`);
  if (parents.length) lines.push(`${f("Ebeveynler", "Parents")}: ${parents.join(", ")}`);
  if (spouses.length) lines.push(`${f("Eş(ler)", "Spouse(s)")}: ${spouses.join(", ")}`);
  if (children.length) lines.push(`${f("Çocuklar", "Children")}: ${children.join(", ")}`);
  if (person.bio) lines.push(`${f("Notlar", "Notes")}: ${person.bio}`);
  for (const ev of person.events ?? []) {
    lines.push(`${f("Olay", "Event")}: ${ev.title || ev.type}${ev.date ? ` (${ev.date})` : ""}${ev.place ? ` - ${ev.place}` : ""}`);
  }

  const instr = L
    ? [
        "Write a warm, respectful, flowing biography paragraph in English for this person, based ONLY on the family-tree data below.",
        "Do not invent facts not present. 120–180 words. A single paragraph.",
      ]
    : [
        "Aşağıdaki soy ağacı verilerinden bu kişi için sıcak, saygılı ve akıcı bir Türkçe biyografi paragrafı yaz.",
        "Yalnız verilen bilgilere dayan; uydurma bilgi EKLEME. 120–180 kelime. Tek paragraf.",
      ];

  return [...instr, "", lines.join("\n")].join("\n");
}
