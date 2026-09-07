import type { Person } from "@/types/family";

/**
 * Kardeş sıralaması (manuel) — saf, test edilebilir. `siblingOrder` kullanıcı
 * tarafından belirlenen açık sıra; yoksa doğum tarihine, o da yoksa ada göre.
 * Aynı TAM ebeveyn kümesini paylaşanlar bir "kardeş grubu" sayılır (ağaçtaki
 * birlik/union ile aynı gruplama).
 */

const BIG = Number.MAX_SAFE_INTEGER;

export function compareSiblings(a?: Person, b?: Person): number {
  if (!a || !b) return 0;
  const ao = a.siblingOrder ?? BIG;
  const bo = b.siblingOrder ?? BIG;
  if (ao !== bo) return ao - bo;
  const ad = a.birthDate ?? "9999";
  const bd = b.birthDate ?? "9999";
  if (ad !== bd) return ad.localeCompare(bd);
  return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "tr");
}

/** İki kişi aynı tam ebeveyn kümesini mi paylaşıyor? (ikisinin de ebeveyni olmalı) */
export function sameParentSet(a: Person, b: Person): boolean {
  if (a.parentIds.length === 0 || b.parentIds.length === 0) return false;
  return [...a.parentIds].sort().join("|") === [...b.parentIds].sort().join("|");
}

/** Kişinin kardeş grubu (kendisi dâhil), görüntü sırasına göre sıralı. */
export function siblingGroup(person: Person, people: Person[]): Person[] {
  if (person.parentIds.length === 0) return [person];
  return people.filter((p) => sameParentSet(p, person)).sort(compareSiblings);
}

/**
 * `ids` listesinde `movingId`'yi `dir` yönünde (-1 yukarı, +1 aşağı) bir
 * komşusuyla yer değiştirir. Sınırdaysa liste aynen döner.
 */
export function moveInList(ids: string[], movingId: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(movingId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const copy = [...ids];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

/**
 * İşaretçi `y` konumuna göre EKLEME konumu (0..n): satır orta noktalarını
 * geçtikçe bir sonraki aralığa düşer. `mids` yukarıdan aşağıya sıralı satır
 * ORTA y değerleri (piksel).
 *
 * Ekleme konumu ("kaç öğe üstte kalıyor") kullanılıyor, satır dizini değil:
 * listenin en altına bırakmak `n` ile ifade edilebilsin diye — satır
 * diziniyle "son satırın üstü" ile "son satırın altı" ayırt edilemezdi.
 */
export function dropIndex(mids: number[], y: number): number {
  let i = 0;
  while (i < mids.length && y > mids[i]) i++;
  return i;
}

/**
 * `ids` listesinde `movingId`'yi `insertAt` EKLEME konumuna taşır.
 * `insertAt`, öğe listeden ÇIKARILMADAN ÖNCEki konumlara göre verilir
 * (`dropIndex`in döndürdüğü değer doğrudan buraya girer).
 *
 * Sıra değişmiyorsa liste AYNEN (aynı referansla) döner — `moveInList` ile
 * aynı sözleşme; çağıran `next === cur` ile boş yazmayı eleyebiliyor.
 */
export function moveToIndex(ids: string[], movingId: string, insertAt: number): string[] {
  const from = ids.indexOf(movingId);
  if (from < 0) return ids;
  // Öğe kendi konumundan çıkarılınca altındaki her şey bir yukarı kayar.
  const to = insertAt > from ? insertAt - 1 : insertAt;
  if (to === from || to < 0 || to >= ids.length) return ids;
  const copy = [...ids];
  copy.splice(from, 1);
  copy.splice(to, 0, movingId);
  return copy;
}
