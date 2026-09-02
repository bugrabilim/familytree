import type { Obituary } from "@/types/obituary";

/**
 * Taziye duyurusu — saf mantık.
 *
 * Burada kasten YAPILMAYAN şeyler var ve sebepleri önemli:
 *
 * · Hiçbir alan TÜRETİLMEZ. "Cenaze muhtemelen ertesi gün öğle namazında"
 *   gibi bir tahmin, gerçek bir aileyi yanlış camiye gönderir. Ne yazıldıysa
 *   o gösterilir.
 * · Dinî bir kalıp DAYATILMAZ. Bu ağaçlarda farklı inançlardan ve inançsız
 *   aileler var; "ruhuna Fatiha" gibi bir metni uygulama yazmaz, aile yazar.
 * · Bir duyuru kendiliğinden YAYIMLANMAZ. `publicShare` varsayılan kapalıdır.
 */

export const MAX_MESSAGE = 4000;
export const MAX_FIELD = 500;
export const MAX_OBITUARIES = 500;

const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/** "YYYY-MM-DD" geçerli mi? Boş da geçerlidir (tarih zorunlu değil). */
export function isValidDate(stored: string | undefined): boolean {
  if (!stored) return true;
  const m = FULL_DATE.exec(stored);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

/**
 * Herkese açık yüzeyde gösterilecekler.
 *
 * `publicShare` AÇIKÇA true olmayan hiçbir duyuru dışarı çıkmaz. Varsayılanın
 * kapalı olması bilinçli: ölüm haberi, ailenin paylaşmayı seçmediği sürece
 * dışarı çıkmamalı. Belirsizlik (alan yok / bozuk değer) kapalı sayılır.
 */
export function publicObituaries(list: readonly Obituary[]): Obituary[] {
  return list.filter((o) => o.publicShare === true);
}

/** En yeni vefat başta; tarihsizler sonda (kayıt sırası korunur). */
export function sortObituaries(list: readonly Obituary[]): Obituary[] {
  return [...list].sort((a, b) => {
    const da = a.diedOn ?? "";
    const db = b.diedOn ?? "";
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.localeCompare(da);
  });
}

/** Bir kişinin duyurusu (varsa). */
export function forPerson(list: readonly Obituary[], personId: string): Obituary | undefined {
  return list.find((o) => o.personId === personId);
}

export function normalizeObituary(
  input: Partial<Obituary>,
  now: string,
  existing?: Obituary
): Obituary | null {
  const personId = (input.personId ?? existing?.personId ?? "").trim();
  const personName = (input.personName ?? existing?.personName ?? "").trim().slice(0, MAX_FIELD);
  if (!personId) return null;

  const diedOn = input.diedOn === undefined ? existing?.diedOn : input.diedOn.trim() || undefined;
  const serviceOn = input.serviceOn === undefined ? existing?.serviceOn : input.serviceOn.trim() || undefined;
  if (!isValidDate(diedOn) || !isValidDate(serviceOn)) return null;

  const str = (v: unknown, prev: string | undefined, max = MAX_FIELD) =>
    v === undefined ? prev : String(v).trim().slice(0, max) || undefined;

  return {
    id: existing?.id ?? "",
    personId,
    personName,
    diedOn,
    serviceAt: str(input.serviceAt, existing?.serviceAt),
    serviceOn,
    burialAt: str(input.burialAt, existing?.burialAt),
    condolenceAt: str(input.condolenceAt, existing?.condolenceAt),
    message: str(input.message, existing?.message, MAX_MESSAGE),
    // Yalnız AÇIKÇA true ise açık. "1", "evet", "on" gibi değerler kaza
    // eseri yayımlamasın diye katı karşılaştırma.
    publicShare:
      input.publicShare === undefined ? existing?.publicShare === true : input.publicShare === true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
