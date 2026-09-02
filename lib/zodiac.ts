/**
 * Burç (güneş burcu) — SAF, bağımlılıksız.
 *
 * ## Dürüstlük notu: sınır günleri kaymaz değildir
 *
 * Burç geçişi bir takvim günü değil, Güneş'in burca girdiği ASTRONOMİK ANdır;
 * yıldan yıla ~1 gün oynar. Sabit bir tablo, geçiş gününde doğan biri için
 * yanlış burç verebilir.
 *
 * Bu yüzden tabloya körü körüne güvenmiyoruz: sınıra 1 gün ya da daha yakın
 * doğumlarda `cusp: true` ve `alternative` döndürülür, arayüz de "sınırda —
 * doğum saatine göre değişebilir" diyebilir. Kesin sonuç doğum saati ve
 * efemeris ister (bkz. yükselen, yapım sırası 66).
 *
 * Kısmi tarihlerde (`"YYYY"`, `"YYYY-MM"`) null döner: gün bilinmeden burç
 * hesaplanamaz.
 */

export type ZodiacSign =
  | "koc" | "boga" | "ikizler" | "yengec" | "aslan" | "basak"
  | "terazi" | "akrep" | "yay" | "oglak" | "kova" | "balik";

export type ZodiacElement = "ates" | "toprak" | "hava" | "su";

/** Burçlar, Koç'tan başlayarak. */
export const ZODIAC_ORDER: readonly ZodiacSign[] = [
  "koc", "boga", "ikizler", "yengec", "aslan", "basak",
  "terazi", "akrep", "yay", "oglak", "kova", "balik",
] as const;

/** Her burcun BAŞLANGIÇ tarihi (ay, gün) — tipik değerler, ±1 gün oynar. */
const STARTS: ReadonlyArray<{ sign: ZodiacSign; month: number; day: number }> = [
  { sign: "oglak", month: 12, day: 22 },
  { sign: "kova", month: 1, day: 20 },
  { sign: "balik", month: 2, day: 19 },
  { sign: "koc", month: 3, day: 21 },
  { sign: "boga", month: 4, day: 20 },
  { sign: "ikizler", month: 5, day: 21 },
  { sign: "yengec", month: 6, day: 21 },
  { sign: "aslan", month: 7, day: 23 },
  { sign: "basak", month: 8, day: 23 },
  { sign: "terazi", month: 9, day: 23 },
  { sign: "akrep", month: 10, day: 23 },
  { sign: "yay", month: 11, day: 22 },
];

const ELEMENTS: Readonly<Record<ZodiacSign, ZodiacElement>> = {
  koc: "ates", aslan: "ates", yay: "ates",
  boga: "toprak", basak: "toprak", oglak: "toprak",
  ikizler: "hava", terazi: "hava", kova: "hava",
  yengec: "su", akrep: "su", balik: "su",
};

export function elementOf(sign: ZodiacSign): ZodiacElement {
  return ELEMENTS[sign];
}

/** i18n anahtarları — `useT()` ile çözülür. */
export function zodiacKey(sign: ZodiacSign): string {
  return `zodiac.${sign}`;
}
export function elementKey(element: ZodiacElement): string {
  return `zodiacElement.${element}`;
}

export interface ZodiacResult {
  sign: ZodiacSign;
  element: ZodiacElement;
  /** Geçiş gününe 1 gün ya da daha yakın: yıla ve saate göre değişebilir. */
  cusp: boolean;
  /** Sınırdaysa diğer olasılık; değilse null. */
  alternative: ZodiacSign | null;
}

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

/**
 * Karşılaştırma için sabit yıla (2001, artık değil) oturtulmuş gün numarası.
 *
 * Sabit yıl güvenli, çünkü hiçbir burç sınırı 29 Şubat'a düşmüyor: 29 Şubat
 * bu ölçekte 1 Mart'ın yerine oturur ve ikisi de Balık'tır. Ama GEÇERLİLİK
 * denetimi sabit yılla YAPILAMAZ — 2001 artık olmadığından 29 Şubat elenirdi
 * (test yakaladı). Doğrulama gerçek yılla yapılır.
 */
function ordinal(month: number, day: number): number {
  return Math.floor(Date.UTC(2001, month - 1, day) / 86400000);
}

function signOf(month: number, day: number): ZodiacSign {
  const t = ordinal(month, day);
  let found: ZodiacSign = "oglak"; // 1 Ocak → Oğlak (önceki yıldan devam)
  for (const s of STARTS) {
    if (s.month === 12) continue; // Oğlak'ın başı yılın sonunda
    if (t >= ordinal(s.month, s.day)) found = s.sign;
  }
  const capricorn = STARTS.find((s) => s.sign === "oglak")!;
  if (t >= ordinal(capricorn.month, capricorn.day)) found = "oglak";
  return found;
}

/**
 * Depolanan tarihten burç. Kısmi/geçersiz tarihte null.
 */
export function zodiacSign(stored?: string): ZodiacResult | null {
  const m = stored ? FULL_DATE.exec(stored) : null;
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  // Aritmetik denetim: 29 Şubat yalnız artık yılda geçerli, ve `Date`'in
  // yıl 0–99 kaydırması devreye girmiyor (0000-02-29 geçerli bir gündür).
  if (day > daysInMonth(year, month)) return null;

  const sign = signOf(month, day);

  // Komşu günlerde burç değişiyorsa sınırdayız.
  const dayMs = 86400000;
  const base = Date.UTC(2001, month - 1, day);
  const prev = new Date(base - dayMs);
  const next = new Date(base + dayMs);
  const prevSign = signOf(prev.getUTCMonth() + 1, prev.getUTCDate());
  const nextSign = signOf(next.getUTCMonth() + 1, next.getUTCDate());

  let alternative: ZodiacSign | null = null;
  if (prevSign !== sign) alternative = prevSign;
  else if (nextSign !== sign) alternative = nextSign;

  return { sign, element: ELEMENTS[sign], cusp: alternative !== null, alternative };
}
