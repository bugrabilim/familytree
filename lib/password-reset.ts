import { canRecoverByEmail, type AccountEmailState } from "./account-email.ts";

/**
 * E-POSTAYLA ŞİFRE SIFIRLAMA (madde 51) — karar mantığı.
 *
 * ## Bugün ne var, neden yetmiyor
 *
 * Tek kurtarma yolu KURTARMA KODU: kayıt sırasında bir kez gösterilen 16
 * karakterlik dize. Kaybedilirse hesap kalıcı olarak gider — geri alınacak
 * hiçbir yol yok. Bu, ailesinin yüz yıllık kaydını tutan bir üründe kabul
 * edilebilir bir tek-nokta değil.
 *
 * ## Değişmez: doğrulanmamış adres kurtarma yolu DEĞİLDİR
 *
 * Kural `lib/account-email.ts`te tek yerde (`canRecoverByEmail`) ve burası
 * onu ÇAĞIRIYOR, kopyalamıyor. Kopyalasaydı iki tanım zamanla ayrışır ve
 * ayrışmanın bedeli "yabancı bir adrese sıfırlama bağlantısı göndermek"
 * olurdu.
 *
 * ## Jeton NEDEN AYRI bir alanda
 *
 * `emailTokenHash` zaten var ama o ADRES DOĞRULAMA jetonu. Aynı alanı burada
 * da kullanmak, doğrulama bağlantısını şifre sıfırlama bağlantısına çevirirdi:
 * adresini doğrulamak için gönderilen bir postayı ele geçiren biri, hesabın
 * şifresini de değiştirebilirdi. İki jetonun ömrü, anlamı ve yetkisi farklı;
 * alanları da ayrı (`resetTokenHash`).
 *
 * ## Süre neden daha kısa
 *
 * Adres doğrulama 24 saat; sıfırlama 1 saat. Sıfırlama jetonu HESABIN
 * KENDİSİNİ veriyor, doğrulama jetonu yalnız bir adresi bağlıyor. Yetkisi
 * büyük olanın penceresi dar olmalı.
 *
 * Saf ve bağımlılık-hafif — birim testi koşulabilsin.
 */

/** Sıfırlama jetonunun ömrü (dakika). */
export const RESET_TTL_MINUTES = 60;

export interface ResetTokenState {
  resetTokenHash?: string;
  resetTokenExpires?: string;
}

/** Hesabın sıfırlama için gereken tüm alanları. */
export type ResetAccount = AccountEmailState & ResetTokenState;

export type ResetRequestPlan =
  /** Bağlantı gönderilebilir. `email` hedef adres. */
  | { kind: "gonder"; email: string; expires: string }
  /** Gönderilemez — sebep YALNIZ günlük içindir, kullanıcıya söylenmez. */
  | { kind: "gonderme"; reason: "hesap-yok" | "adres-yok" | "dogrulanmamis" };

/**
 * Sıfırlama isteği ne yapmalı?
 *
 * ## Sebep neden kullanıcıya söylenmiyor
 *
 * Çağıran rota, hangi dal dönerse dönsün AYNI yanıtı vermek zorunda. "Bu
 * ağaç adı yok" ile "bu hesabın doğrulanmış adresi yok" farkı, dışarıdan
 * hangi aile adlarının kayıtlı olduğunu ve hangilerinin e-posta bağladığını
 * sayan bir kâhin olurdu. `reason` yalnız sunucu günlüğü için var.
 *
 * Aynı hata bu depoda bir kez yapılmıştı: sıfırlama ucu "hesap yok" ve "kod
 * yanlış" için ayrı yanıt veriyordu.
 */
export function planResetRequest(
  account: ResetAccount | null | undefined,
  now: Date
): ResetRequestPlan {
  if (!account) return { kind: "gonderme", reason: "hesap-yok" };

  const adres = account.authEmail?.trim() ?? "";
  if (!adres) return { kind: "gonderme", reason: "adres-yok" };

  // TEK KAPI: doğrulanmamış ya da sentetik adres kurtarma yolu değildir.
  if (!canRecoverByEmail(account)) return { kind: "gonderme", reason: "dogrulanmamis" };

  return {
    kind: "gonder",
    email: adres,
    expires: new Date(now.getTime() + RESET_TTL_MINUTES * 60_000).toISOString(),
  };
}

export type ResetTokenCheck =
  | { ok: true }
  | { ok: false; reason: "jeton-yok" | "suresi-dolmus" | "eslesmiyor" };

/**
 * Sunulan jeton geçerli mi?
 *
 * `presentedHash` çağıranın hesapladığı özet — ham jeton buraya HİÇ girmiyor,
 * böylece bu saf işlev bir sır taşımıyor ve günlüğe düşse bile bir şey
 * sızdırmıyor.
 *
 * Süre denetimi `>=` ile: tam sınırdaki jeton geçersiz sayılır. Bir saniyelik
 * belirsizlikte güvenli taraf "reddet".
 */
export function checkResetToken(
  account: ResetAccount | null | undefined,
  presentedHash: string,
  now: Date
): ResetTokenCheck {
  const saklanan = account?.resetTokenHash;
  const sonaErer = account?.resetTokenExpires;
  if (!saklanan || !sonaErer) return { ok: false, reason: "jeton-yok" };

  if (now.getTime() >= new Date(sonaErer).getTime())
    return { ok: false, reason: "suresi-dolmus" };

  /*
   * Özet karşılaştırması: uzunluk farklıysa erken çık, aksi hâlde SABİT
   * SÜREDE karşılaştır. Erken dönen bir karşılaştırma, doğru öneki tahmin
   * eden saldırgana zamanlama üzerinden geri bildirim verir.
   */
  if (saklanan.length !== presentedHash.length) return { ok: false, reason: "eslesmiyor" };
  let fark = 0;
  for (let i = 0; i < saklanan.length; i++) fark |= saklanan.charCodeAt(i) ^ presentedHash.charCodeAt(i);
  return fark === 0 ? { ok: true } : { ok: false, reason: "eslesmiyor" };
}

/**
 * Sıfırlama sonrası jeton alanlarının alacağı değer — TEK KULLANIM.
 *
 * Jeton kullanıldıktan sonra düşmezse, aynı bağlantı postada durduğu sürece
 * hesabı tekrar tekrar ele geçirmeye yarar. Şifre değiştiği anda bekleyen
 * jeton da anlamını yitirir.
 */
export function clearedResetToken(): Required<ResetTokenState> {
  return { resetTokenHash: "", resetTokenExpires: "" };
}
