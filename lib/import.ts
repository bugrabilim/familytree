import type { Gender, Person } from "@/types/family";
import { PERSON_FIELDS } from "./person-fields.ts";
import { nanoid } from "nanoid";
import { extractEmbedded } from "./export-html.ts";

/**
 * Çok-biçimli içe/dışa aktarımın SAF çekirdeği (CSV + JSON) ve biçim algılama.
 *
 * GEDCOM'un kendi ayrıştırıcısı `lib/gedcom` içindedir; rotalar `detectFormat`
 * ile biçimi belirleyip GEDCOM'u oraya, CSV/JSON'u buraya yönlendirir. Bu dosya
 * bilerek yalnız `Person` TÜR'ünü (import type → çalıştırmada silinir),
 * `nanoid`'i ve aynı kısıtı taşıyan `./export-html.ts`i alır → çerçeveye
 * bağlı hiçbir runtime bağımlılığı yok, Node ile doğrudan test edilebilir.
 * Yeni biçim = bir ayrıştırıcı + `detectFormat` dalı.
 */

export type ImportFormat = "gedcom" | "csv" | "json";
export type ExportFormat = "gedcom" | "csv" | "json";

export const SUPPORTED_IMPORT_EXT = [".ged", ".gedcom", ".csv", ".tsv", ".json", ".txt", ".html", ".htm"] as const;

export const EXPORT_META: Record<ExportFormat, { ext: string; mime: string }> = {
  gedcom: { ext: "ged", mime: "text/plain; charset=utf-8" },
  csv: { ext: "csv", mime: "text/csv; charset=utf-8" },
  json: { ext: "json", mime: "application/json; charset=utf-8" },
};

/**
 * HTML ARŞİVİNİ AÇ — `exportHtml`in ürettiği dosyayı geri okunabilir hâle
 * getirir (bkz. `lib/export-html.ts`).
 *
 * Üç durumlu, çünkü ikisi yetmiyordu:
 *  · HTML DEĞİL      → metin olduğu gibi geçer, akış değişmez.
 *  · Bizim arşivimiz → gömülü JSON döner, `detectFormat` onu "json" görür.
 *  · HTML ama bizim değil → `bos`. Bu dalı ELEMEK bir hataydı: gelişigüzel
 *    bir web sayfası `detectFormat`e girseydi, içindeki virgüller yüzünden
 *    "CSV" sanılır ve kullanıcı "biçim tanınamadı" yerine ağacına saçma
 *    kayıtlar eklerdi. Sessiz bozulma yerine açık hata.
 */
export type Unwrapped = { ok: true; text: string } | { ok: false; reason: "html-bos" };

export function unwrapArchive(filename: string, text: string): Unwrapped {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const htmlMi = ext === "html" || ext === "htm" || /^\s*(<!doctype\s+html|<html[\s>])/i.test(text);
  if (!htmlMi) return { ok: true, text };
  const gomulu = extractEmbedded(text);
  return gomulu ? { ok: true, text: gomulu } : { ok: false, reason: "html-bos" };
}

/** Uzantı + içerik sezgisiyle biçim belirle. Bilinmiyorsa null. */
export function detectFormat(filename: string, text: string): ImportFormat | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "ged" || ext === "gedcom") return "gedcom";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "json") return "json";

  const head = text.slice(0, 500).replace(/^﻿/, "").trimStart();
  if (/^0\s+HEAD/m.test(head) || /^0\s+@[^@]+@\s+INDI/m.test(text)) return "gedcom";
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  if (head.includes(",") || head.includes("\t")) return "csv";
  return null;
}

/* ── Ortak yardımcılar ─────────────────────────────────────────────────────── */

function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function parseGender(v: string): Gender {
  const n = normalize(v);
  if (["female", "f", "kadin", "k", "kiz", "woman"].includes(n)) return "female";
  if (["male", "m", "erkek", "e", "man"].includes(n)) return "male";
  if (["other", "diger", "nonbinary", "o"].includes(n)) return "other";
  return "unknown";
}

/** Serbest kullanıcı girişini "GG.AA.YYYY / AA.YYYY / YYYY" biçimine esnetir. */
function normalizeDateInput(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) {
    if (s.length === 8) return `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4)}`;
    if (s.length === 6) return `${s.slice(0, 2)}.${s.slice(2)}`;
    return s;
  }
  return s.replace(/[./\-\s]+/g, ".").replace(/^\.|\.$/g, "");
}

/** CSV/serbest tarih değerini depolama biçimine ("YYYY[-MM[-DD]]") çevirir. */
function parseDate(v: string): string | undefined {
  const s = v.trim();
  if (!s) return undefined;
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return s; // zaten ISO depolama biçimi
  const n = normalizeDateInput(s);
  if (/^\d{4}$/.test(n)) return n;
  const parts = n.split(".");
  if (parts.length === 2) {
    const [m, y] = parts;
    if (/^\d{4}$/.test(y)) return `${y}-${m.padStart(2, "0")}`;
  }
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (/^\d{4}$/.test(y)) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}

function setText(p: Person, key: keyof Person, v: string) {
  const val = v.trim();
  if (val) (p as unknown as Record<string, unknown>)[key] = val;
}

/** Eş bağlarını çift yönlü (simetrik) yap. */
function symmetrizeSpouses(people: Person[]): void {
  const idx = new Map(people.map((p) => [p.id, p]));
  for (const p of people) {
    for (const sid of p.spouseIds) {
      const s = idx.get(sid);
      if (s && !s.spouseIds.includes(p.id)) s.spouseIds.push(p.id);
    }
  }
}

/* ── CSV ───────────────────────────────────────────────────────────────────── */

/** RFC-4180 benzeri CSV/TSV satır ayrıştırıcı (tırnak, kaçış, gömülü satır). */
function splitRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split("\n")[0] ?? "";
  const delim = clean.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/** Başlık hücresini kanonik alan adına eşler (TR + EN takma adlar). */
function headerField(h: string): string {
  const n = normalize(h);
  const map: Record<string, string> = {
    ad: "firstName", isim: "firstName", first: "firstName", firstname: "firstName", givenname: "firstName", given: "firstName", name: "firstName",
    soyad: "lastName", soyadi: "lastName", last: "lastName", lastname: "lastName", surname: "lastName", familyname: "lastName",
    cinsiyet: "gender", gender: "gender", sex: "gender",
    dogum: "birthDate", dogumtarihi: "birthDate", birth: "birthDate", birthdate: "birthDate", born: "birthDate", dob: "birthDate",
    olum: "deathDate", olumtarihi: "deathDate", death: "deathDate", deathdate: "deathDate", died: "deathDate", dod: "deathDate",
    dogumyeri: "birthPlace", birthplace: "birthPlace", place: "birthPlace", yer: "birthPlace",
    meslek: "occupation", occupation: "occupation", job: "occupation",
    lakap: "nickname", nickname: "nickname",
    babaadi: "patronymic", patronymic: "patronymic",
    not: "bio", notlar: "bio", bio: "bio", biyografi: "bio", notes: "bio", note: "bio",
    id: "id", kimlik: "id", kod: "id", code: "id", ref: "id",
    baba: "fatherId", father: "fatherId", fatherid: "fatherId", babaid: "fatherId",
    anne: "motherId", mother: "motherId", motherid: "motherId", anneid: "motherId",
    es: "spouseId", spouse: "spouseId", spouseid: "spouseId", esid: "spouseId",
  };
  return map[n] ?? n;
}

export function parseCsv(text: string): Person[] {
  const rows = splitRows(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(headerField);
  const col = (name: string) => header.indexOf(name);
  const at = (cols: string[], name: string) => {
    const i = col(name);
    return i >= 0 ? (cols[i] ?? "").trim() : "";
  };

  const idMap = new Map<string, string>();
  const staged = rows.slice(1).map((cols) => {
    const provided = at(cols, "id");
    const newId = nanoid();
    if (provided) idMap.set(provided, newId);
    return { cols, newId };
  });
  const resolve = (v: string) => (v ? idMap.get(v.trim()) : undefined);

  const people: Person[] = [];
  for (const { cols, newId } of staged) {
    const firstName = at(cols, "firstName");
    const lastName = at(cols, "lastName");
    if (!firstName && !lastName) continue;
    const parentIds = [resolve(at(cols, "fatherId")), resolve(at(cols, "motherId"))].filter(Boolean) as string[];
    const spouseIds = [resolve(at(cols, "spouseId"))].filter(Boolean) as string[];
    const p: Person = {
      id: newId,
      firstName,
      lastName,
      gender: parseGender(at(cols, "gender")),
      parentIds,
      spouseIds,
    };
    const bd = parseDate(at(cols, "birthDate")); if (bd) p.birthDate = bd;
    const dd = parseDate(at(cols, "deathDate")); if (dd) p.deathDate = dd;
    setText(p, "birthPlace", at(cols, "birthPlace"));
    setText(p, "occupation", at(cols, "occupation"));
    setText(p, "nickname", at(cols, "nickname"));
    setText(p, "patronymic", at(cols, "patronymic"));
    setText(p, "bio", at(cols, "bio"));
    people.push(p);
  }
  symmetrizeSpouses(people);
  inferGenderFromRoles(people, staged.map(({ cols }) => ({
    father: resolve(at(cols, "fatherId")),
    mother: resolve(at(cols, "motherId")),
  })));
  return people;
}

/**
 * Cinsiyeti belirsiz kalan kayıtları YAPISAL rolden çıkarır: bir kişi başkasının
 * "baba" sütununda geçiyorsa erkek, "anne" sütununda geçiyorsa kadındır. Kaynak
 * veriden kesin olan tek çıkarım budur; ada bakarak tahmin YAPILMAZ. Zaten
 * cinsiyeti seçili (male/female/other) kayıtlara dokunulmaz.
 */
function inferGenderFromRoles(
  people: Person[],
  links: Array<{ father?: string; mother?: string }>
): void {
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const { father, mother } of links) {
    const fa = father ? byId.get(father) : undefined;
    if (fa && fa.gender === "unknown") fa.gender = "male";
    const mo = mother ? byId.get(mother) : undefined;
    if (mo && mo.gender === "unknown") mo.gender = "female";
  }
}

/* ── JSON ──────────────────────────────────────────────────────────────────── */

/** `{ people: [...] }`, `{ persons: [...] }` ya da düz `[...]` kabul eder. */
export function parseJson(text: string): Person[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON çözümlenemedi.");
  }
  const arr: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { people?: unknown[] })?.people)
      ? (data as { people: unknown[] }).people
      : Array.isArray((data as { persons?: unknown[] })?.persons)
        ? (data as { persons: unknown[] }).persons
        : [];

  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  /*
   * KİMLİKLER YENİDEN ÜRETİLİR — kaynaktaki `id` korunmaz.
   *
   * Bu, üç içe aktarıcıdan kimlik taşıyan TEK dosyaydı ve sonucu şuydu:
   * kullanıcı uygulamanın kendi JSON dışa aktarımını "ekle" kipinde geri
   * yüklediğinde her kimlik ağaçta İKİ KEZ oluyordu. Sonrası sessiz:
   * `findRefIssues` onarılamaz `duplicateId` bildiriyor, Postgres aynası
   * "ON CONFLICT ... cannot affect row a second time" ile düşüyor ve o hata
   * `lib/blob.ts`te yutuluyordu — kullanıcı "içe aktarıldı" görüyordu.
   *
   * CSV içe aktarıcısı bu işi zaten doğru yapıyor (`idMap`). Aynı kural
   * burada da: kaynak kimlik yalnız DOSYA İÇİ bağları çözmek için kullanılır,
   * ağaca yeni bir kimlikle girer. Dosya içi bağ kaybı yok, çakışma da yok.
   */
  const idMap = new Map<string, string>();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const kaynak = str((item as Record<string, unknown>).id).trim();
    if (kaynak && !idMap.has(kaynak)) idMap.set(kaynak, nanoid());
  }
  // Dosya içinde tanımlı olmayan kimliğe bakan bağ atılır (sarkan bağ üretme).
  const cevir = (ids: string[]): string[] =>
    ids.map((x) => idMap.get(x.trim())).filter((x): x is string => !!x);

  const people: Person[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const firstName = str(o.firstName ?? o.first ?? o.name).trim();
    const lastName = str(o.lastName ?? o.last ?? o.surname).trim();
    if (!firstName && !lastName) continue;
    const kaynakId = str(o.id).trim();
    /*
     * İÇERİK ALANLARI KAYIT DEFTERİNDEN — elle yazılmış beyaz listeden değil.
     *
     * Burada sabit bir liste vardı: `birthPlace, occupation, nickname,
     * patronymic, bio, photo` + iki tarih. Geri kalan OTUZ YEDİ alan sessizce
     * düşüyordu — anılar, ses kayıtları, kaynaklar, galeri, videolar,
     * belgeler, yaşam olayları, evlat edinme bağları, ve `confidential` /
     * `privateFields` gizlilik işaretleri dâhil.
     *
     * En kötü yanı sessizliği: rota `{ count: N }` dönüyor ve kişi sayısı
     * DOĞRU oluyor, dolayısıyla kayıp fark edilmiyor. Oysa uygulamanın
     * kullanıcıya verdiği söz tam olarak bunun tersi — tek dosyalık HTML
     * yedeği "hem bakılan hem GERİ YÜKLENEBİLEN" bir arşiv
     * (`docs/YEDEKLEME.md` §0, Kullanım Şartları). O söz bu satırlarda
     * tutulur ya da tutulmaz.
     *
     * `PERSON_FIELDS` doğru kaynak, çünkü sunucunun sahip olduğu alanlar
     * (`code`, `addedBy`, `entrySource`) ve üçüncü kişiye ait iletişim/onay
     * alanları zaten `EXCLUDED_FIELDS`ta — defterden gelen hiçbir şey onları
     * içeremez. Yani kapsam genişledi ama güven sınırı AYNI kaldı.
     */
    const p: Person = {
      ...icerikAlanlari(o),
      id: (kaynakId && idMap.get(kaynakId)) || nanoid(),
      firstName,
      lastName,
      gender: parseGender(str(o.gender)),
      parentIds: cevir(strArr(o.parentIds)),
      spouseIds: cevir(strArr(o.spouseIds)),
    };
    if (Array.isArray(o.formerSpouseIds)) p.formerSpouseIds = cevir(strArr(o.formerSpouseIds));

    /*
     * EBEVEYN BAĞININ NİTELİĞİ — anahtarlar kimlik olduğu için ÇEVRİLMELİ.
     *
     * `parentLinks` bir `Record<ebeveynId, ParentLink>`: evlat edinme, üvey,
     * koruyucu aile, kopukluk ve serbest not. Ham hâliyle kopyalansaydı
     * anahtarlar DOSYADAKİ kimliklere bakardı ve ağaçtaki hiçbir ebeveyne
     * denk gelmezdi — yani veri "geldi" görünür, hiçbir yerde görünmezdi.
     * Çözülemeyen anahtar atılıyor (sarkan bağ üretme kuralı, yukarısı).
     */
    if (o.parentLinks && typeof o.parentLinks === "object" && !Array.isArray(o.parentLinks)) {
      const baglar: Record<string, unknown> = {};
      for (const [kaynakId, deger] of Object.entries(o.parentLinks as Record<string, unknown>)) {
        const yeniId = idMap.get(kaynakId.trim());
        if (yeniId && deger && typeof deger === "object") baglar[yeniId] = deger;
      }
      if (Object.keys(baglar).length) p.parentLinks = baglar as Person["parentLinks"];
    }

    /*
     * YAKIN ÇEVRE BAĞLARI — `personId` de bir kimlik, o da çevrilmeli.
     * Karşılığı dosyada olmayan bağ atılıyor: kimsenin göstermediği bir
     * kimliğe bakan "Kirve: (boş)" satırı veriden beter.
     */
    if (Array.isArray(o.associations)) {
      const bagli = (o.associations as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({ ...a, personId: idMap.get(str(a.personId).trim()) }))
        .filter((a) => !!a.personId);
      if (bagli.length) p.associations = bagli as Person["associations"];
    }

    people.push(p);
  }
  return people;
}

/**
 * Kayıt defterindeki KULLANICI İÇERİĞİ alanlarını gelen nesneden çıkarır.
 *
 * `buildPersonFields` (POST yolu) yerine ayrı bir işlev, çünkü güven düzeyi
 * farklı: POST'un gövdesini kendi formumuz üretiyor, buraya gelen dosya ise
 * YABANCI olabilir. Bu yüzden tür uyuşmazlığı sessizce kabul edilmiyor —
 * metin alanına sayı, dizi alanına nesne gelirse alan ATLANIYOR. Yoksa
 * `events.map(e => e.title)` gibi her yer, dosyanın biçimine güvenmek
 * zorunda kalırdı.
 *
 * Kimlik taşıyan alanlar (`parentLinks`, `associations`) burada DEĞİL:
 * onların içindeki kimliklerin çevrilmesi gerekiyor, çağıran ayrıca yapıyor.
 */
function icerikAlanlari(o: Record<string, unknown>): Partial<Person> {
  const out: Record<string, unknown> = {};
  for (const spec of PERSON_FIELDS) {
    const k = String(spec.key);
    if (k === "associations") continue; // kimlik çevirisi gerekiyor
    const v = o[k];
    if (v === undefined || v === null) continue;
    switch (spec.merge) {
      case "array":
        if (Array.isArray(v)) out[k] = v;
        break;
      case "bool":
        if (typeof v === "boolean") out[k] = v;
        break;
      case "obj":
        if (typeof v === "object" && !Array.isArray(v)) out[k] = v;
        break;
      default: {
        const t = typeof v === "string" ? v.trim() : "";
        if (t) out[k] = t;
        break;
      }
    }
  }
  return out as Partial<Person>;
}

/** Biçime göre CSV/JSON içe aktarma (GEDCOM rotada ayrıca ele alınır). */
export function parseNonGedcom(format: "csv" | "json", text: string): Person[] {
  return format === "csv" ? parseCsv(text) : parseJson(text);
}

/* ── Dışa aktarım (CSV/JSON) ───────────────────────────────────────────────── */

function csvEsc(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function exportCsv(people: Person[]): string {
  const cols = ["id", "firstName", "lastName", "gender", "birthDate", "deathDate", "birthPlace", "occupation", "fatherId", "motherId", "spouseId"];
  const idx = new Map(people.map((p) => [p.id, p]));
  const lines = [cols.join(",")];
  for (const p of people) {
    const parents = p.parentIds.map((id) => idx.get(id)).filter(Boolean) as Person[];
    const father = parents.find((x) => x.gender === "male")?.id ?? "";
    const mother = parents.find((x) => x.gender === "female")?.id ?? parents.find((x) => x.id !== father)?.id ?? "";
    const vals = [p.id, p.firstName, p.lastName, p.gender, p.birthDate ?? "", p.deathDate ?? "", p.birthPlace ?? "", p.occupation ?? "", father, mother, p.spouseIds[0] ?? ""];
    lines.push(vals.map((v) => csvEsc(String(v))).join(","));
  }
  return lines.join("\n");
}

export function exportJson(people: Person[]): string {
  return JSON.stringify({ format: "soyagaci-json", version: 1, people }, null, 2);
}
