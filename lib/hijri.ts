/**
 * Hicri (Kamerî) ↔ Miladi takvim dönüşümü — SAF, bağımlılıksız.
 *
 * Anma günleri için gerekli: sene-i devriye ailelerin çoğunda Hicri takvime
 * göre anılır (mevlit, kandil, Ramazan/Kurban bayramı mezar ziyareti), oysa
 * kayıtlarımızdaki tarihler Miladi. İkisini birbirine çevirebilmemiz gerekiyor.
 *
 * ## Hangi takvim?
 *
 * **Tablosal (aritmetik) Hicri takvim** kullanılır — 30 yıllık çevrimde 11 artık
 * yıl, ay uzunlukları 30/29 dönüşümlü. Gözleme (rüyet) değil hesaba dayanır.
 *
 * Bu bilinçli bir tercih: gözleme dayalı takvim ülkeye, mezhebe ve o geceki
 * hava durumuna göre değişir; deterministik olmayan bir takvimle ne test
 * yazılabilir ne de "gelecek yılın anma günü" hesaplanabilir.
 *
 * **UYARI — ±1 gün:** Tablosal tarih, Suudi Umm al-Qura veya Diyanet ilanından
 * bir gün önce ya da sonra düşebilir. Örnek: 1 Muharrem 1446 tablosal olarak
 * 8 Temmuz 2024, Umm al-Qura'ya göre 7 Temmuz 2024. Arayüz bu tarihleri
 * "yaklaşık" olarak sunmalı; resmî ilan yerine geçmez.
 *
 * Doğrulama çıpası: 1 Muharrem 1445 = 19 Temmuz 2023 (tablosal ve ilan aynı).
 */

export interface HijriDate {
  year: number;
  /** 1–12 (1 = Muharrem) */
  month: number;
  /** 1–30 */
  day: number;
}

/** 1 Muharrem 1 AH = 16 Temmuz 622 (Jülyen) = Jülyen Gün Sayısı 1948440. */
const HIJRI_EPOCH_JDN = 1948439;

export const HIJRI_MONTHS_TR = [
  "Muharrem", "Safer", "Rebiülevvel", "Rebiülahir",
  "Cemaziyelevvel", "Cemaziyelahir", "Recep", "Şaban",
  "Ramazan", "Şevval", "Zilkade", "Zilhicce",
] as const;

export const HIJRI_MONTHS_EN = [
  "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani",
  "Jumada al-Awwal", "Jumada al-Thani", "Rajab", "Sha'ban",
  "Ramadan", "Shawwal", "Dhu al-Qadah", "Dhu al-Hijjah",
] as const;

/* ---------------------------------------------------------------- Jülyen */

/** Miladi (proleptik Gregoryen) → Jülyen Gün Sayısı. */
export function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** Jülyen Gün Sayısı → Miladi. */
export function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    year: 100 * b + d - 4800 + Math.floor(m / 10),
    month: m + 3 - 12 * Math.floor(m / 10),
    day: e - Math.floor((153 * m + 2) / 5) + 1,
  };
}

/* ------------------------------------------------------------------ Hicri */

/** Hicri → Jülyen Gün Sayısı. */
export function hijriToJdn(year: number, month: number, day: number): number {
  return (
    day +
    Math.ceil(29.5 * (month - 1)) +
    (year - 1) * 354 +
    Math.floor((3 + 11 * year) / 30) +
    HIJRI_EPOCH_JDN
  );
}

/** Jülyen Gün Sayısı → Hicri. */
export function jdnToHijri(jdn: number): HijriDate {
  const year = Math.floor((30 * (jdn - HIJRI_EPOCH_JDN - 1) + 10646) / 10631);
  const month = Math.min(
    12,
    Math.ceil((jdn - (29 + hijriToJdn(year, 1, 1))) / 29.5) + 1
  );
  const day = jdn - hijriToJdn(year, month, 1) + 1;
  return { year, month, day };
}

/**
 * Hicri artık yıl mı? (30 yıllık çevrimde 11 artık yıl.)
 * Artık yılda Zilhicce 30 gün çeker, normalde 29.
 */
export function isHijriLeapYear(year: number): boolean {
  // `hijriToJdn` içindeki floor((3 + 11y)/30), y'den ÖNCE geçen artık günleri
  // sayar. Dolayısıyla y artık yıldır ⟺ bu sayaç y'den y+1'e geçerken artar.
  // (Sayacı y-1 ile karşılaştırmak bir yıl kaydırır — testler yakaladı.)
  return Math.floor((14 + 11 * year) / 30) > Math.floor((3 + 11 * year) / 30);
}

/** Bir Hicri ayın gün sayısı (29 veya 30). */
export function hijriMonthLength(year: number, month: number): number {
  if (month === 12) return isHijriLeapYear(year) ? 30 : 29;
  return month % 2 === 1 ? 30 : 29;
}

/** Bir Hicri yılın gün sayısı (354 veya 355). */
export function hijriYearLength(year: number): number {
  return isHijriLeapYear(year) ? 355 : 354;
}

/* --------------------------------------------------- Depolama biçimi köprüsü */

/**
 * Bir Miladi ayın gün sayısı — `Date` KULLANILMADAN.
 *
 * `Date` ile doğrulama iki tuzak taşıyor: (1) `Date.UTC` yıl 0–99'u 1900+y'ye
 * kaydırır, (2) var olmayan bir gün sessizce sonraki aya taşar (31 Şubat →
 * 3 Mart). Aritmetik denetim ikisinden de bağımsızdır.
 */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Depolanan tarihten ("YYYY-MM-DD") Hicri karşılığı.
 *
 * Kısmi tarihlerde (`"YYYY"`, `"YYYY-MM"`) **null** döner: Hicri yıl, Miladi
 * yılın ortasında değişir; gün bilinmeden Hicri yıl tek anlamlı değildir.
 */
export function toHijri(stored?: string): HijriDate | null {
  const m = stored ? FULL_DATE.exec(stored) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return null;
  // Var olmayan gün SESSİZCE kaydırılmamalı: "2023-02-30" eskiden 2 Mart'ın
  // hicri karşılığını döndürüyordu ve çağıran bunu fark edemiyordu.
  if (d > daysInMonth(y, mo)) return null;
  return jdnToHijri(gregorianToJdn(y, mo, d));
}

/** Hicri tarihten depolama biçimine ("YYYY-MM-DD"). */
export function fromHijri(h: HijriDate): string {
  const g = jdnToGregorian(hijriToJdn(h.year, h.month, h.day));
  return `${g.year}-${pad(g.month)}-${pad(g.day)}`;
}

/** Hicri ay adı. */
export function hijriMonthName(month: number, lang: "tr" | "en" = "tr"): string {
  const names = lang === "en" ? HIJRI_MONTHS_EN : HIJRI_MONTHS_TR;
  return names[month - 1] ?? "";
}

/** "12 Recep 1445" · "12 Rajab 1445 AH" */
export function formatHijri(h: HijriDate, lang: "tr" | "en" = "tr"): string {
  const name = hijriMonthName(h.month, lang);
  return lang === "en"
    ? `${h.day} ${name} ${h.year} AH`
    : `${h.day} ${name} ${h.year}`;
}

/* ------------------------------------------------------------ Yıl dönümü */

/**
 * Bir Miladi tarihin **Hicri** yıl dönümlerinin, verilen Miladi yıl içinde
 * hangi Miladi günlere düştüğü.
 *
 * Dizi döner, çünkü Hicri yıl ~354 gün: bir Hicri yıl dönümü tek bir Miladi
 * yıl içine **iki kez** düşebilir (ör. Ocak başı ve Aralık sonu). Anma
 * takviminin bunu kaçırmaması gerekiyor.
 *
 * Kaynak gün 30 ise ve hedef yılda o ay 29 çekiyorsa 29'a kırpılır — 29 Şubat
 * doğumlularda yapılanın aynısı.
 */
export function hijriAnniversariesInGregorianYear(
  stored: string | undefined,
  gregorianYear: number
): string[] {
  const h = toHijri(stored);
  if (!h) return [];

  const first = jdnToHijri(gregorianToJdn(gregorianYear, 1, 1)).year;
  const last = jdnToHijri(gregorianToJdn(gregorianYear, 12, 31)).year;

  const out: string[] = [];
  for (let hy = first; hy <= last; hy++) {
    const day = Math.min(h.day, hijriMonthLength(hy, h.month));
    const g = jdnToGregorian(hijriToJdn(hy, h.month, day));
    if (g.year === gregorianYear) out.push(`${g.year}-${pad(g.month)}-${pad(g.day)}`);
  }
  return out;
}

/**
 * Kaç Hicri yıl geçti? (Sene-i devriye sayısı.)
 * Tarihlerden biri kısmi/geçersizse null.
 */
export function hijriYearsBetween(from?: string, to?: string): number | null {
  const a = toHijri(from);
  const b = toHijri(to);
  if (!a || !b) return null;
  let years = b.year - a.year;
  if (b.month < a.month || (b.month === a.month && b.day < a.day)) years -= 1;
  return years;
}
