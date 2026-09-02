import type { Person } from "@/types/family";

/**
 * Anma günleri takvimi — SAF, bağımlılıksız.
 *
 * Türkiye'de 40+ kişilik her ailede neredeyse her ay bir anma vardır: yedisi,
 * kırkı, elli ikisi, sene-i devriye. Bu, ailenin zaten var olan ritmidir ve
 * şu an hiçbir yazılım onu bilmiyor.
 *
 * ## Betimleyici, buyurgan değil
 *
 * Anma pratiği yöreye, mezhebe ve haneye göre değişir. Bu dosya bir uygulama
 * DAYATMAZ: hangi anmaların tutulacağı ve gün sayılarının kaç olduğu
 * `MemorialConfig` ile ailenin elindedir. `DEFAULT_OBSERVANCES` yaygın bir
 * varsayılandır — bir hüküm değil.
 *
 * ## Neden tam tarih şart?
 *
 * "Kırkıncı gece" gün aritmetiğidir; ölüm tarihi yalnız yıl ya da yıl-ay ise
 * hesaplanamaz. Böyle kayıtlarda anma üretilmez — yaklaşık bir tarih uydurup
 * aileyi yanlış güne çağırmaktansa susmak doğrudur.
 *
 * ## Hicri takvim dışarıdan gelir
 *
 * `lib/hijri.ts` çalışma zamanı bağımlılığı olurdu ve bu dosyayı birim testi
 * koşulamaz hâle getirirdi (bkz. `CLAUDE.md`). Hicri sene-i devriye isteyen
 * çağıran, `hijriAnniversaries` ile `lib/hijri.ts`'in fonksiyonunu geçirir.
 */

export type NightKind = "gece3" | "gece7" | "gece40" | "gece52";
export type ObservanceKind = NightKind | "seneiDevriye" | "seneiDevriyeHicri";

/** Ölümden sonra kaçıncı gün. Yöreye göre değişir → `MemorialConfig` ile ezilir. */
export const DEFAULT_OFFSETS: Readonly<Record<NightKind, number>> = {
  gece3: 3,
  gece7: 7,
  gece40: 40,
  gece52: 52,
};

/**
 * Yaygın varsayılan. `gece3` ve Hicri sene-i devriye **isteğe bağlıdır**:
 * her hanede tutulmaz, açılması ailenin tercihidir.
 */
export const DEFAULT_OBSERVANCES: readonly ObservanceKind[] = [
  "gece7", "gece40", "gece52", "seneiDevriye",
];

export interface MemorialConfig {
  /** Tutulacak anmalar. Verilmezse `DEFAULT_OBSERVANCES`. */
  enabled?: readonly ObservanceKind[];
  /** Gün sayısı değişiklikleri. Verilmeyenler `DEFAULT_OFFSETS`. */
  offsets?: Partial<Record<NightKind, number>>;
  /**
   * Hicri sene-i devriye için `lib/hijri.ts` →
   * `hijriAnniversariesInGregorianYear`. Verilmezse o anma üretilmez.
   */
  hijriAnniversaries?: (stored: string, gregorianYear: number) => string[];
}

export interface Observance {
  kind: ObservanceKind;
  personId: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** Kaçıncı sene-i devriye. Yalnız yıl dönümlerinde dolu. */
  year?: number;
}

const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(stored?: string): { y: number; m: number; d: number } | null {
  const m = stored ? FULL_DATE.exec(stored) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Gerçekten var olan bir gün mü? (31 Şubat elenir.)
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m: mo, d };
}

function iso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(p: { y: number; m: number; d: number }, days: number): string {
  // UTC ile: yaz saati geçişleri gün kaydırmasın.
  return iso(new Date(Date.UTC(p.y, p.m - 1, p.d + days)));
}

/** 29 Şubat'ta ölen biri için artık olmayan yıllarda 28 Şubat'a kırpılır. */
function sameDayInYear(p: { m: number; d: number }, year: number): string {
  const probe = new Date(Date.UTC(year, p.m - 1, p.d));
  if (probe.getUTCMonth() !== p.m - 1) {
    return iso(new Date(Date.UTC(year, p.m - 1 + 1, 0))); // ayın son günü
  }
  return iso(probe);
}

export interface Window {
  /** "YYYY-MM-DD" (dâhil). */
  from: string;
  /** "YYYY-MM-DD" (dâhil). */
  to: string;
}

/** Bir kişinin verilen pencereye düşen anma günleri. */
export function observancesFor(
  person: Person,
  window: Window,
  config: MemorialConfig = {}
): Observance[] {
  const death = parse(person.deathDate);
  if (!death) return [];

  const from = parse(window.from);
  const to = parse(window.to);
  if (!from || !to || window.from > window.to) return [];

  const enabled = new Set(config.enabled ?? DEFAULT_OBSERVANCES);
  const offsets = { ...DEFAULT_OFFSETS, ...config.offsets };
  const out: Observance[] = [];
  const inWindow = (d: string) => d >= window.from && d <= window.to;

  // Geceler: ölümden sonra sabit gün sayısı, bir kez.
  for (const kind of ["gece3", "gece7", "gece40", "gece52"] as NightKind[]) {
    if (!enabled.has(kind)) continue;
    const date = addDays(death, offsets[kind]);
    if (inWindow(date)) out.push({ kind, personId: person.id, date });
  }

  // Sene-i devriye: her yıl tekrar eder.
  for (let year = from.y; year <= to.y; year++) {
    const n = year - death.y;
    if (n < 1) continue; // ölüm yılı sene-i devriye değildir

    if (enabled.has("seneiDevriye")) {
      const date = sameDayInYear(death, year);
      if (inWindow(date)) out.push({ kind: "seneiDevriye", personId: person.id, date, year: n });
    }

    if (enabled.has("seneiDevriyeHicri") && config.hijriAnniversaries) {
      for (const date of config.hijriAnniversaries(person.deathDate!, year)) {
        if (inWindow(date)) {
          out.push({ kind: "seneiDevriyeHicri", personId: person.id, date, year: n });
        }
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

/** Tüm ağaç için pencereye düşen anma günleri, tarihe göre sıralı. */
export function memorialCalendar(
  people: Person[],
  window: Window,
  config: MemorialConfig = {}
): Observance[] {
  const out: Observance[] = [];
  for (const p of people) out.push(...observancesFor(p, window, config));
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.personId.localeCompare(b.personId) ||
      a.kind.localeCompare(b.kind)
  );
}

/** Bugünden itibaren `days` gün içindeki anmalar (cron ve "yaklaşan olaylar" için). */
export function upcomingMemorials(
  people: Person[],
  opts: { today: Date; days: number },
  config: MemorialConfig = {}
): Observance[] {
  const t = opts.today;
  const from = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())));
  const to = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + opts.days)));
  return memorialCalendar(people, { from, to }, config);
}

/** i18n anahtarı — `useT()` ile çözülür. */
export function observanceKey(kind: ObservanceKind): string {
  return `memorial.${kind}`;
}
