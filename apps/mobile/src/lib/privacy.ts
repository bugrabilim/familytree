import type { Person } from "./types";

/**
 * GİZLİLİK GÖRÜNTÜ KATMANI — MOBİLİN TEK YERİ.
 *
 * Sunucudaki `lib/privacy.ts`in mobil karşılığı. Mobil kendi araç zincirinde
 * derlendiği için web dosyalarını içe aktaramıyor; kural burada TEKRAR
 * yazıldı ama SADECE burada — `src/lib/roles.ts` ile aynı desen ve aynı
 * gerekçe.
 *
 * ## Neden gerekiyordu
 *
 * Mobilde bu katman HİÇ YOKTU. Ekranlar `/api/family`den gelen HAM kaydı
 * doğrudan çiziyordu, yani:
 *
 *  · `confidential` işaretli kişilerin bütün alanları görünüyordu — web'de
 *    o kayıt her zaman maskeli çiziliyor, roldan bağımsız;
 *  · kullanıcının "yaşayanları gizle" tercihi telefonda karşılıksızdı;
 *  · alan-bazlı gizlilik (`privateFields`: hikâye, fotoğraf, yönelim, din,
 *    köken, doğum/defin yeri) telefonda hiç uygulanmıyordu.
 *
 * Üçüncüsü en ağırı: kullanıcı bir alanı GİZLİ işaretlemiş, uygulama
 * gizlemiş gibi davranıyor ve telefonda gösteriyor. Gizlilik ayarının
 * yalnız bir yüzeyde çalışması, hiç çalışmamasından beter — kullanıcı
 * korunduğunu sanıyor.
 *
 * ## Buradaki hiçbir şey VERİYİ DEĞİŞTİRMEZ
 *
 * Yalnız çizilecek bir KOPYA üretiyor. Düzenleme formu bilerek HAM kaydı
 * alıyor (`app/(app)/person/edit/[id].tsx`): maskeli kopyayı forma verip
 * kaydetmek, gizlenen alanları KALICI olarak silmek olurdu — web'de de aynı
 * ayrım var (`PersonDrawer` maskeli, `PersonForm` ham).
 */

/** Ölüm tarihi olmayan herkes "yaşayan" sayılır. */
export function isLiving(p: Person): boolean {
  return !p.deathDate;
}

/**
 * Kişi tümüyle maskelenecek mi?
 *
 * `confidential` KOŞULSUZ: yaşıyor olsun olmasın, tercih açık olsun olmasın.
 * Bu bayrak "bu kaydı kimse görmesin" demek ve bir görüntü tercihine
 * bağlanamaz.
 */
export function isMasked(p: Person, hideLiving: boolean): boolean {
  return !!p.confidential || (hideLiving && isLiving(p));
}

/**
 * Alan grubu → gerçek alanlar. Web'deki `PRIVATE_GROUP_FIELDS`in mobil
 * tipin TAŞIDIĞI alanlara indirgenmiş hâli.
 *
 * Koordinat alanları mobil tipte yok; ama yer adıyla birlikte gizlenmeleri
 * gereken kural web tarafında yazılı ve oraya alan eklenirse buraya da
 * eklenmeli — "yer adını gizleyip koordinatı bırakmak gizlemek değildir".
 */
const PRIVATE_GROUP_FIELDS: Record<string, Array<keyof Person>> = {
  story: ["bio"],
  photo: ["photo"],
  orientation: ["orientation"],
  birthPlace: ["birthPlace"],
  burialPlace: ["burialPlace"],
  belief: ["religion"],
  origin: ["ethnicity", "nationality", "language"],
};

/** Gizli gruplara giren alanları boşaltılmış BİR KOPYA. Grup yoksa aynı nesne. */
export function stripPrivateFields(p: Person): Person {
  if (!p.privateFields?.length) return p;
  const copy = { ...p } as unknown as Record<string, unknown>;
  for (const g of p.privateFields) {
    for (const f of PRIVATE_GROUP_FIELDS[g] ?? []) delete copy[f as string];
  }
  return copy as unknown as Person;
}

/**
 * Tümüyle maskeli kopya — BEYAZ LİSTE.
 *
 * Beyaz liste olması bilinçli: ileride mobil tipe eklenecek hassas bir alan
 * varsayılan olarak gizli kalır. Kara liste olsaydı her yeni alan sessizce
 * açıkta olurdu ve kimse fark etmezdi.
 *
 * Korunanlar ad/kimlik, cinsiyet ve İLİŞKİ DİZİLERİ: ağaç yapısı bozulmamalı.
 * `deathDate` ve `confidential` de korunuyor, çünkü `isMasked` maskeli kopya
 * üzerinde de doğru sonuç vermeli.
 */
export function maskPerson(p: Person): Person {
  const masked: Person = {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    parentIds: [...p.parentIds],
    spouseIds: [...p.spouseIds],
  };
  if (p.code !== undefined) masked.code = p.code;
  if (p.nickname !== undefined) masked.nickname = p.nickname;
  if (p.patronymic !== undefined) masked.patronymic = p.patronymic;
  if (p.deathDate !== undefined) masked.deathDate = p.deathDate;
  if (p.confidential !== undefined) masked.confidential = p.confidential;
  /* Diziler KOPYALANIYOR: maskeli kopya ile ham kayıt aynı diziyi paylaşmasın. */
  if (p.formerSpouseIds !== undefined) masked.formerSpouseIds = [...p.formerSpouseIds];
  return masked;
}

/** Görüntü katmanının TEK kapısı. */
export function viewPerson(p: Person, hideLiving: boolean): Person {
  return isMasked(p, hideLiving) ? maskPerson(p) : stripPrivateFields(p);
}

/** `viewPerson`ın liste hâli. */
export function viewAll(people: Person[], hideLiving: boolean): Person[] {
  return people.map((p) => viewPerson(p, hideLiving));
}
