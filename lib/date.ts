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

/**
 * Serbest kullanıcı girişini GG.AA.YYYY / AA.YYYY / YYYY biçimine esnetir:
 *  - Ayraç olarak `.` `/` `-` boşluk kabul eder → `.`
 *  - Yalnız rakam: 8 hane "GGAAYYYY" (01022022 → 01.02.2022), 6 hane "AAYYYY",
 *    4 hane "YYYY". Böylece takvim seçmeden de tarih yazılabilir.
 * Belirsiz uzunlukları (5/7 hane) olduğu gibi bırakır; doğrulama eler.
 */
export function normalizeDateInput(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) {
    if (s.length === 8) return `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4)}`;
    if (s.length === 6) return `${s.slice(0, 2)}.${s.slice(2)}`;
    return s; // 4 hane (YYYY) ya da belirsiz → dokunma
  }
  return s.replace(/[./\-\s]+/g, ".").replace(/^\.|\.$/g, "");
}

/** "23.04.1985" → "1985-04-23" ・ "1985" → "1985" (esnek giriş kabul eder) */
export function displayToStored(display: string): string {
  const s = normalizeDateInput(display);
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
  const s = normalizeDateInput(display);
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

/**
 * "23 Nisan 1985" gibi uzun okunabilir biçim.
 *
 * Ay adı yoksa (aralık dışı ya da sayı olmayan ay) ay ATLANIR. Eskiden
 * `AYLAR[Number(m) - 1]` doğrudan yazılıyordu ve bozuk bir kayıtta
 * ekranda "23 undefined 1985" beliriyordu — kullanıcıya İngilizce bir
 * JavaScript değeri göstermek, tarihi hiç göstermemekten kötü.
 */
export function formatLong(stored?: string): string {
  if (!stored) return "";
  const [y, m, d] = stored.split("-");
  const ay = AYLAR[Number(m) - 1];
  if (d) return ay ? `${Number(d)} ${ay} ${y}` : `${Number(d)}.${m}.${y}`;
  if (m) return ay ? `${ay} ${y}` : `${m}.${y}`;
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

/**
 * Bir tarihin yıldönümüne İŞARETLİ gün uzaklığı: gelecek için +, yakın
 * geçmiş için −. `pastWindow` gün öncesine ve `futureWindow` gün sonrasına
 * kadar olan en yakın yinelenmeyi döndürür; ikisi de pencere dışındaysa null.
 *
 * Yaklaşan olaylar listesine "10 gün öncesine kadar geçmiş" olayları da
 * katmak için kullanılır (Madde 1). Bugün = 0.
 */
export function signedDaysToAnniversary(
  stored: string | undefined,
  pastWindow: number,
  futureWindow: number
): number | null {
  if (!stored) return null;
  const parts = stored.split("-");
  if (parts.length < 2) return null;
  const [, m, d] = parts.map(Number);
  if (!m) return null;
  const day = d || 1;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mk = (yr: number) => new Date(yr, m - 1, day);
  const dayMs = 86400000;

  // Yaklaşan yinelenme (bugün dahil, ≥ 0)
  let next = mk(today.getFullYear());
  if (next < today) next = mk(today.getFullYear() + 1);
  const untilNext = Math.round((next.getTime() - today.getTime()) / dayMs);

  // En son geçen yinelenme (bugün dahil, ≥ 0)
  let prev = mk(today.getFullYear());
  if (prev > today) prev = mk(today.getFullYear() - 1);
  const sincePrev = Math.round((today.getTime() - prev.getTime()) / dayMs);

  const futureOk = untilNext <= futureWindow;
  const pastOk = sincePrev > 0 && sincePrev <= pastWindow;
  // Pencere içindeki en yakın yinelenmeyi seç (geçmiş −, gelecek +)
  if (pastOk && (!futureOk || sincePrev < untilNext)) return -sincePrev;
  if (futureOk) return untilNext;
  return null;
}

/** "12 gün sonra" / "Bugün" / "Yarın" / "Dün" / "3 gün önce" */
export function humanizeDays(days: number): string {
  if (days === 0) return "Bugün";
  if (days === 1) return "Yarın";
  if (days === -1) return "Dün";
  if (days < 0) return `${-days} gün önce`;
  return `${days} gün sonra`;
}

export { AYLAR };
