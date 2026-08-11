/**
 * Tarih yardımcıları.
 *
 * Depolama formatı  : "YYYY-MM-DD" | "YYYY-MM" | "YYYY"
 * Görüntüleme formatı: "GG.AA.YYYY" | "AA.YYYY" | "YYYY"
 */

const AYLAR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** "1985-04-23" → "23.04.1985" ・ "1985" → "1985" */
export function storedToDisplay(stored?: string): string {
  if (!stored) return "";
  const [y, m, d] = stored.split("-");
  if (d) return `${d}.${m}.${y}`;
  if (m) return `${m}.${y}`;
  return y ?? "";
}

/** "23.04.1985" → "1985-04-23" ・ "1985" → "1985" */
export function displayToStored(display: string): string {
  const s = display.trim();
  if (!s) return "";
  if (/^\d{4}$/.test(s)) return s;
  const parts = s.split(".").map((p) => p.trim());
  if (parts.length === 2) {
    const [m, y] = parts;
    return `${y}-${m.padStart(2, "0")}`;
  }
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

/** Kullanıcının yazdığı GG.AA.YYYY / AA.YYYY / YYYY geçerli mi? */
export function isValidDateInput(display: string): boolean {
  const s = display.trim();
  if (!s) return true; // boş = opsiyonel

  const year = (y: number) => y >= 1 && y <= new Date().getFullYear() + 1;

  if (/^\d{4}$/.test(s)) return year(Number(s));

  const parts = s.split(".");
  if (parts.length === 2) {
    const [m, y] = parts.map(Number);
    return !!m && m >= 1 && m <= 12 && year(y) && parts[1].length === 4;
  }
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    if (!year(y) || parts[2].length !== 4) return false;
    if (!m || m < 1 || m > 12) return false;
    if (!d || d < 1) return false;
    // Gerçek ay uzunluğu (artık yıl dahil)
    const gunSayisi = new Date(y, m, 0).getDate();
    return d <= gunSayisi;
  }
  return false;
}

/** Depolanan tarihten Date üret (eksik parçalar 1'e tamamlanır). */
function toDate(stored?: string): Date | null {
  if (!stored) return null;
  const [y, m, d] = stored.split("-").map(Number);
  if (!y || Number.isNaN(y)) return null;
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Doğum (ve varsa ölüm) tarihinden yaş. */
export function calcAge(birth?: string, death?: string): number | null {
  const b = toDate(birth);
  if (!b) return null;
  const end = toDate(death) ?? new Date();
  let age = end.getFullYear() - b.getFullYear();
  const m = end.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** "23 Nisan 1985" gibi uzun okunabilir biçim. */
export function formatLong(stored?: string): string {
  if (!stored) return "";
  const [y, m, d] = stored.split("-");
  if (d) return `${Number(d)} ${AYLAR[Number(m) - 1]} ${y}`;
  if (m) return `${AYLAR[Number(m) - 1]} ${y}`;
  return y;
}

/** Yıl aralığı: "1920 – 1998" ・ "1985" */
export function lifeSpan(birth?: string, death?: string): string {
  const b = birth?.slice(0, 4);
  const d = death?.slice(0, 4);
  if (b && d) return `${b} – ${d}`;
  if (b) return b;
  if (d) return `? – ${d}`;
  return "";
}

/**
 * Bugünden itibaren kaç gün sonra doğum günü?
 * Ay/gün bilgisi yoksa null.
 */
export function daysUntilBirthday(birth?: string): number | null {
  if (!birth) return null;
  const parts = birth.split("-");
  if (parts.length < 3) return null;
  const [, m, d] = parts.map(Number);
  if (!m || !d) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

/**
 * Bugünden itibaren kaç gün sonra bir tarihin ay/gün yıldönümü?
 * "YYYY-MM-DD" ya da "YYYY-MM" kabul eder; gün yoksa ayın 1'i varsayılır.
 * Ay bilgisi yoksa (yalnızca "YYYY") null.
 *
 * `daysUntilBirthday` ile aynı anlamı taşır (bugün = 0) ve hem evlilik
 * yıldönümleri hem de anma günleri için yeniden kullanılır.
 */
export function daysUntilAnniversary(stored?: string): number | null {
  if (!stored) return null;
  const parts = stored.split("-");
  if (parts.length < 2) return null;
  const [, m, d] = parts.map(Number);
  if (!m) return null;
  const day = d || 1;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(today.getFullYear(), m - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, day);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

/** "12 gün sonra" / "Bugün!" / "Yarın" */
export function humanizeDays(days: number): string {
  if (days === 0) return "Bugün";
  if (days === 1) return "Yarın";
  return `${days} gün sonra`;
}

export { AYLAR };
