import type { Gender, Person } from "@/types/family";

/**
 * YZ ile "kişi ekle / profil oluştur" — SAF çekirdek (#2). Kullanıcının doğal
 * dildeki isteğini ("pembenin annesi kuzudur, ekle ve profil oluştur") modele
 * verilecek isteme ve modelin döndürdüğü JSON'u güvenli bir EYLEM'e çevirir.
 * Hedef kişi, ağaçtaki mevcut kişilerle (yazım farkları hoş görülerek) eşleşir.
 * App runtime importu yok (yalnız TÜR) → Node ile test edilebilir.
 */

export type ActRelationType = "parent" | "child" | "spouse" | "sibling";

export interface AddAction {
  action: "add";
  person: {
    firstName: string;
    lastName?: string;
    gender?: Gender;
    birthDate?: string;
    deathDate?: string;
    birthPlace?: string;
  };
  relation?: { type: ActRelationType; targetId: string };
  say?: string;
}
export interface NoneAction {
  action: "none";
}
export type Act = AddAction | NoneAction;

const SCHEMA = `Yalnızca şu JSON'u döndür (başka metin yok):
{"action":"add","person":{"firstName":"","lastName":"","gender":"male|female|unknown","birthDate":"YYYY veya YYYY-MM-DD ya da null","birthPlace":"ya da null"},"relation":{"type":"parent|child|spouse|sibling","targetId":"<yukarıdaki listeden gerçek id>"},"say":"kısa Türkçe onay cümlesi"}
Ekleme isteği DEĞİLSE yalnızca: {"action":"none"}`;

const SCHEMA_EN = `Return ONLY this JSON (no other text):
{"action":"add","person":{"firstName":"","lastName":"","gender":"male|female|unknown","birthDate":"YYYY or YYYY-MM-DD or null","birthPlace":"or null"},"relation":{"type":"parent|child|spouse|sibling","targetId":"<real id from the list above>"},"say":"short confirmation"}
If it is NOT an add request, return ONLY: {"action":"none"}`;

/** Ağaçtaki kişileri "id — Ad Soyad (yıllar)" satırlarına indirir (hedef eşleştirme için). */
function peopleList(people: Person[], cap = 600): string {
  return people
    .slice(0, cap)
    .map((p) => {
      const b = p.birthDate?.slice(0, 4);
      const span = b ? ` (d.${b})` : "";
      return `${p.id} — ${`${p.firstName} ${p.lastName}`.trim()}${span}`;
    })
    .join("\n");
}

export function buildActSystem(lang: "tr" | "en" = "tr"): string {
  return lang === "en"
    ? "You turn a natural-language request into a single structured action for a family tree. Only add a person when the user clearly asks to add/create one. Match the target person to the given list even if the spelling differs. Output STRICT JSON only."
    : "Doğal dildeki bir isteği soy ağacı için tek bir yapısal eyleme çevirirsin. Yalnız kullanıcı açıkça kişi eklemek/oluşturmak isterse ekleme yap. Hedef kişiyi verilen listeyle yazım farkı olsa da eşleştir. Yalnızca KATI JSON döndür.";
}

export function buildActPrompt(message: string, people: Person[], lang: "tr" | "en" = "tr"): string {
  if (lang === "en") {
    return [
      "The user's message may be a request to ADD a person / create a profile, optionally linked to someone already in the tree.",
      "Relation type = the NEW person's role toward the target: mother/father → parent, child → child, spouse/husband/wife → spouse, sibling/brother/sister → sibling.",
      "Infer gender from the role/name (mother→female, father→male) when not stated.",
      "Match the target to a real id in the EXISTING PEOPLE list below, tolerating spelling differences (e.g. \"pembe\" → \"Penpe\").",
      "",
      "EXISTING PEOPLE (id — name):",
      peopleList(people),
      "",
      `MESSAGE: ${message.trim()}`,
      "",
      SCHEMA_EN,
    ].join("\n");
  }
  return [
    "Kullanıcının mesajı bir KİŞİ EKLEME / profil oluşturma isteği olabilir; kişi ağaçtaki biriyle bağlı olabilir.",
    "İlişki türü = YENİ kişinin hedefe göre rolü: anne/baba → parent, çocuk → child, eş/karı/koca → spouse, kardeş → sibling.",
    "Belirtilmemişse cinsiyeti rol/ada göre çıkar (anne→female, baba→male).",
    "Hedef kişiyi AŞAĞIDAKİ MEVCUT KİŞİLER listesindeki gerçek bir id ile eşleştir; yazım/harf farkını hoş gör (ör. \"pembe\" → \"Penpe\").",
    "",
    "MEVCUT KİŞİLER (id — ad):",
    peopleList(people),
    "",
    `MESAJ: ${message.trim()}`,
    "",
    SCHEMA,
  ].join("\n");
}

const str = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : undefined;
};
const gender = (v: unknown): Gender | undefined =>
  v === "male" || v === "female" || v === "other" || v === "unknown" ? v : undefined;
const relType = (v: unknown): ActRelationType | undefined =>
  v === "parent" || v === "child" || v === "spouse" || v === "sibling" ? v : undefined;

/**
 * Modelin (olası kod bloklu) JSON çıktısını güvenli bir `Act`'e çevirir.
 * Geçersiz/eksik ise `{action:"none"}`. `validIds` verilirse hedef id yalnız
 * bu kümedeyse kabul edilir (uydurma id engellenir).
 */
export function parseActResponse(text: string, validIds?: Set<string>): Act {
  let s = (text ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a > 0 || b < s.length - 1) s = s.slice(Math.max(0, a), b + 1);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(s);
  } catch {
    return { action: "none" };
  }
  if (data.action !== "add" || typeof data.person !== "object" || data.person === null) {
    return { action: "none" };
  }
  const p = data.person as Record<string, unknown>;
  const firstName = str(p.firstName);
  if (!firstName) return { action: "none" }; // ad yoksa ekleme

  const add: AddAction = {
    action: "add",
    person: {
      firstName,
      lastName: str(p.lastName) ?? "",
      gender: gender(p.gender),
      birthDate: str(p.birthDate),
      deathDate: str(p.deathDate),
      birthPlace: str(p.birthPlace),
    },
    say: str(data.say),
  };

  const rel = data.relation as Record<string, unknown> | undefined;
  const rt = rel ? relType(rel.type) : undefined;
  const targetId = rel ? str(rel.targetId) : undefined;
  if (rt && targetId && (!validIds || validIds.has(targetId))) {
    add.relation = { type: rt, targetId };
  }
  return add;
}
