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
const SCHEMA_TR = `Yalnızca şu JSON'u döndür (başka metin, açıklama ya da kod bloğu YOK):
{"people":[{"id":"p1","firstName":"","lastName":"","gender":"male|female|unknown","birthDate":"YYYY veya YYYY-MM-DD ya da null","officialBirthDate":"nüfusa göre (resmi) tarih varsa, yoksa null","deathDate":"... ya da null","birthPlace":"il/ilçe/köy ya da null","fatherId":"p2 ya da null","motherId":"p3 ya da null","spouseIds":["p4"]}]}`;

const SCHEMA_EN = `Return ONLY this JSON (no other text, explanation or code fence):
{"people":[{"id":"p1","firstName":"","lastName":"","gender":"male|female|unknown","birthDate":"YYYY or YYYY-MM-DD or null","officialBirthDate":"registry (official) date if any, else null","deathDate":"... or null","birthPlace":"province/district/village or null","fatherId":"p2 or null","motherId":"p3 or null","spouseIds":["p4"]}]}`;

export function buildExtractSystem(lang: "tr" | "en" = "tr"): string {
  return lang === "en"
    ? "You are an expert genealogist and a careful document reader. You can make sense of ANY file — a phone photo of a handwritten page, a scanned or barcoded government document, a PDF, a spreadsheet, a Word file, loose notes, or exported genealogy data — no matter the layout or quality. Reason about what the document is, then extract every person it mentions. Use only information actually present; never invent people, dates or relationships. Output STRICT JSON only."
    : "Uzman bir soybilimci ve dikkatli bir belge okuyucususun. HERHANGİ bir dosyayı — el yazısı bir sayfanın telefon fotoğrafı, taranmış ya da barkodlu bir resmî belge, PDF, tablo, Word, dağınık notlar ya da dışa aktarılmış soy verisi — düzeni ya da kalitesi ne olursa olsun anlamlandırabilirsin. Önce belgenin ne olduğunu akıl yürüterek çöz, sonra içindeki HER kişiyi çıkar. Yalnız gerçekten var olan bilgiyi kullan; kişi, tarih ya da ilişki UYDURMA. Yalnızca KATI JSON döndür.";
}

export function buildExtractPrompt(lang: "tr" | "en" = "tr"): string {
  const L = lang === "en";
  const lines = L
    ? [
        "Extract a family tree from the attached file(s). The file can be ANYTHING: a photo of handwriting, a scanned or barcoded official/registry document, a PDF, a table, a Word file, plain notes, or exported data. Its format and layout are unknown — figure them out by reasoning.",
        "STEP 1 — Understand the document: what is it, what is its structure (columns, rows, field labels, a diagram, a list)? Read the whole thing, including small print and every row/branch.",
        "STEP 2 — Extract EVERY person that appears — not only the main subject. Anyone named as a father, mother, spouse or child MUST also become a person and be linked. If the same person appears more than once, output them ONCE (same id).",
        "Turkish civil-registry hints (documents like Nüfus Kayıt Örneği, Yerleşim Yeri Belgesi, Alt-Üst Soy Bilgisi): 'Adı'=firstName, 'Soyadı'=lastName, 'Baba adı'=father's name, 'Ana adı'=mother's name, 'Doğum yeri'=birthPlace, 'Doğum tarihi'=birthDate, 'Cinsiyeti' Erkek=male / Kadın=female. Registry-vs-real birth dates: put the registry one in officialBirthDate.",
        "Gender: use male/female; if not stated, infer sensibly from the given name/role, otherwise unknown.",
        "Dates: convert DD.MM.YYYY or D/M/YYYY etc. to YYYY-MM-DD (year-only → YYYY). Unknown fields → null.",
        "Give each person a temporary id (p1, p2, …). Link parents via fatherId/motherId and marriages via spouseIds using those ids.",
        SCHEMA_EN,
      ]
    : [
        "Ekteki dosya(lar)dan bir soy ağacı çıkar. Dosya HER ŞEY olabilir: el yazısı fotoğrafı, taranmış ya da barkodlu resmî/nüfus belgesi, PDF, tablo, Word, düz not ya da dışa aktarılmış veri. Biçimi ve düzeni belli değil — akıl yürüterek çöz.",
        "ADIM 1 — Belgeyi anla: bu nedir, düzeni nasıl (sütunlar, satırlar, alan etiketleri, bir şema, bir liste)? Küçük yazılar ve her satır/dal dâhil TAMAMINI oku.",
        "ADIM 2 — GEÇEN HER KİŞİYİ çıkar — yalnız ana kişiyi değil. 'Baba adı', 'Ana adı', 'Eşi' ya da 'Çocuğu' olarak GEÇEN herkes de birer kişi OLMALI ve bağlanmalı. Aynı kişi birden çok yerde geçiyorsa TEK kez (aynı id) yaz.",
        "Türkçe nüfus ipuçları (Nüfus Kayıt Örneği, Yerleşim Yeri Belgesi, Alt-Üst Soy Bilgisi gibi belgeler): 'Adı'=firstName, 'Soyadı'=lastName, 'Baba adı'=babanın adı, 'Ana adı'=annenin adı, 'Doğum yeri'=birthPlace, 'Doğum tarihi'=birthDate, 'Cinsiyeti' Erkek=male / Kadın=female. Nüfusa göre (resmi) doğum tarihi ayrıca verildiyse onu officialBirthDate'e koy.",
        "Cinsiyet: male/female kullan; yazmıyorsa ad/rol'e göre makul çıkarım yap, olmuyorsa unknown.",
        "Tarih: GG.AA.YYYY ya da G/A/YYYY vb. biçimleri YYYY-AA-GG'ye çevir (yalnız yıl → YYYY). Bilinmeyen alan → null.",
        "Her kişiye geçici id ver (p1, p2, …). Ebeveynleri fatherId/motherId, evlilikleri spouseIds ile bu id'lere bağla.",
        SCHEMA_TR,
      ];
  return lines.join("\n");
}

/** İlk deneme boş dönerse daha ısrarlı ikinci deneme için istem. */
export function buildRetryPrompt(lang: "tr" | "en" = "tr"): string {
  return lang === "en"
    ? [
        "Look again — this document almost certainly names at least one person. Read every label, cell and line, including barcodes' printed fields and faint text.",
        "List each distinct person you can find with whatever fields are legible; link relatives you can see. Do not return an empty list unless there is genuinely no person.",
        SCHEMA_EN,
      ].join("\n")
    : [
        "Tekrar bak — bu belgede neredeyse kesinlikle en az bir kişi geçiyor. Her etiketi, hücreyi ve satırı; barkodların yazılı alanlarını ve soluk metinleri dâhil oku.",
        "Bulabildiğin her ayrı kişiyi, okunabilen alanlarıyla listele; görebildiğin akrabalık bağlarını kur. Gerçekten hiç kişi yoksa boş liste dön, aksi hâlde DÖNME.",
        SCHEMA_TR,
      ].join("\n");
}

interface RawPerson {
  id?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  gender?: unknown;
  birthDate?: unknown;
  officialBirthDate?: unknown;
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
    const obd = str(r.officialBirthDate);
    if (obd) p.officialBirthDate = obd;
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
