import type { User } from "../types/user";

/**
 * KİMLİK KAYMASI: `users.json` satırı ile Postgres aynası alan alan aynı mı?
 *
 * ## Neden gerekli
 *
 * Faz 4'ün kalan parçası okuma yolunu Postgres'e çeviriyor. Bunu ölçmeden
 * yapmak, aynanın DOĞRU olduğunu varsaymak demek — ve ayna 2a'ya kadar on üç
 * alanı hiç taşımıyordu, yani varsayım yanlıştı.
 *
 * ## Neden "satır var mı" yetmiyor
 *
 * İlk tasarımım "Postgres'ten oku, satır yoksa Blob'a düş" idi. Tehlikeliydi:
 * eksiklik satır düzeyinde değil ALAN düzeyinde. `session_epoch` boş bir
 * satır "eksik" değil, "çağ yok" diye okunur — geri düşüş hiç tetiklenmez ve
 * şifre sıfırlamanın oturumları düşürme koruması SESSİZCE ölür. Aynı şey
 * `recoveryCodeIndex` (kurtarma kodu çalışmaz) ve `authEmail` (e-postayla
 * kurtarma kapanır) için de geçerli.
 *
 * Bu yüzden karşılaştırma alan alan yapılıyor ve eksik alan bir BULGU.
 *
 * ## Neden bağımlılıksız
 *
 * Karar katmanı G/Ç'den ayrı: iki `User` alıyor, fark listesi veriyor.
 * Böylece davranışı gerçek bir veritabanı olmadan çalıştırılarak sınanıyor
 * (CLAUDE.md — çalışma zamanı `@/…` içe aktarımı olan kitaplık test
 * edilemiyor).
 */

/** Karşılaştırılan alanlar — `User`ın kimlik taşıyan bütün alanları. */
export const KARSILASTIRILAN: readonly (keyof User)[] = [
  "familyName",
  "passwordHash",
  "recoveryCodeHash",
  "recoveryCodeIndex",
  "createdAt",
  "sessionEpoch",
  "deletedAt",
  "authEmail",
  "authEmailVerified",
  "emailTokenHash",
  "emailTokenExpires",
  "resetTokenHash",
  "resetTokenExpires",
  "notifyEmail",
  "notifyReminders",
  "notifyMemorials",
  "notifyNewsletter",
] as const;

/**
 * "Yok" değerlerini tek bir biçime indirir.
 *
 * Blob tarafı `undefined` kullanıyor (alan hiç yazılmamış), Postgres `null`
 * (sütun boş). İkisi AYNI ŞEYİ söylüyor; eşitlemeden karşılaştırmak her
 * dolmamış alanı sahte bir kayma olarak raporlardı — ve sahte kayma, gerçek
 * kaymayı gürültüde boğar.
 *
 * Boş dize de "yok" sayılıyor: `recoveryCodeHash` şemada `not null default ''`.
 */
function bos(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/**
 * Zaman damgaları METİN olarak karşılaştırılamaz.
 *
 * Blob ISO-8601 saklıyor (`2026-09-08T11:11:00.000Z`), Postgres `timestamptz`
 * okurken `2026-09-08 11:11:00+00` veriyor. Aynı an, farklı dize — ham
 * karşılaştırma her damgayı kayma sayardı.
 */
const ZAMAN_ALANLARI = new Set<keyof User>([
  "createdAt", "sessionEpoch", "deletedAt", "emailTokenExpires", "resetTokenExpires",
]);

function esit(alan: keyof User, a: unknown, b: unknown): boolean {
  if (bos(a) && bos(b)) return true;
  if (bos(a) !== bos(b)) return false;
  if (ZAMAN_ALANLARI.has(alan)) {
    const ta = Date.parse(String(a));
    const tb = Date.parse(String(b));
    // Ayrıştırılamayan damga: dizgeye düş, sessizce "eşit" deme.
    if (Number.isNaN(ta) || Number.isNaN(tb)) return String(a) === String(b);
    return ta === tb;
  }
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  return String(a) === String(b);
}

export interface HesapKaymasi {
  accountId: string;
  /** Aynada satır var mı? Yoksa alan karşılaştırması anlamsız. */
  aynadaVar: boolean;
  /** Ayrışan alan adları (boşsa temiz). */
  ayrisan: string[];
}

/**
 * Blob'daki hesapları aynadakilerle karşılaştırır.
 *
 * YÖN ÖNEMLİ: Blob asıl kaynak, dolayısıyla ölçü "Blob'daki her satır aynada
 * aynen var mı". Aynada olup Blob'da OLMAYAN satır da bulgudur — kimliği
 * silinmiş bir hesabın aynada yaşaması, okuma Postgres'e döndüğünde onu geri
 * diriltir (demo satırında tam olarak bu oldu).
 */
export function compareAccounts(blob: User[], ayna: User[]): HesapKaymasi[] {
  const aynaById = new Map(ayna.map((u) => [u.id, u]));
  const out: HesapKaymasi[] = [];

  for (const b of blob) {
    const a = aynaById.get(b.id);
    if (!a) {
      out.push({ accountId: b.id, aynadaVar: false, ayrisan: [] });
      continue;
    }
    const ayrisan = KARSILASTIRILAN.filter(
      (alan) => !esit(alan, b[alan], a[alan])
    ).map(String);
    out.push({ accountId: b.id, aynadaVar: true, ayrisan });
  }

  // Blob'da karşılığı olmayan ayna satırları — "fazla" yönü.
  const blobIds = new Set(blob.map((u) => u.id));
  for (const a of ayna) {
    if (!blobIds.has(a.id))
      out.push({ accountId: a.id, aynadaVar: true, ayrisan: ["__blobda-yok"] });
  }
  return out;
}

/** Kayma var mı? (kapı için tek satırlık özet) */
export function hasAccountDrift(k: readonly HesapKaymasi[]): boolean {
  return k.some((x) => !x.aynadaVar || x.ayrisan.length > 0);
}
