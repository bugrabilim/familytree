import type { Bond, BondType } from "../types/bond.ts";
import { BOND_TYPES } from "../types/bond.ts";

/**
 * Duygusal bağ katmanı — saf mantık.
 *
 * Buradaki asıl iş tek bir fikrin her yerde aynı uygulanması: **bağ
 * yönsüzdür.** Kullanıcı "Ali ile Veli çatışmalı" derken uçların sırası
 * hiçbir şey ifade etmez, ama bilgisayar için (Ali,Veli) ile (Veli,Ali) iki
 * ayrı kayıttır. Sıralamayı tek bir yerde (`pairKey`) yapmazsak aynı çift
 * için iki bağ oluşur, biri silinince öteki kalır ve çizimde iki çizgi
 * görünür. O yüzden depoya giren her bağ önce buradan geçer.
 */

export const MAX_NOTE = 500;
export const MAX_BONDS = 500;

/** i18n anahtarı — `bond.type.<tür>`. */
export function bondTypeKey(t: BondType): string {
  return `bond.type.${t}`;
}

export function isBondType(v: unknown): v is BondType {
  return typeof v === "string" && (BOND_TYPES as readonly string[]).includes(v);
}

/**
 * Bir çiftin kanonik anahtarı. Uçlar sıralanır, böylece (a,b) ve (b,a) aynı
 * anahtarı verir. Ayırıcı olarak boşluk kullanıldı: kimlikler nanoid/uuid
 * biçiminde (harf, rakam, `_`, `-`) olduğundan içlerinde boşluk geçemez,
 * dolayısıyla iki farklı çift aynı anahtara düşemez.
 */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

/** Uçları kanonik sıraya sokar. */
export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Bir bağın diğer ucu. Kişi bağın ucu değilse `undefined` — çağıran yer
 * "her bağ bu kişiye ait" varsaymasın.
 */
export function otherEnd(bond: Pick<Bond, "a" | "b">, personId: string): string | undefined {
  if (bond.a === personId) return bond.b;
  if (bond.b === personId) return bond.a;
  return undefined;
}

/** Bir kişiye dokunan bağlar. */
export function bondsOf(bonds: readonly Bond[], personId: string): Bond[] {
  return bonds.filter((x) => x.a === personId || x.b === personId);
}

/** Belirli bir çiftin bağı (varsa). */
export function bondBetween(bonds: readonly Bond[], a: string, b: string): Bond | undefined {
  const key = pairKey(a, b);
  return bonds.find((x) => pairKey(x.a, x.b) === key);
}

/**
 * Gelen girdiyi kayda çevirir; geçersizse `null`.
 *
 * Reddedilen durumlar ve nedenleri:
 * - uç eksik → bağın iki ucu olmalı, tek uçlu bağ diye bir şey yok;
 * - `a === b` → kişinin kendisiyle ilişkisi bu katmanın konusu değil;
 * - bilinmeyen tür → çizim her tür için ayrı çizgi biçimi kullanıyor,
 *   serbest metin çizilemez.
 */
export function normalizeBond(input: Partial<Bond>, now: string, existing?: Bond): Bond | null {
  const rawA = (input.a ?? existing?.a ?? "").trim();
  const rawB = (input.b ?? existing?.b ?? "").trim();
  if (!rawA || !rawB || rawA === rawB) return null;

  const type = input.type ?? existing?.type;
  if (!isBondType(type)) return null;

  const [a, b] = orderPair(rawA, rawB);
  const noteRaw = input.note === undefined ? existing?.note : input.note;
  const note = typeof noteRaw === "string" ? noteRaw.trim().slice(0, MAX_NOTE) : "";

  return {
    id: existing?.id ?? "",
    a,
    b,
    type,
    ...(note ? { note } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * Depodan okunan ham listeyi temizler: bozuk kayıtları atar, uçları kanonik
 * sıraya sokar ve aynı çiftin kopyalarından yalnız İLKİNİ tutar.
 *
 * Kopya eleme "sonuncu kazansın" değil "ilk kazansın": liste eklenme
 * sırasında tutuluyor ve elle düzeltilmiş eski kaydın, arkadan gelen bozuk
 * bir yazma yüzünden kaybolmasını istemiyoruz.
 */
export function normalizeBonds(raw: unknown): Bond[] {
  if (!Array.isArray(raw)) return [];
  const gorulen = new Set<string>();
  const out: Bond[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Partial<Bond>;
    if (typeof x.id !== "string" || !x.id) continue;
    if (typeof x.a !== "string" || typeof x.b !== "string") continue;
    if (!x.a || !x.b || x.a === x.b) continue;
    if (!isBondType(x.type)) continue;
    const key = pairKey(x.a, x.b);
    if (gorulen.has(key)) continue;
    gorulen.add(key);
    const [a, b] = orderPair(x.a, x.b);
    out.push({
      id: x.id,
      a,
      b,
      type: x.type,
      ...(typeof x.note === "string" && x.note ? { note: x.note.slice(0, MAX_NOTE) } : {}),
      createdAt: typeof x.createdAt === "string" ? x.createdAt : new Date(0).toISOString(),
      updatedAt: typeof x.updatedAt === "string" ? x.updatedAt : new Date(0).toISOString(),
    });
  }
  return out;
}

/**
 * Ağaçta artık bulunmayan kişilere giden bağları ayıklar.
 *
 * Kişi silmek bağ silmez (silme rotası bu koleksiyondan habersiz), o yüzden
 * okurken süzüyoruz. Öksüz bağı çizmeye kalksak var olmayan bir düğüme
 * çizgi çekerdik.
 */
export function pruneBonds(bonds: readonly Bond[], personIds: Iterable<string>): Bond[] {
  const mevcut = personIds instanceof Set ? personIds : new Set(personIds);
  return bonds.filter((x) => mevcut.has(x.a) && mevcut.has(x.b));
}

/** Türlere göre sayım — özet/rozet için. */
export function countByType(bonds: readonly Bond[]): Record<BondType, number> {
  const out = Object.fromEntries(BOND_TYPES.map((t) => [t, 0])) as Record<BondType, number>;
  for (const x of bonds) out[x.type]++;
  return out;
}

/**
 * Çizim ipuçları — her tür için çizgi biçimi. Genogram geleneğine sadık:
 * yakınlık kalınlıkla, çatışma zikzakla, kopukluk kesik çizgiyle anlatılır.
 *
 * Renk burada YOK: aynı bilgiyi yalnız renkle vermek renk körü bir okuru
 * dışarıda bırakırdı. Kalınlık + desen + çizgi sayısı tek başına ayırt edici.
 */
export interface BondStyle {
  /** Kaç paralel çizgi (1 = normal, 2 = iç içe). */
  lines: 1 | 2;
  strokeWidth: number;
  /** SVG `stroke-dasharray`; boşsa düz çizgi. */
  dash: string;
  /** Çizgi zikzak çizilsin mi (çatışma). */
  zigzag: boolean;
}

export const BOND_STYLES: Readonly<Record<BondType, BondStyle>> = {
  yakin: { lines: 1, strokeWidth: 3, dash: "", zigzag: false },
  icice: { lines: 2, strokeWidth: 3, dash: "", zigzag: false },
  mesafeli: { lines: 1, strokeWidth: 1, dash: "6 6", zigzag: false },
  catismali: { lines: 1, strokeWidth: 2, dash: "", zigzag: true },
  "icice-catismali": { lines: 2, strokeWidth: 2, dash: "", zigzag: true },
  kopuk: { lines: 1, strokeWidth: 2, dash: "2 8", zigzag: false },
};

/**
 * Zikzak çizgisi için ara noktalar — iki uç arasında dik yönde salınan bir
 * kırık çizgi. Uçlar korunur; yalnız aradaki gövde salınır ki çizgi
 * düğümlerin kenarına düzgün otursun.
 */
export function zigzagPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amplitude = 6,
  segment = 14
): Array<[number, number]> {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < segment * 2) return [[x1, y1], [x2, y2]];
  const n = Math.max(2, Math.round(len / segment));
  // Birim dik vektör — salınım yönü.
  const nx = -dy / len;
  const ny = dx / len;
  const pts: Array<[number, number]> = [[x1, y1]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const yon = i % 2 === 0 ? -1 : 1;
    pts.push([x1 + dx * t + nx * amplitude * yon, y1 + dy * t + ny * amplitude * yon]);
  }
  pts.push([x2, y2]);
  return pts;
}
