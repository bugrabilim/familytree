import type { Letter } from "@/types/letter";

/**
 * Zaman kilitli mektup — saf mantık.
 *
 * Buradaki tek gerçek kural şu: `isUnlocked` ve `publicView`. Kilidin nerede
 * uygulandığı önemlidir — API yanıtında, çizim anında DEĞİL. Bu dosya o kararı
 * tek yerde tutar ki hem rota hem görünüm aynı kuralı kullansın ve kural
 * birim testi edilebilsin.
 */

export const MAX_TITLE = 200;
export const MAX_BODY = 20000;
export const MAX_LETTERS = 200;

const FULL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Bir Miladi ayın gün sayısı — `Date` kullanmadan (0–99 yıl kayması yok). */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/** "YYYY-MM-DD" geçerli mi? 31 Şubat gibi tarihler elenir. */
export function isValidOpensOn(stored: string): boolean {
  const m = FULL_DATE.exec(stored);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

/** Bugünün "YYYY-MM-DD" karşılığı (UTC). */
export function today(now: Date = new Date()): string {
  const y = String(now.getUTCFullYear()).padStart(4, "0");
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Kilit açıldı mı?
 *
 * Karşılaştırma "YYYY-MM-DD" dizeleri üzerinde sözlükseldir — bu biçimde
 * sözlük sırası tarih sırasıyla aynıdır ve saat dilimi sorunu doğurmaz.
 * `Date` ile karşılaştırmak, sunucunun saat dilimine göre mektubu bir gün
 * erken açabilirdi.
 *
 * Açılma günü DÂHİLDİR: "1 Ocak'ta açılsın" denen mektup 1 Ocak'ta açılır.
 *
 * Geçersiz bir tarih KİLİTLİ sayılır. Bozuk veride açık tarafa düşmek, tam da
 * gizli kalması gereken şeyi sızdırmak olurdu.
 */
export function isUnlocked(letter: Pick<Letter, "opensOn">, now: Date = new Date()): boolean {
  if (!isValidOpensOn(letter.opensOn)) return false;
  return letter.opensOn <= today(now);
}

/**
 * Dışarı verilebilir görünüm.
 *
 * Kilitliyse `body` alanı SİLİNİR — boşaltılmaz, silinir. Boş dize göndermek
 * "mektup boş" demek olurdu; alanın yokluğu "henüz veremem" demektir. Ve asıl
 * mesele: kilitli metin sunucudan HİÇ çıkmaz, istemcinin gizlemesine
 * bırakılmaz.
 */
export function publicView(letter: Letter, now: Date = new Date()): Letter {
  if (isUnlocked(letter, now)) return letter;
  const { body: _body, ...rest } = letter;
  void _body;
  return rest;
}

/** Liste için: her mektubu kilit durumuna göre süz. */
export function publicViewAll(letters: readonly Letter[], now: Date = new Date()): Letter[] {
  return letters.map((l) => publicView(l, now));
}

/** Açılmasına kaç gün kaldı; açıldıysa 0, tarih bozuksa null. */
export function daysUntilOpen(letter: Pick<Letter, "opensOn">, now: Date = new Date()): number | null {
  if (!isValidOpensOn(letter.opensOn)) return null;
  if (isUnlocked(letter, now)) return 0;
  const [y, m, d] = letter.opensOn.split("-").map(Number);
  const hedef = Date.UTC(y, m - 1, d);
  const bugun = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((hedef - bugun) / 86400000);
}

/** Açılma tarihine göre sıralı: önce açık olanlar (en yeni), sonra bekleyenler. */
export function sortLetters(letters: readonly Letter[], now: Date = new Date()): Letter[] {
  return [...letters].sort((a, b) => {
    const ua = isUnlocked(a, now);
    const ub = isUnlocked(b, now);
    if (ua !== ub) return ua ? -1 : 1;
    // Açıklar: en son açılan başta. Kilitliler: en yakın açılacak başta.
    return ua ? b.opensOn.localeCompare(a.opensOn) : a.opensOn.localeCompare(b.opensOn);
  });
}

export function normalizeLetter(
  input: Partial<Letter>,
  now: string,
  existing?: Letter
): Letter | null {
  const title = (input.title ?? existing?.title ?? "").trim().slice(0, MAX_TITLE);
  const opensOn = (input.opensOn ?? existing?.opensOn ?? "").trim();
  if (!title || !isValidOpensOn(opensOn)) return null;

  const str = (v: unknown, prev: string | undefined, max = 500) =>
    v === undefined ? prev : String(v).trim().slice(0, max) || undefined;

  return {
    id: existing?.id ?? "",
    title,
    fromPersonId: str(input.fromPersonId, existing?.fromPersonId),
    fromName: str(input.fromName, existing?.fromName),
    toPersonId: str(input.toPersonId, existing?.toPersonId),
    toName: str(input.toName, existing?.toName),
    opensOn,
    body: str(input.body, existing?.body, MAX_BODY),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
