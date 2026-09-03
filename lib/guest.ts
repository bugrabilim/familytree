/**
 * MİSAFİR HESAP (Supabase Faz 3d, madde 41).
 *
 * Kayıt olmadan denemek isteyen kullanıcı için: kendine ait, gerçek ama
 * SAHİPSİZ bir ağaç. İstediğinde soyadı + şifre vererek onu gerçek bir
 * hesaba dönüştürür ("sahiplenme").
 *
 * ## Demo hesabından farkı
 *
 * `lib/demo-account.ts` HERKESE AÇIK ve PAYLAŞIMLI bir oyun alanı — tek bir
 * ağaç, herkes aynı veriyi görür. Misafir ağacı ise kişiye özel ve geçici.
 * İkisini karıştırmak, birinin denediği veriyi başkasına göstermek olurdu.
 *
 * ## Asıl tehlike: ölçülen her şey ölçüsüzleşir
 *
 * Kolay hata "misafir davet gönderemesin, paylaşamasın" deyip durmaktır. Asıl
 * mesele başka: misafir hesabı SINIRSIZ üretilebiliyor ve bu depoda birçok
 * sınır HESAP BAŞINA (`lib/rate-limit.ts`). Yani misafire AI çağrısı ya da
 * medya yükleme açık bırakılırsa, kota diye bir şey kalmaz — saldırgan her
 * çağrı için yeni bir misafir hesabı açar.
 *
 * Kural bu yüzden iki başlıkta toplanıyor:
 *
 *  1. **Ölçülen** her şey kapalı (AI, yükleme) — yoksa sınır anlamsızlaşır.
 *  2. **Kendi ağacının dışına uzanan** her şey kapalı (davet, paylaşım
 *     bağlantısı, eşleştirme, etkinlik/RSVP) — sahipsiz bir ağaçtan
 *     başkalarına ulaşmanın ya da veri yayınlamanın anlamı yok.
 *  3. **EK ağaç açmak** kapalı. Misafir zaten bir ağaçla geliyor; ikincisi
 *     "misafir kendi ağacında kalsın" kuralını deler ve her ağaç yeni bir
 *     blob + Postgres satırı olduğu için 1. maddedeki çarpanı geri getirir.
 *
 * Kalanı — kendi ağacında kişi eklemek, düzenlemek, görüntülemek, dışa
 * aktarmak — açık. Denemenin bütün anlamı orada.
 *
 * Saf ve bağımlılık-hafif (yalnız tür düzeyinde `@/`) — birim testi
 * koşulabilsin.
 */

/** Misafir olarak açılmış hesap mı? */
export function isGuestAccount(u: { guest?: boolean } | null | undefined): boolean {
  return !!u?.guest;
}

/**
 * Misafir hesabın erişebildiği/erişemediği yüzeyler.
 *
 * Liste AÇIKÇA sayılıyor, "kapalı olanları unutmayalım" diye değil: yeni bir
 * yüzey eklendiğinde ne yapılacağına karar vermek zorunda kalınsın.
 */
export type GuestAction =
  // --- Ölçülen (hesap başına kotalı) ---
  | "ai"          // Gemini çağrıları — kota hesap başına
  | "upload"      // Cloudinary — depolama/bant maliyeti
  // --- Kendi ağacının dışına uzanan ---
  | "invite"      // üye daveti
  | "share"       // herkese açık paylaşım bağlantısı
  | "pair"        // başka ağaçla eşleşme/aşılama
  | "gathering"   // etkinlik + anonim RSVP yüzeyi
  | "email"       // kimlik e-postası bağlama (sahiplenmeden geçmeli)
  | "tree"        // EK ağaç oluşturma — her ağaç yeni bir blob + DB satırı
  // --- Kendi ağacında kalan ---
  | "edit"        // kişi ekle/düzenle/sil
  | "read"        // görüntüle
  | "export";     // kendi verisini dışa aktar

/**
 * Misafire KAPALI eylemler.
 *
 * `ai` ve `upload` buradaki en önemli iki satır ve gerekçesi dosya başında:
 * hesap sınırsız üretilebildiği için hesap başına ölçülen her şey misafire
 * açıldığı anda ölçüsüz hale gelir.
 */
export const GUEST_DENIED: ReadonlySet<GuestAction> = new Set<GuestAction>([
  "ai",
  "upload",
  "invite",
  "share",
  "pair",
  "gathering",
  "email",
  "tree",
]);

/** Misafir bu eylemi yapabilir mi? */
export function guestCan(action: GuestAction): boolean {
  return !GUEST_DENIED.has(action);
}

/**
 * Oturum sahibi bu eylemi yapabilir mi? Misafir değilse her şey açık —
 * yetki denetimi (rol) ayrı ve yerinde duruyor.
 */
export function canDo(isGuest: boolean, action: GuestAction): boolean {
  return isGuest ? guestCan(action) : true;
}

/** Misafir ağacının görünen adı. Gerçek bir soyad değil ve öyle görünmemeli. */
export const GUEST_TREE_NAME = "Misafir ağacı";

/* ── Sahiplenme ───────────────────────────────────────────────────────────── */

export type ClaimError =
  | "misafir-degil"   // zaten gerçek hesap
  | "ad-kisa"
  | "ad-dolu"
  | "sifre-kisa";

export interface ClaimInput {
  familyName?: unknown;
  password?: unknown;
}

export interface ClaimPlan {
  familyName: string;
}

/**
 * Misafir ağacını gerçek hesaba çevirme planı.
 *
 * Doğrulama kuralları KAYIT rotasıyla aynı tutuldu (ad ≥ 2, şifre ≥ 6, ad
 * benzersiz): sahiplenme "arka kapıdan kayıt" olduğu için ondan daha gevşek
 * olamaz. Gevşek olsaydı, kayıt kurallarını atlamak için önce misafir açıp
 * sonra sahiplenmek yeterdi.
 */
export function planClaim(
  account: { guest?: boolean },
  input: ClaimInput,
  isNameTaken: (name: string) => boolean
): { ok: true; plan: ClaimPlan } | { ok: false; error: ClaimError } {
  if (!isGuestAccount(account)) return { ok: false, error: "misafir-degil" };

  const ad = typeof input.familyName === "string" ? input.familyName.trim() : "";
  if (ad.length < 2) return { ok: false, error: "ad-kisa" };
  if (isNameTaken(ad)) return { ok: false, error: "ad-dolu" };

  const sifre = typeof input.password === "string" ? input.password : "";
  if (sifre.length < 6) return { ok: false, error: "sifre-kisa" };

  return { ok: true, plan: { familyName: ad } };
}

export const CLAIM_MESSAGES: Readonly<Record<ClaimError, string>> = {
  "misafir-degil": "Bu hesap zaten sahiplenilmiş.",
  "ad-kisa": "Ağaç adı en az 2 karakter olmalı.",
  "ad-dolu": "Bu adla zaten bir hesap var.",
  "sifre-kisa": "Şifre en az 6 karakter olmalı.",
};
