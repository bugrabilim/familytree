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
  /**
   * Kaçıncı Hicri devriye olduğunu söyleyen fonksiyon — `lib/hijri.ts` →
   * `hijriYearsBetween`. Verilmezse anma yine üretilir ama `year` BOŞ kalır:
   * yanlış bir sayı basmaktansa hiç basmamak doğru (Miladi fark Hicri devriye
   * sayısı değildir; aradaki sapma yıllar geçtikçe büyür).
   */
  hijriYearsBetween?: (from: string, to: string) => number | null;
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

/**
 * Bir Miladi ayın gün sayısı — `Date` KULLANILMADAN.
 *
 * `Date` ile doğrulama iki tuzak taşıyor: (1) `Date.UTC` yıl 0–99'u 1900+y'ye
 * kaydırır, (2) var olmayan bir gün sessizce sonraki aya taşar. Aritmetik
 * denetim ikisinden de bağımsızdır.
 */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/**
 * `Date.UTC` yıl 0–99'u 1900+y olarak kurar; `setUTCFullYear` ile geri alınır.
 * Gün aritmetiği (`+40 gün`) için `Date` gerekiyor, bu yüzden burada `Date`
 * kullanılıyor ama kaydırması etkisizleştiriliyor.
 */
function utcDate(y: number, m: number, d: number): Date {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y >= 0 && y <= 99) dt.setUTCFullYear(y);
  return dt;
}

function parse(stored?: string): { y: number; m: number; d: number } | null {
  const m = stored ? FULL_DATE.exec(stored) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return null;
  if (d > daysInMonth(y, mo)) return null; // 31 Şubat elenir
  return { y, m: mo, d };
}

function iso(date: Date): string {
  // Yıl DÖRT haneye tamamlanır: aksi hâlde "150-03-10" gibi bozuk bir dize
  // dışarı çıkar ve pencere karşılaştırması (sözlüksel) sessizce kırılır.
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(p: { y: number; m: number; d: number }, days: number): string {
  // UTC ile: yaz saati geçişleri gün kaydırmasın.
  return iso(utcDate(p.y, p.m, p.d + days));
}

/** 29 Şubat'ta ölen biri için artık olmayan yıllarda 28 Şubat'a kırpılır. */
function sameDayInYear(p: { m: number; d: number }, year: number): string {
  const day = Math.min(p.d, daysInMonth(year, p.m));
  return iso(utcDate(year, p.m, day));
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

  // Miladi sene-i devriye: yılda tam bir kez, ölüm yılından sonra.
  if (enabled.has("seneiDevriye")) {
    for (let year = from.y; year <= to.y; year++) {
      const n = year - death.y;
      if (n < 1) continue; // ölüm yılı sene-i devriye değildir
      const date = sameDayInYear(death, year);
      if (inWindow(date)) out.push({ kind: "seneiDevriye", personId: person.id, date, year: n });
    }
  }

  /*
   * Hicri sene-i devriye AYRI bir döngü, çünkü Miladi yıl sayacıyla
   * yürütülemez:
   *
   *  - Hicri yıl ~354 gün olduğundan devriye, ölümün KENDİ Miladi yılı içinde
   *    ikinci kez düşebilir. Miladi farkı 1'den küçük diye atlamak o ilk
   *    devriyeyi tümüyle kaybediyordu.
   *  - Aynı sebeple bir Miladi yıla İKİ devriye düşebilir; Miladi farkı
   *    kullanmak ikisine de aynı numarayı verirdi.
   *  - Miladi fark zaten Hicri devriye sayısı değildir ve sapma yıllar
   *    geçtikçe büyür (32 Miladi yıl ≈ 33 Hicri yıl).
   *
   * Sayı, enjekte edilen `hijriYearsBetween` ile gerçek Hicri farktan
   * hesaplanır; o verilmezse `year` boş bırakılır.
   */
  if (enabled.has("seneiDevriyeHicri") && config.hijriAnniversaries) {
    const deathDate = person.deathDate!;
    for (let year = from.y; year <= to.y; year++) {
      for (const date of config.hijriAnniversaries(deathDate, year)) {
        // Ölüm gününün kendisi devriye değildir (0. yıl).
        if (date <= deathDate) continue;
        if (!inWindow(date)) continue;
        const n = config.hijriYearsBetween?.(deathDate, date) ?? null;
        out.push({
          kind: "seneiDevriyeHicri",
          personId: person.id,
          date,
          ...(n !== null && n >= 1 ? { year: n } : {}),
        });
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
