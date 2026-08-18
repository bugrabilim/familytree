import type { Person } from "@/types/family";

/**
 * Yaşayan kişi gizliliği (KVKK/GDPR dostu) için görüntü katmanı yardımcıları.
 *
 * Buradaki hiçbir şey veriyi değiştirmez; yalnızca kartlarda/listelerde
 * gösterilecek "maskeli bir kopya" üretir. Depolama, API ve GEDCOM aktarımı
 * ham veriyle çalışmaya devam eder.
 */

/** Ölüm tarihi olmayan herkes "yaşayan" sayılır. */
export function isLiving(p: Person): boolean {
  return !p.deathDate;
}

/**
 * Bir kişinin ekranda gizlenip gizlenmeyeceği:
 *  - `confidential` işaretliyse her zaman gizli (yaşıyor/vefat fark etmez),
 *  - aksi hâlde yalnızca gizleme açıkken ve kişi yaşıyorsa.
 *
 * Not: `deathDate` ve `confidential` maskeli kopyada da korunduğu için bu
 * işlev hem ham hem de maskelenmiş kişide doğru sonuç verir.
 */
export function isMasked(p: Person, hideLiving: boolean): boolean {
  return !!p.confidential || (hideLiving && isLiving(p));
}

/**
 * Gösterime hazır, hassas alanları boşaltılmış BİR KOPYA döndürür.
 *
 * Korunanlar: kimlik/ad (ad, soyad, lakap, baba adı), cinsiyet, `id`, `code`,
 * ölüm tarihi (vefat rozeti için), `confidential` bayrağı ve tüm ilişki
 * dizileri (parentIds/spouseIds/…) — böylece ağaç yapısı ve bağlar bozulmaz.
 *
 * Gizlenenler (kopyada hiç taşınmaz): doğum tarihi/yeri, fotoğraf, hikâye,
 * sağlık/köken alanları, cinsel yönelim, ölüm nedeni vb. Beyaz liste
 * yaklaşımı sayesinde ileride eklenecek hassas alanlar da varsayılan olarak
 * gizli kalır.
 */
/**
 * Alan-bazlı gizlilik (Madde 5) — `PRIVATE_GROUPS` anahtarını gerçek alanlara
 * eşler. Kişi tümüyle maskeli olmadığında bu gruplar tek tek gizlenir.
 */
const PRIVATE_GROUP_FIELDS: Record<string, Array<keyof Person>> = {
  story: ["bio"],
  health: ["congenitalCondition", "healthCondition", "deathCause", "healthNote"],
  photo: ["photo", "photos", "videos", "documents"],
  orientation: ["orientation"],
  memories: ["memories"],
  birthPlace: ["birthPlace"],
  events: ["events"],
};

/**
 * Kişinin `privateFields` gruplarına giren alanları boşaltılmış BİR KOPYA
 * döndürür (yalnızca görüntü katmanı). Grup yoksa aynı nesne döner.
 */
export function stripPrivateFields(p: Person): Person {
  if (!p.privateFields?.length) return p;
  const copy = { ...p } as unknown as Record<string, unknown>;
  for (const g of p.privateFields) {
    for (const f of PRIVATE_GROUP_FIELDS[g] ?? []) {
      delete copy[f as string];
    }
  }
  return copy as unknown as Person;
}

export function maskPerson(p: Person): Person {
  const masked: Person = {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    parentIds: p.parentIds,
    spouseIds: p.spouseIds,
  };

  // Ada ait, hassas olmayan gösterim alanları
  if (p.code !== undefined) masked.code = p.code;
  if (p.nickname !== undefined) masked.nickname = p.nickname;
  if (p.patronymic !== undefined) masked.patronymic = p.patronymic;

  // Vefat rozeti ve "yaşıyor mu?" hesabı için ölüm tarihi korunur
  if (p.deathDate !== undefined) masked.deathDate = p.deathDate;
  if (p.confidential !== undefined) masked.confidential = p.confidential;

  // İlişki yapısı — ağaç bozulmasın
  if (p.parentLinks !== undefined) masked.parentLinks = p.parentLinks;
  if (p.formerSpouseIds !== undefined) masked.formerSpouseIds = p.formerSpouseIds;

  return masked;
}
