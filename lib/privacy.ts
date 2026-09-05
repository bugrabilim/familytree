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
  // Koordinat, metnin YÜKSEK ÇÖZÜNÜRLÜKLÜ hâlidir: yer adını gizleyip
  // koordinatı bırakmak gizlemek değildir (bu hata gerçekten oldu).
  birthPlace: ["birthPlace", "birthCoords"],
  burialPlace: ["burialPlace", "burialCoords"],
  // KVKK md. 6 — din, mezhep, ırk ve etnik köken özel nitelikli kişisel veri.
  belief: ["religion", "denomination"],
  origin: ["ethnicity", "nationality", "language"],
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
    parentIds: [...p.parentIds],
    spouseIds: [...p.spouseIds],
  };

  // Ada ait, hassas olmayan gösterim alanları
  if (p.code !== undefined) masked.code = p.code;
  if (p.nickname !== undefined) masked.nickname = p.nickname;
  if (p.patronymic !== undefined) masked.patronymic = p.patronymic;

  // Vefat rozeti ve "yaşıyor mu?" hesabı için ölüm tarihi korunur
  if (p.deathDate !== undefined) masked.deathDate = p.deathDate;
  if (p.confidential !== undefined) masked.confidential = p.confidential;
  // Üye/çevre ayrımı hassas değil; korunur ki maskeleme sonrası soy-ağacı
  // süzgeci (çevre kişileri ağaca girmez) tutarlı kalsın. `associations`
  // BİLEREK aktarılmaz — gizli kişinin yakın-çevre bağları sızmasın.
  if (p.kind !== undefined) masked.kind = p.kind;

  // İlişki yapısı — ağaç bozulmasın.
  //
  // Diziler KOPYALANIR: sığ taşımada maskeli kopya ile ham kayıt aynı diziyi
  // paylaşıyordu, yani "görüntü katmanı veriyi değiştirmez" sözü tutulmuyordu —
  // kopyaya `push` yapan ham veriyi bozuyordu.
  if (p.parentLinks !== undefined) masked.parentLinks = { ...p.parentLinks };
  if (p.formerSpouseIds !== undefined) masked.formerSpouseIds = [...p.formerSpouseIds];

  return masked;
}

/**
 * ÜÇÜNCÜ KİŞİNİN E-POSTA ADRESİ — görüntü katmanında KOŞULSUZ düşer.
 *
 * Öbür gizlilik kuralları koşullu: kişi maskeliyse, alan `privateFields`
 * içindeyse. Bu değil. Sebebi, kime gittiği: ağaç yükü ağacın BÜTÜN üyelerine
 * ve paylaşım bağlantısını açan herkese gidiyor. Adres oraya binseydi tek bir
 * paylaşım bağlantısı, ağaçtaki herkesin e-posta adresini dışarı taşırdı — ve
 * o adresler kullanıcının kendi adresi bile değil, akrabalarının.
 *
 * Ekranda gösterilecek bir değeri de yok: adres bir gönderim ayarı, bir künye
 * bilgisi değil. Düzenleyici onu kendi ucundan (`/api/family/person/[id]/
 * contact`) okur — yani adres yalnız onu yazabilen kişiye, yalnız istendiğinde
 * gider.
 *
 * `maskPerson` beyaz liste olduğu için maskeli kopyada zaten yok; buradaki
 * koşulsuz silme, MASKESİZ yolun (vefat etmiş kişi, gizleme kapalı) açıkta
 * kalmasını engelliyor.
 */
const CONTACT_FIELDS = [
  "contactEmail",
  "contactConsent",
  "contactTokenHash",
  "contactAskedAt",
] as const;

/** İletişim alanları çıkarılmış kopya. Alan yoksa aynı nesne döner. */
export function stripContact(p: Person): Person {
  const kaynak = p as unknown as Record<string, unknown>;
  let copy: Record<string, unknown> | null = null;
  for (const f of CONTACT_FIELDS) {
    if (kaynak[f] === undefined) continue;
    copy ??= { ...kaynak };
    delete copy[f];
  }
  return (copy ?? p) as unknown as Person;
}

/**
 * Görüntü katmanının TEK kaynağı: tümüyle maskeliyse beyaz listeli kopya,
 * değilse alan-bazlı gizli grupları çıkarılmış kopya.
 *
 * Hem istemcide (`PrivacyContext`) hem SUNUCUDA kullanılır. Sunucu tarafı
 * şart: Next.js'te bir sunucu bileşeninden istemci bileşenine geçen proplar
 * RSC yüküne serileştirilip tarayıcıya gider. Yalnız çizim anında maskelemek,
 * ham veriyi zaten göndermiş olmak demektir.
 */
export function viewPerson(p: Person, hideLiving: boolean): Person {
  /*
   * `stripContact` EN DIŞTA ve her iki dalın üstünde: iki daldan birine
   * yazılsaydı, öbür dal sessizce adresi taşırdı. Görüntü katmanının tek
   * kapısı burası olduğu için tek satırlık bu sarmalama, adresin hiçbir
   * çizim yolundan çıkamamasını garanti ediyor.
   */
  return stripContact(isMasked(p, hideLiving) ? maskPerson(p) : stripPrivateFields(p));
}

/** `viewPerson`'ın liste hâli. */
export function viewAll(people: Person[], hideLiving: boolean): Person[] {
  return people.map((p) => viewPerson(p, hideLiving));
}
