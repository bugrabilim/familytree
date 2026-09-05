/**
 * Sağlayıcıdan bağımsız e-posta gönderimi (#3/#4). Şu an Resend REST API'sini
 * kullanır; `RESEND_API_KEY` ve `EMAIL_FROM` ortam değişkenleri YOKSA hiçbir şey
 * göndermez (no-op) ve `{ sent:false, reason:"not-configured" }` döner —
 * geliştirmede ve anahtar eklenene dek güvenli. Başka bir sağlayıcıya geçmek
 * için yalnız bu dosyayı değiştirmek yeter.
 *
 * Kurulum (kullanıcı): Resend hesabı → alan adını (ör. soylus.com) doğrula →
 * RESEND_API_KEY ve EMAIL_FROM (ör. "Soylus <bilgi@soylus.com>") Vercel ortam
 * değişkenlerine ekle. Ayrıntı: docs/EPOSTA-PLANI.md.
 */

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /**
   * Yanıtların gideceği adres. Verilmezse `EMAIL_REPLY_TO` kullanılır.
   *
   * Bu alan olmadan yanıtlar `EMAIL_FROM` adresine gidiyordu ve o adresin bir
   * POSTA KUTUSU OLMAK ZORUNDA DEĞİL: gönderen alan adını doğrulamak yalnız
   * göndermeye yetki verir, gelen postayı kimse almaz. Yani aile üyesi
   * hatırlatmaya "annemin doğum tarihi yanlış" diye yanıt verdiğinde o posta
   * hiçbir yere ulaşmıyordu — sessizce kaybolan bir geri bildirim kanalı.
   */
  replyTo?: string;
}

export type SendResult =
  | { sent: true; id?: string }
  | { sent: false; reason: "not-configured" | "error"; error?: string };

/** E-posta gönderimi yapılandırılmış mı? (anahtar + gönderen adresi var mı) */
export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Yanıtların okunacağı adres var mı?
 *
 * Yoksa gönderim yine çalışır ama yanıtlar kaybolur; arayüz/belge bunu
 * söyleyebilsin diye ayrı sorulabiliyor.
 */
export function replyAddress(): string | null {
  return process.env.EMAIL_REPLY_TO?.trim() || null;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { sent: false, reason: "not-configured" };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        // Yanıt adresi: çağıran belirtmediyse ortam değişkeninden.
        ...(() => {
          const r = input.replyTo?.trim() || replyAddress();
          return r ? { reply_to: r } : {};
        })(),
        subject: input.subject,
        ...(input.html ? { html: input.html } : {}),
        ...(input.text ? { text: input.text } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, reason: "error", error: `${res.status} ${detail}`.slice(0, 300) };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: data?.id };
  } catch (e) {
    return { sent: false, reason: "error", error: (e as Error).message };
  }
}
