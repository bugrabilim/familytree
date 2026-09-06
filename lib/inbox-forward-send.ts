import "server-only";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { forwardTargets, planForward } from "@/lib/inbox-forward";
import { SITE_URL } from "@/lib/site";
import type { ForwardState, Mail } from "@/lib/inbox";

/**
 * İLETME — ortam değişkenleri + gönderim. Karar `lib/inbox-forward.ts`te.
 *
 * Bu dosya bilerek ince: içinde denenmeye değer bir kural yok, yalnız saf
 * plan katmanıyla gönderim sağlayıcısını birleştiriyor. Kurallar (döngü
 * denetimi, gövde bloğu, adres ayrıştırma) orada ve orada birim testi var —
 * buradaki `server-only` ve `@/` içe aktarımları test koşmayı imkânsız
 * kılıyor.
 */

/** İletilecek adresler tanımlı mı? (ekranın "kapalı" demesi için) */
export function forwardConfigured(): boolean {
  return forwardTargets(process.env.INBOX_FORWARD_TO).length > 0;
}

/**
 * Postayı işletmecinin kendi adresine iletir; sonucu döndürür.
 *
 * FIRLATMIYOR. Çağıranların ikisi de (webhook ve ekrandaki yeniden deneme)
 * iletmeyi EN İYİ ÇABA olarak yapıyor: iletme başarısız diye webhook 500
 * dönseydi sağlayıcı yeniden dener ve posta hiç saklanmazdı. Posta zaten
 * kutuda; iletme onun bildirimi.
 */
export async function forwardIncoming(mail: Mail): Promise<ForwardState> {
  const hedefler = forwardTargets(process.env.INBOX_FORWARD_TO);
  const kendi = [process.env.EMAIL_FROM ?? "", process.env.EMAIL_REPLY_TO ?? ""];
  const karar = planForward(mail, hedefler, kendi, SITE_URL);
  if (!karar.ilet) return karar.state;
  if (!isEmailConfigured()) return "hata";

  const r = await sendEmail({
    to: karar.plan.to,
    subject: karar.plan.subject,
    /*
     * YALNIZ `text`. Gelen postanın gövdesi yabancının yazdığı içerik;
     * HTML olarak paketlemek, onun işaretlemesini kendi adımızdan
     * göndermek olurdu. `lib/inbox.ts`teki kararın devamı.
     */
    text: karar.plan.text,
    replyTo: karar.plan.replyTo,
    fromName: karar.plan.fromName,
  });
  if (!r.sent) {
    console.warn(`[gelen-posta] iletilemedi (${"error" in r ? r.error : r.reason}) — ${mail.id}`);
    return "hata";
  }
  return "gonderildi";
}
