import type { Person } from "@/types/family";

/** "YYYY…" → yıl sayısı (yoksa undefined). `lib/search.ts` ile aynı davranış. */
function yearOf(date?: string): number | undefined {
  if (!date) return undefined;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : undefined;
}

/**
 * Aile geneli tarihsel zaman çizelgesi (Madde 4) — saf, test edilebilir.
 * Her kişinin yaşam aralığını (doğum→ölüm ya da bugüne) bir çubuk olarak verir;
 * "kim hangi yıllarda yaşadı" görünümü için. Yalnız `Person` TÜR'ü kullanılır.
 *
 * Gizlilik: çağıran maskeli kopyaları geçirir; maskeli (gizli yaşayan) kişide
 * doğum tarihi bulunmadığından çizelgede yer almaz — tarih sızmaz.
 */
export interface TimelineRow {
  id: string;
  startYear: number;
  endYear: number;
  living: boolean;
}

export interface Timeline {
  minYear: number;
  maxYear: number;
  rows: TimelineRow[];
}

export function buildTimeline(people: Person[], currentYear: number): Timeline {
  const rows: TimelineRow[] = [];
  for (const p of people) {
    const start = yearOf(p.birthDate);
    if (start === undefined) continue;
    const dy = yearOf(p.deathDate);
    const living = dy === undefined;
    // Ölüm yılı doğumdan önceyse (hatalı veri) çubuğu doğum yılında tut.
    const end = Math.max(start, living ? currentYear : dy);
    rows.push({ id: p.id, startYear: start, endYear: end, living });
  }

  rows.sort((a, b) => a.startYear - b.startYear || a.endYear - b.endYear);

  let minYear = Infinity;
  let maxYear = -Infinity;
  for (const r of rows) {
    if (r.startYear < minYear) minYear = r.startYear;
    if (r.endYear > maxYear) maxYear = r.endYear;
  }
  if (!rows.length) {
    minYear = currentYear;
    maxYear = currentYear;
  }
  return { minYear, maxYear, rows };
}

/**
 * Genel aile büyüklüğü eğrisi (#3) — her yıl için O YIL HAYATTA olan kişi
 * sayısı. Zaman çizelgesinin üstünde "aile zaman içinde nasıl büyüdü/küçüldü"
 * genel görünümünü çizmek için. Saf ve test edilebilir.
 */
export function livingByYear(
  rows: TimelineRow[],
  minYear: number,
  maxYear: number
): Array<{ year: number; count: number }> {
  const out: Array<{ year: number; count: number }> = [];
  for (let y = minYear; y <= maxYear; y++) {
    let c = 0;
    for (const r of rows) if (r.startYear <= y && y <= r.endYear) c++;
    out.push({ year: y, count: c });
  }
  return out;
}

/**
 * Zaman ekseni için "güzel" ondalık aralık adımı seçer (10/20/25/50/100…),
 * verilen yıl açıklığında yaklaşık `target` kadar işaret olacak biçimde.
 */
export function axisStep(span: number, target = 8): number {
  const raw = Math.max(1, span / target);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}

/** [minYear, maxYear] içindeki eksen işareti yılları (adıma hizalı). */
export function axisTicks(minYear: number, maxYear: number, step: number): number[] {
  const first = Math.ceil(minYear / step) * step;
  const out: number[] = [];
  for (let y = first; y <= maxYear; y += step) out.push(y);
  return out;
}
