/**
 * AĞAÇTAKİ KİŞİYE E-POSTA — ÇİFT ONAY (madde 47/48'in uzantısı).
 *
 * ## Buradaki asıl mesele: adresin sahibi kullanıcı DEĞİL
 *
 * Bu depodaki öbür e-posta alanları hesabın KENDİ adresi: `authEmail` (kimlik)
 * ve `notifyEmail` (bildirim). İkisini de hesabın sahibi kendisi yazıyor ve
 * kendisi için onay veriyor.
 *
 * Burada ise bir kullanıcı BAŞKASININ adresini giriyor — teyzesinin,
 * kuzeninin. O kişi uygulamayı hiç görmemiş olabilir, kaydedildiğinden
 * haberi olmayabilir. Onun adına onay verilemez. Bu yüzden tek kural şu:
 *
 *   **Adres girilmesi izin DEĞİLDİR. İzin, adresin sahibinin kendi
 *   tıklamasıdır.**
 *
 * ## Çift onay ne demek
 *
 * Adres girilince o kişiye TEK bir posta gider: "Şu aile seni ağacına ekledi
 * ve hatırlatma göndermek istiyor — onaylıyor musun?" İki bağlantı taşır:
 * onayla ve reddet. Tıklanmazsa hiçbir şey gönderilmez ve tekrar sorulmaz.
 *
 * Sessizliği onay saymamak bu tasarımın belkemiği: sessizlik "görmedim",
 * "istemiyorum" ya da "adres yanlış" demek olabilir. Üçünde de doğru davranış
 * susmaktır.
 *
 * ## Neden abonelikten çıkma her postada
 *
 * Onay vermiş biri fikrini değiştirebilir ve bunun için uygulamaya girmesi,
 * hesap açması beklenemez — hesabı yok. Her postada tek tıkla çıkış olmalı;
 * yoksa onay tek yönlü bir kapı olur.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

/** Onay durumu. Yokluğu "hiç sorulmadı" demek. */
export type ConsentState =
  /** Adres girildi, doğrulama postası gönderildi, yanıt bekleniyor. */
  | "bekliyor"
  /** Kişi kendi tıklamasıyla onayladı — TEK gönderim yetkisi bu. */
  | "onayli"
  /** Kişi reddetti ya da abonelikten çıktı. */
  | "red";

export interface ContactConsent {
  /** Girilen adres (normalleştirilmiş). */
  contactEmail?: string;
  contactConsent?: ConsentState;
  /** Bekleyen onay jetonunun ÖZETİ. Ham jeton yalnız bağlantıda. */
  contactTokenHash?: string;
  /** Onay isteğinin gönderildiği an (ISO) — tekrar sormayı engellemek için. */
  contactAskedAt?: string;
}

/* ── Adres ────────────────────────────────────────────────────────────────── */

/**
 * Karşılaştırma/saklama için normalleştirir. Geçersizse `null`.
 *
 * `lib/account-email.ts`teki `normalizeEmail` ile aynı kurallar ve aynı
 * Türkçe tuzağı: `toLowerCase()` Türkçe yerelde "I"yı "ı" yapar ve
 * "ALI@x.com" adresi "alı@x.com"a döner. Kopyalanmasının nedeni bağımsızlık:
 * o dosya hesabın kimliğiyle ilgili, bu dosya üçüncü kişilerle; birinin
 * kuralı değişirse öbürünü sürüklememeli.
 */
export function normalizeContact(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLocaleLowerCase("en");
  if (!s || s.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  if (s.includes("..")) return null;
  return s;
}

/* ── TEK KAPI: posta gönderilebilir mi ───────────────────────────────────── */

/**
 * Bu kişiye bildirim gönderilebilir mi?
 *
 * Bütün gönderim yolları (hatırlatma, anma, bülten) BURADAN geçmeli. Tek
 * kapı olmasının nedeni, kuralın çoğalmaması: üç ayrı yerde "onaylı mı"
 * denetimi yazılsaydı biri unutulduğunda onay vermemiş birine posta giderdi
 * ve bunu kimse fark etmezdi.
 */
export function canEmailContact(c: ContactConsent): boolean {
  const adres = c.contactEmail?.trim();
  if (!adres) return false;
  return c.contactConsent === "onayli";
}

/* ── Adres değişikliği ────────────────────────────────────────────────────── */

export type ContactChange =
  | { kind: "degismedi" }
  | { kind: "temizle" }
  /** Yeni adres — onay SIFIRLANIR, yeniden sorulur. */
  | { kind: "ayarla"; email: string }
  | { kind: "gecersiz" };

/**
 * Gelen değerin ne anlama geldiğini söyler.
 *
 * `""`/`null` temizler (deponun her yerindeki kural), `undefined` dokunmaz.
 */
export function planContactChange(current: ContactConsent, incoming: unknown): ContactChange {
  if (incoming === undefined) return { kind: "degismedi" };
  if (incoming === null || incoming === "") return { kind: "temizle" };

  const e = normalizeContact(incoming);
  if (!e) return { kind: "gecersiz" };

  const eski = current.contactEmail?.trim() ?? "";
  if (eski && eski === e) return { kind: "degismedi" };
  return { kind: "ayarla", email: e };
}

/**
 * Değişiklikten sonraki durum.
 *
 * ADRES DEĞİŞİRSE ONAY SIFIRLANIR. Yoksa şu olurdu: bir adres onaylanır,
 * sonra alan başka birinin adresiyle değiştirilir ve o kişi hiç onay
 * vermeden "onaylı" görünür. Aynı kural `lib/account-email.ts`te de var ve
 * orada da aynı sebeple.
 */
export function applyContactChange(
  change: ContactChange
): ContactConsent | null {
  switch (change.kind) {
    case "gecersiz":
    case "degismedi":
      return null;
    case "temizle":
      return {
        contactEmail: "",
        contactConsent: undefined,
        contactTokenHash: undefined,
        contactAskedAt: undefined,
      };
    case "ayarla":
      return {
        contactEmail: change.email,
        contactConsent: "bekliyor",
        contactTokenHash: undefined,
        contactAskedAt: undefined,
      };
  }
}

/* ── Onay isteği ──────────────────────────────────────────────────────────── */

/** Aynı adrese yeniden sormadan önce beklenecek süre (gün). */
export const REASK_DAYS = 30;

export type AskPlan =
  | { kind: "sor"; email: string }
  | { kind: "sorma"; reason: "adres-yok" | "zaten-onayli" | "reddetti" | "yakinda-soruldu" };

/**
 * Onay postası gönderilmeli mi?
 *
 * ## Reddedene BİR DAHA sorulmaz
 *
 * "Belki fikrini değiştirmiştir" diye tekrar sormak, reddi yok saymaktır.
 * Kişinin uygulamada hesabı yok; kendini savunmasının tek yolu o "reddet"
 * bağlantısıydı ve ona saygı gösterilmeli.
 *
 * ## Bekleyene de sık sorulmaz
 *
 * Yanıt vermemiş birine her gün hatırlatma göndermek, onay istemek değil
 * ısrar etmektir — ve tam olarak istenmeyen postanın tanımıdır. `REASK_DAYS`
 * geçmeden tekrar sorulmuyor.
 */
export function planAsk(c: ContactConsent, now: Date): AskPlan {
  const adres = c.contactEmail?.trim();
  if (!adres) return { kind: "sorma", reason: "adres-yok" };
  if (c.contactConsent === "onayli") return { kind: "sorma", reason: "zaten-onayli" };
  if (c.contactConsent === "red") return { kind: "sorma", reason: "reddetti" };

  if (c.contactAskedAt) {
    const gecen = now.getTime() - new Date(c.contactAskedAt).getTime();
    if (gecen < REASK_DAYS * 86_400_000) return { kind: "sorma", reason: "yakinda-soruldu" };
  }
  return { kind: "sor", email: adres };
}

/* ── Yanıt ────────────────────────────────────────────────────────────────── */

/**
 * Kişinin kendi tıklamasıyla verdiği karar.
 *
 * Jeton DÜŞÜYOR: bağlantı tek kullanımlık. Postada duran bir bağlantının
 * sonsuza dek onay/ret değiştirebilmesi, o postayı gören herkese o kişi
 * adına karar verme yetkisi vermek olurdu.
 */
export function applyAnswer(
  c: ContactConsent,
  answer: "onayla" | "reddet"
): ContactConsent {
  return {
    ...c,
    contactConsent: answer === "onayla" ? "onayli" : "red",
    contactTokenHash: undefined,
  };
}

/**
 * Abonelikten çıkma — her postadaki tek tıklık çıkış.
 *
 * Adres SİLİNMİYOR, "red" işaretleniyor. Silinseydi aynı adres yarın yeniden
 * girilip yeniden sorulabilirdi; kayıt kalınca "bu kişi istemedi" bilgisi de
 * kalıyor ve `planAsk` bir daha sormuyor.
 */
export function applyUnsubscribe(c: ContactConsent): ContactConsent {
  return { ...c, contactConsent: "red", contactTokenHash: undefined };
}
