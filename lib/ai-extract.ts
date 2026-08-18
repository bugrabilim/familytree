import type { Gender, Person } from "@/types/family";
import { nanoid } from "nanoid";

/**
 * Yapay zekâ ile "herhangi bir dosyadan soy ağacı" çıkarımının SAF çekirdeği:
 * istem (prompt) üretimi ve modelin döndürdüğü JSON'u `Person[]`'e çevirme.
 * App runtime importu yoktur (yalnız Person TÜR'ü + nanoid) → Node ile test
 * edilebilir. Gerçek dosya→metin/görsel gönderimi ve model çağrısı sunucu
 * tarafında (lib/gemini) yapılır.
 */

/** Modelden istenen katı JSON şeması (tek satırlık özet, isteme gömülür). */
const SCHEMA_TR = `Yalnızca şu JSON'u döndür (başka metin yok):
{"people":[{"id":"p1","firstName":"","lastName":"","gender":"male|female|unknown","birthDate":"YYYY veya YYYY-MM-DD ya da null","deathDate":"... ya da null","birthPlace":"... ya da null","fatherId":"p2 ya da null","motherId":"p3 ya da null","spouseIds":["p4"]}]}`;

const SCHEMA_EN = `Return ONLY this JSON (no other text):
{"people":[{"id":"p1","firstName":"","lastName":"","gender":"male|female|unknown","birthDate":"YYYY or YYYY-MM-DD or null","deathDate":"... or null","birthPlace":"... or null","fatherId":"p2 or null","motherId":"p3 or null","spouseIds":["p4"]}]}`;

export function buildExtractSystem(lang: "tr" | "en" = "tr"): string {
  return lang === "en"
    ? "You are a careful genealogist. Extract a family tree from the user's file(s). Use only information present; never invent people or relationships. Output strict JSON only."
    : "Dikkatli bir soybilimcisin. Kullanıcının dosyalarından bir soy ağacı çıkar. Yalnız dosyada bulunan bilgiyi kullan; kişi veya ilişki UYDURMA. Yalnızca katı JSON döndür.";
}

export function buildExtractPrompt(lang: "tr" | "en" = "tr"): string {
  const L = lang === "en";
  const lines = L
    ? [
        "Read the attached file(s) — they may be a photo of handwriting, a PDF, a spreadsheet, a document, notes, or exported genealogy data.",
        "Extract every person and their relationships.",
        "Give each person a temporary id (p1, p2, …). Link parents via fatherId/motherId and marriages via spouseIds using those ids.",
        "Gender: male/female/unknown. Dates as YYYY or YYYY-MM-DD when known, else null. Unknown fields → null.",
        SCHEMA_EN,
      ]
    : [
        "Ekteki dosya(lar)ı oku — el yazısı fotoğrafı, PDF, tablo, belge, notlar ya da dışa aktarılmış soy verisi olabilir.",
        "Her kişiyi ve ilişkilerini çıkar.",
        "Her kişiye geçici bir id ver (p1, p2, …). Ebeveynleri fatherId/motherId, evlilikleri spouseIds ile bu id'lere bağla.",
        "Cinsiyet: male/female/unknown. Tarihler biliniyorsa YYYY ya da YYYY-MM-DD, yoksa null. Bilinmeyen alan → null.",
        SCHEMA_TR,
      ];
  return lines.join("\n");
}

interface RawPerson {
  id?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  gender?: unknown;
  birthDate?: unknown;
  deathDate?: unknown;
  birthPlace?: unknown;
  fatherId?: unknown;
  motherId?: unknown;
  spouseIds?: unknown;
}

const str = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t && t.toLowerCase() !== "null" ? t : undefined;
};
const gender = (v: unknown): Gender =>
  v === "male" || v === "female" || v === "other" ? v : "unknown";

/** Modelin (olası kod bloklu) JSON çıktısını güvenle `Person[]`'e çevirir. */
export function parseExtractedJson(text: string): Person[] {
  // ```json ... ``` bloklarını ve baş/son gürültüyü temizle
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a > 0 || b < s.length - 1) s = s.slice(Math.max(0, a), b + 1);

  let data: { people?: RawPerson[] };
  try {
    data = JSON.parse(s);
  } catch {
    return [];
  }
  const raw = Array.isArray(data.people) ? data.people : [];
  if (raw.length === 0) return [];

  // Geçici id → kalıcı id
  const idMap = new Map<string, string>();
  for (const r of raw) {
    const tid = str(r.id);
    if (tid && !idMap.has(tid)) idMap.set(tid, nanoid());
  }
  const resolve = (v: unknown): string | undefined => {
    const t = str(v);
    return t ? idMap.get(t) : undefined;
  };

  const people: Person[] = [];
  const spouseSets = new Map<string, Set<string>>();
  const ensureSet = (id: string) => {
    let s = spouseSets.get(id);
    if (!s) { s = new Set(); spouseSets.set(id, s); }
    return s;
  };

  for (const r of raw) {
    const tid = str(r.id);
    const id = tid ? idMap.get(tid)! : nanoid();
    const parentIds: string[] = [];
    const fa = resolve(r.fatherId);
    const mo = resolve(r.motherId);
    if (fa) parentIds.push(fa);
    if (mo) parentIds.push(mo);

    // eşleri çift yönlü topla
    if (Array.isArray(r.spouseIds)) {
      for (const sp of r.spouseIds) {
        const other = resolve(sp);
        if (other && other !== id) { ensureSet(id).add(other); ensureSet(other).add(id); }
      }
    }

    const p: Person = {
      id,
      firstName: str(r.firstName) ?? "",
      lastName: str(r.lastName) ?? "",
      gender: gender(r.gender),
      parentIds,
      spouseIds: [],
    };
    const bd = str(r.birthDate);
    if (bd) p.birthDate = bd;
    const dd = str(r.deathDate);
    if (dd) p.deathDate = dd;
    const bp = str(r.birthPlace);
    if (bp) p.birthPlace = bp;
    people.push(p);
  }

  // topladığımız eş bağlarını yaz
  for (const p of people) p.spouseIds = [...(spouseSets.get(p.id) ?? [])];

  // ad-soyad tümüyle boş olanları ele (gürültü)
  return people.filter((p) => p.firstName || p.lastName);
}
