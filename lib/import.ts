import type { Gender, Person } from "@/types/family";
import { nanoid } from "nanoid";

/**
 * Çok-biçimli içe/dışa aktarımın SAF çekirdeği (CSV + JSON) ve biçim algılama.
 *
 * GEDCOM'un kendi ayrıştırıcısı `lib/gedcom` içindedir; rotalar `detectFormat`
 * ile biçimi belirleyip GEDCOM'u oraya, CSV/JSON'u buraya yönlendirir. Bu dosya
 * bilerek yalnız `Person` TÜR'ünü (import type → çalıştırmada silinir) ve
 * `nanoid`'i alır → hiçbir uygulama-içi runtime bağımlılığı yok, Node ile
 * doğrudan test edilebilir. Yeni biçim = bir ayrıştırıcı + `detectFormat` dalı.
 */

export type ImportFormat = "gedcom" | "csv" | "json";
export type ExportFormat = "gedcom" | "csv" | "json";

export const SUPPORTED_IMPORT_EXT = [".ged", ".gedcom", ".csv", ".tsv", ".json", ".txt"] as const;

export const EXPORT_META: Record<ExportFormat, { ext: string; mime: string }> = {
  gedcom: { ext: "ged", mime: "text/plain; charset=utf-8" },
  csv: { ext: "csv", mime: "text/csv; charset=utf-8" },
  json: { ext: "json", mime: "application/json; charset=utf-8" },
};

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
  return people;
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

  const people: Person[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const firstName = str(o.firstName ?? o.first ?? o.name).trim();
    const lastName = str(o.lastName ?? o.last ?? o.surname).trim();
    if (!firstName && !lastName) continue;
    const p: Person = {
      id: str(o.id).trim() || nanoid(),
      firstName,
      lastName,
      gender: parseGender(str(o.gender)),
      parentIds: strArr(o.parentIds),
      spouseIds: strArr(o.spouseIds),
    };
    if (str(o.birthDate)) p.birthDate = str(o.birthDate);
    if (str(o.deathDate)) p.deathDate = str(o.deathDate);
    for (const k of ["birthPlace", "occupation", "nickname", "patronymic", "bio", "photo"] as const) {
      setText(p, k, str(o[k]));
    }
    if (Array.isArray(o.formerSpouseIds)) p.formerSpouseIds = strArr(o.formerSpouseIds);
    people.push(p);
  }
  return people;
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
