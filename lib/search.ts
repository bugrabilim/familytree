import type { Gender, Person } from "@/types/family";

/**
 * Gelişmiş arama/filtre (Madde 7) — saf, test edilebilir mantık. Liste
 * görünümü metin araması + kategori çipleri + bu alan-bazlı süzgeçleri birlikte
 * (VE) uygular. Yalnız `Person` TÜR'ü içe aktarılır (Node ile çalıştırılabilir).
 */

export interface FieldFilters {
  /** Boş = tüm cinsiyetler; aksi hâlde yalnız seçilenler. */
  genders: Gender[];
  /** Doğum yılı alt/üst sınırı (dâhil). Tarihi olmayan kişi sınır varsa elenir. */
  birthYearMin?: number;
  birthYearMax?: number;
  /** Doğum yeri — içerir (contains). */
  place: string;
  /** Meslek — içerir. */
  occupation: string;
  /**
   * Eğitim seviyesi anahtarı — tam eşleşme; boş = hepsi. Özel değer
   * `NO_EDUCATION` → yalnız eğitim bilgisi OLMAYAN kişiler.
   */
  education: string;
}

/** "Okul bilgisi yok" süzgeci için özel eğitim değeri. */
export const NO_EDUCATION = "__none__";

export function emptyFieldFilters(): FieldFilters {
  return { genders: [], place: "", occupation: "", education: "" };
}

const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

export function yearOf(date?: string): number | undefined {
  if (!date) return undefined;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : undefined;
}

/** Serbest metin araması — ad, kod, yer, biyografi, meslek, sağlık, tarih… */
export function matchesQuery(p: Person, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  return (
    norm(`${p.firstName} ${p.lastName}`).includes(q) ||
    norm(p.nickname ?? "").includes(q) ||
    norm(p.patronymic ?? "").includes(q) ||
    norm(p.lineage ?? "").includes(q) ||
    (p.code ?? "").includes(q) ||
    norm(p.birthPlace ?? "").includes(q) ||
    norm(p.bio ?? "").includes(q) ||
    norm(p.occupation ?? "").includes(q) ||
    norm(p.orientation ?? "").includes(q) ||
    norm(p.congenitalCondition ?? "").includes(q) ||
    norm(p.healthCondition ?? "").includes(q) ||
    norm(p.deathCause ?? "").includes(q) ||
    (p.birthDate ?? "").includes(q)
  );
}

/** Alan-bazlı süzgeçler — hepsi VE ile uygulanır. */
export function matchesFields(p: Person, f: FieldFilters): boolean {
  if (f.genders.length && !f.genders.includes(p.gender)) return false;

  if (f.birthYearMin !== undefined || f.birthYearMax !== undefined) {
    const by = yearOf(p.birthDate);
    if (by === undefined) return false;
    if (f.birthYearMin !== undefined && by < f.birthYearMin) return false;
    if (f.birthYearMax !== undefined && by > f.birthYearMax) return false;
  }

  if (f.place.trim() && !norm(p.birthPlace ?? "").includes(norm(f.place))) return false;
  if (f.occupation.trim() && !norm(p.occupation ?? "").includes(norm(f.occupation))) return false;
  if (f.education) {
    if (f.education === NO_EDUCATION) {
      if (p.education?.trim()) return false; // eğitim bilgisi var → ele
    } else if (p.education !== f.education) {
      return false;
    }
  }
  return true;
}

/** Etkin (varsayılandan farklı) alan-süzgeci sayısı — rozet için. */
export function activeFieldCount(f: FieldFilters): number {
  let n = 0;
  if (f.genders.length) n++;
  if (f.birthYearMin !== undefined) n++;
  if (f.birthYearMax !== undefined) n++;
  if (f.place.trim()) n++;
  if (f.occupation.trim()) n++;
  if (f.education) n++;
  return n;
}
