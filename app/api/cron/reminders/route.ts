import { NextRequest, NextResponse } from "next/server";
import { getUsersData } from "@/lib/users";
import { getFamilyData } from "@/lib/blob";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { todaysReminders, remindersToText } from "@/lib/reminders";
import { renderEmail } from "@/lib/email-template";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Günlük hatırlatma işi (#3) — Vercel Cron her gün çağırır. O gün olan
 * doğum günü / ölüm yıl dönümü / evlilik yıl dönümü olaylarını bulur ve
 * hatırlatmayı açmış (opt-in) hesap sahiplerine e-posta gönderir.
 *
 * Güvenlik: `CRON_SECRET` ile korunur (Vercel cron `Authorization: Bearer
 * <CRON_SECRET>` gönderir). E-posta yapılandırılmamışsa (anahtar yok) hiçbir
 * şey göndermez, no-op döner.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  /*
   * KAPALI DÜŞÜYOR. Eskiden koşul `secret && …` idi, yani `CRON_SECRET`
   * tanımsızken denetimin TAMAMI atlanıyordu — ve `.env.local.example`de o
   * değişken yorum satırında, yani tanımsız olması varsayılan durum.
   * Sonuç: bu rotanın hiçbir oturum denetimi olmadığı için, herhangi biri
   * `Bearer x` ile çağırıp BÜTÜN hesaplara posta gönderten günlük işi
   * istediği zaman tetikleyebiliyordu.
   */
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true, skipped: "email-not-configured" });
  }

  const today = new Date();
  let sent = 0;
  let considered = 0;

  try {
    const { users } = await getUsersData();
    for (const u of users) {
      if (!u.notifyReminders || !u.notifyEmail) continue;
      considered++;
      try {
        const { people } = await getFamilyData(u.id);
        const items = todaysReminders(people, today);
        if (items.length === 0) continue;
        /*
         * Ortak markalı şablon. Buradaki HTML elle örülüydü ve kaçış da elle
         * yapılıyordu (`.replace(/</g, "&lt;")`) — yalnız `<` kaçıyordu, `&`
         * ve `"` kaçmıyordu. Kişi adından gelen bir `&` bozuk görünüm, bir
         * `"` ise öznitelik sınırını taşırma riski demekti. Şablon kaçışı tek
         * yerde ve tam yapıyor.
         */
        const { html, text } = renderEmail({
          title: "Bugünün aile hatırlatmaları",
          items: items.map((i) => remindersToText([i], "tr")),
          footer: "Bu e-postayı, hatırlatmaları açtığın için alıyorsun. Ayarlar'dan kapatabilirsin.",
        });
        const r = await sendEmail({
          to: u.notifyEmail,
          subject: `🌳 Bugünün aile hatırlatmaları (${items.length})`,
          text,
          html,
        });
        if (r.sent) sent++;
      } catch {
        /* tek hesap hatası tüm işi durdurmasın */
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, considered, sent });
}
