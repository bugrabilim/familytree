import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * GELEN WEBHOOK İMZASI (Svix biçimi — Resend bunu kullanıyor).
 *
 * ## Neden imza şart
 *
 * Gelen posta ucu, tanımı gereği OTURUMSUZ ve herkese açık: posta sunucusu
 * bize oturum açamaz. İmza olmasaydı, adresi bilen herkes bize istediği
 * "gelen posta"yı uydurabilirdi — sahte gönderen, sahte içerik, sahte
 * konu. Yani gelen kutusu bir yazma yüzeyine dönerdi ve orada okunan her
 * şey uydurma olabilirdi.
 *
 * ## Şema
 *
 * İmzalanan metin `${id}.${timestamp}.${body}` ve anahtar `whsec_` önekinden
 * sonraki base64 çözülmüş hâli. Başlık birden çok imza taşıyabilir
 * (`v1,<b64> v1,<b64>`) çünkü sağlayıcı anahtar döndürürken bir süre ikisini
 * birden gönderiyor; hepsi denenmeli, yoksa döndürme anında sessizce her şey
 * reddedilirdi.
 *
 * ## Başlık adları İKİ yazımda
 *
 * Bu şemanın eski adı `svix-id` / `svix-timestamp` / `svix-signature`;
 * standartlaşmış hâli (Standard Webhooks) ise `webhook-id` /
 * `webhook-timestamp` / `webhook-signature`. Sağlayıcıya göre biri, öbürü
 * ya da ikisi birden geliyor.
 *
 * Yalnız `svix-*` okumak GERÇEK bir hataya yol açtı: Resend `webhook-*`
 * gönderiyor, üç başlık da `null` okunuyordu, doğrulama "başlık eksik" deyip
 * 401 dönüyordu ve gelen kutusu sessizce boş kalıyordu. İkisi de kabul
 * ediliyor; `readHeaders` bu yüzden var.
 *
 * ## Zaman penceresi
 *
 * Eski bir isteğin TEKRAR oynatılmasını engelliyor: imza sonsuza dek geçerli
 * olsaydı, bir kez ele geçen geçerli istek istendiği zaman yeniden
 * gönderilebilirdi.
 *
 * Saf ve bağımlılıksız (yalnız `node:crypto`) — birim testi koşulabilsin.
 */

/** İsteğin ne kadar eski/ileri olabileceği (saniye). */
export const TOLERANCE_SECONDS = 5 * 60;

export type VerifyFail =
  | "yapilandirilmamis"
  | "baslik-eksik"
  | "zaman-gecersiz"
  | "zaman-disi"
  | "imza-uymuyor";

/**
 * İsteğin başlıklarından imza üçlüsünü okur — iki yazımı da deneyerek.
 *
 * `svix-*` önce çünkü ikisi birden gelen kurulumlarda o eski ad hep dolu
 * oluyor; boşsa standart ada düşülüyor.
 */
export function readHeaders(h: { get(name: string): string | null }): SignatureHeaders {
  const al = (a: string, b: string) => h.get(a) ?? h.get(b);
  return {
    id: al("svix-id", "webhook-id"),
    timestamp: al("svix-timestamp", "webhook-timestamp"),
    signature: al("svix-signature", "webhook-signature"),
  };
}

export interface SignatureHeaders {
  id?: string | null;
  timestamp?: string | null;
  signature?: string | null;
}

/** `whsec_` önekli sırrı ham anahtara çevirir. Önek yoksa metin olduğu gibi. */
export function secretKey(secret: string): Buffer {
  const s = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  return Buffer.from(s, "base64");
}

export function expectedSignature(secret: string, id: string, timestamp: string, body: string): string {
  return createHmac("sha256", secretKey(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

const esit = (a: string, b: string): boolean => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
};

/**
 * İmzayı doğrular. Sır YOKSA "yapılandırılmamış" döner — çağıran isteği
 * REDDETMELİ.
 *
 * Sır yokluğunda "doğrulamayı atla" davranışı bu depoda bir kez yaşandı ve
 * pahalıya mal oldu: `CRON_SECRET` tanımsızken günlük iş denetimsiz kalmıştı
 * ve herkes bütün hesaplara posta gönderten işi tetikleyebiliyordu. Kural
 * artık tek: yapılandırma eksikse KAPALI düşülür.
 */
export function verifyWebhook(
  secret: string | undefined,
  headers: SignatureHeaders,
  body: string,
  now: Date
): { ok: true } | { ok: false; error: VerifyFail } {
  if (!secret?.trim()) return { ok: false, error: "yapilandirilmamis" };

  const id = headers.id?.trim();
  const ts = headers.timestamp?.trim();
  const sig = headers.signature?.trim();
  if (!id || !ts || !sig) return { ok: false, error: "baslik-eksik" };

  const saniye = Number(ts);
  if (!Number.isFinite(saniye)) return { ok: false, error: "zaman-gecersiz" };
  const fark = Math.abs(now.getTime() / 1000 - saniye);
  if (fark > TOLERANCE_SECONDS) return { ok: false, error: "zaman-disi" };

  const beklenen = expectedSignature(secret, id, ts, body);
  /*
   * Başlıktaki HER imza deneniyor. Sağlayıcı anahtar döndürürken bir süre
   * eski ve yeni imzayı birlikte gönderiyor; yalnız ilkine bakmak, döndürme
   * anında her isteği reddetmek olurdu.
   */
  for (const parca of sig.split(" ")) {
    const [surum, deger] = parca.split(",");
    if (surum !== "v1" || !deger) continue;
    if (esit(deger, beklenen)) return { ok: true };
  }
  return { ok: false, error: "imza-uymuyor" };
}
