import type { Person } from "./types";

/* ── İsim (web lib/name.ts ile birebir) ── */

type NameParts = Pick<Person, "firstName" | "lastName"> &
  Partial<Pick<Person, "nickname" | "patronymic">>;

/** Kartın üst satırı. Soyadsız kayıtlarda baba adı önce: "Mehmet oğlu Hüseyin". */
export function primaryName(p: NameParts): string {
  const parts: string[] = [];
  if (!p.lastName?.trim() && p.patronymic?.trim()) parts.push(p.patronymic.trim());
  if (p.nickname?.trim()) parts.push(p.nickname.trim());
  parts.push(p.firstName?.trim() || "İsimsiz");
  return parts.join(" ");
}

/** Kartın alt satırı: resmî soyad (patronim kayıtlarında boş). */
export function secondaryName(p: NameParts): string {
  return p.lastName?.trim() || "";
}

/** Tam ad — arama, başlık ve tek satırlık gösterim için. */
export function fullName(p: NameParts): string {
  const alt = secondaryName(p);
  const ust = primaryName(p);
  return alt ? `${ust} ${alt}` : ust;
}

/* ── Tarih (web lib/date.ts alt kümesi) ── */

const AYLAR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** Yıl aralığı: "1920 – 1998" ・ "1985". */
export function lifeSpan(birth?: string, death?: string): string {
  const b = birth?.slice(0, 4);
  const d = death?.slice(0, 4);
  if (b && d) return `${b} – ${d}`;
  if (b) return b;
  if (d) return `? – ${d}`;
  return "";
}

/** "23 Nisan 1985" gibi uzun okunabilir biçim. */
export function formatLong(stored?: string): string {
  if (!stored) return "";
  const [y, m, d] = stored.split("-");
  if (d) return `${Number(d)} ${AYLAR[Number(m) - 1]} ${y}`;
  if (m) return `${AYLAR[Number(m) - 1]} ${y}`;
  return y;
}

/** "1985-04-23" → "23.04.1985" ・ "1985" → "1985" (görüntü biçimi). */
export function storedToDisplay(stored?: string): string {
  if (!stored) return "";
  const [y, m, d] = stored.split("-");
  if (d) return `${d}.${m}.${y}`;
  if (m) return `${m}.${y}`;
  return y ?? "";
}

function normalizeDateInput(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) {
    if (s.length === 8) return `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4)}`;
    if (s.length === 6) return `${s.slice(0, 2)}.${s.slice(2)}`;
    return s;
  }
  return s.replace(/[./\-\s]+/g, ".").replace(/^\.|\.$/g, "");
}

/** "23.04.1985" → "1985-04-23" ・ "1985" → "1985" (depolama biçimi). */
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

/* ── Kimlik / görsel ── */

/**
 * LGBT+ göstergesi — web lib/identity.ts ile birebir. Cinsiyet "diğer" ya da
 * heteroseksüel olmayan bir yönelim kayıtlıysa kartın zemini gökkuşağı olur.
 */
export function isRainbow(p: Pick<Person, "gender" | "orientation">): boolean {
  if (p.gender === "other") return true;
  const o = p.orientation?.trim().toLocaleLowerCase("tr");
  if (!o) return false;
  return !/^(hetero|düz|straight)/.test(o);
}

/** Avatar için baş harf(ler). */
export function initials(p: Pick<Person, "firstName" | "lastName">): string {
  const a = p.firstName?.trim()?.[0] ?? "";
  const b = p.lastName?.trim()?.[0] ?? "";
  return (a + b).toLocaleUpperCase("tr") || "?";
}

const AVATAR_COLORS = [
  "#1f6b47", "#a8763e", "#4a6fa5", "#8a5a83", "#b3623a",
  "#3f7d6e", "#6b6f9e", "#9e6b4a", "#5c7a4a", "#8e5b6b",
];

/** Kimlikten kararlı avatar zemin rengi. */
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
