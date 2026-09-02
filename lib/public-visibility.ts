import type { Person } from "@/types/family";

/**
 * Kişi bazlı paylaşım gizliliği — girişsiz `/g/<jeton>` yüzeyi için.
 *
 * Ağaç sahibi, herkese açık bir bağlantı verirken tek tek kişiler için
 * "gizle" ya da "bulanıklaştır" diyebilir. Bu, `confidential`den AYRI bir
 * şeydir: o her yerde maskeler (aile içinde de), bu yalnız dışarısı içindir.
 *
 * KURAL: bu dönüşüm SUNUCUDA, veri istemciye gitmeden uygulanır. "Çizerken
 * gizle" demek gizlemek değildir — ham veri RSC yükünde, ağ sekmesinde ve
 * sayfa kaynağında durur. (Aynı ders `lib/letters.ts`te de yazılı.)
 *
 * Dosya bağımlılıksız (`@/` yalnız tür düzeyinde) — birim testi koşulabilsin.
 */

export type PublicVisibility = "gizli" | "bulanik";

/**
 * Bulanıklaştırılmış kopyada KALAN alanlar.
 *
 * Beyaz liste, kara liste değil: yarın `Person`a yeni bir alan eklendiğinde
 * varsayılan olarak DIŞARIDA kalsın. Tersi olsaydı, eklenen her alan
 * kendiliğinden dışarı sızardı.
 *
 * Ad, tarih, yer, fotoğraf, hikâye — hiçbiri kalmaz. Yalnız ağacın çizilmesi
 * için gereken bağ yapısı ve kişinin bulanık olduğunu söyleyen bayrak kalır.
 * Cinsiyet de kalmaz: "bulanıklaştır" diyen biri, kişinin cinsiyetinin de
 * görünmesini beklemez.
 */
function blurPerson(p: Person, blurredName: string): Person {
  const out: Person = {
    id: p.id,
    /*
     * Ad boş bırakılsaydı arayüz "İsimsiz" yazardı — ki bu "veri eksik"
     * demektir, oysa burada eksik değil SAKLI. Etiketi çağıran verir; bu
     * dosya çeviri sözlüğüne bağımlı olmasın.
     */
    firstName: blurredName,
    lastName: "",
    gender: "unknown",
    parentIds: [...p.parentIds],
    spouseIds: [...p.spouseIds],
    // Arayüz "İsimsiz" değil "gizlenmiş" yazabilsin diye bayrak taşınır.
    // İsimsiz, "veri eksik" demektir; burada eksik değil, saklı.
    publicVisibility: "bulanik",
  };
  if (p.formerSpouseIds !== undefined) out.formerSpouseIds = [...p.formerSpouseIds];
  if (p.parentLinks !== undefined) {
    // Bağın TÜRÜ (evlatlık, üvey…) kişisel bir bilgidir; yalnız bağın VARLIĞI
    // ağacı çizmek için gerekli. Anahtarlar korunur, değerler boşaltılır.
    out.parentLinks = Object.fromEntries(Object.keys(p.parentLinks).map((k) => [k, {}]));
  }
  // "cevre" (aile üyesi olmayan yakın) ayrımı ağaç süzgecini etkiler; kişisel
  // bir bilgi değil, yapısal bir bayraktır.
  if (p.kind !== undefined) out.kind = p.kind;
  return out;
}

/** Bir kişiye yapılan tüm başvuruları temizler (gizlenen kişi için). */
function scrubReferences(p: Person, hidden: ReadonlySet<string>): Person {
  const parentIds = p.parentIds.filter((id) => !hidden.has(id));
  const spouseIds = p.spouseIds.filter((id) => !hidden.has(id));
  const formerSpouseIds = p.formerSpouseIds?.filter((id) => !hidden.has(id));
  const associations = p.associations?.filter((a) => !hidden.has(a.personId));
  const links = p.parentLinks
    ? Object.fromEntries(Object.entries(p.parentLinks).filter(([k]) => !hidden.has(k)))
    : undefined;

  // Hiçbir şey değişmediyse aynı nesneyi döndür: gereksiz kopya üretme.
  const degisti =
    parentIds.length !== p.parentIds.length ||
    spouseIds.length !== p.spouseIds.length ||
    (formerSpouseIds?.length ?? 0) !== (p.formerSpouseIds?.length ?? 0) ||
    (associations?.length ?? 0) !== (p.associations?.length ?? 0) ||
    Object.keys(links ?? {}).length !== Object.keys(p.parentLinks ?? {}).length;
  if (!degisti) return p;

  const out: Person = { ...p, parentIds, spouseIds };
  if (formerSpouseIds !== undefined) out.formerSpouseIds = formerSpouseIds;
  if (associations !== undefined) out.associations = associations;
  if (links !== undefined) out.parentLinks = links;
  return out;
}

/**
 * Herkese açık paylaşım için listeyi dönüştürür.
 *
 * Sıra önemli: önce gizlenenler çıkarılır ve başvuruları temizlenir, SONRA
 * bulanıklaştırma uygulanır. Tersi olsaydı, bulanık bir kişinin `parentIds`i
 * gizlenmiş birinin kimliğini taşımaya devam ederdi — kimlik bir addan ibaret
 * değildir, sarkan bir kimlik de "burada biri vardı" der.
 */
export function applyPublicVisibility(
  people: readonly Person[],
  opts: { blurredName?: string } = {}
): Person[] {
  const hidden = new Set(people.filter((p) => p.publicVisibility === "gizli").map((p) => p.id));

  const kalanlar = hidden.size
    ? people.filter((p) => !hidden.has(p.id)).map((p) => scrubReferences(p, hidden))
    : [...people];

  const ad = opts.blurredName ?? "";
  return kalanlar.map((p) => (p.publicVisibility === "bulanik" ? blurPerson(p, ad) : p));
}

/** Paylaşımda kaç kişinin gizlendiği/bulanıklaştığı — sahibe göstermek için. */
export function countRestricted(people: readonly Person[]): { gizli: number; bulanik: number } {
  let gizli = 0;
  let bulanik = 0;
  for (const p of people) {
    if (p.publicVisibility === "gizli") gizli++;
    else if (p.publicVisibility === "bulanik") bulanik++;
  }
  return { gizli, bulanik };
}
