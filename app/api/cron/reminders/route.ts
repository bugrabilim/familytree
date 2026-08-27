import { NextRequest, NextResponse } from "next/server";
import { getUsersData } from "@/lib/users";
import { getFamilyData } from "@/lib/blob";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { todaysReminders, remindersToText } from "@/lib/reminders";

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
  if (secret && auth !== `Bearer ${secret}`) {
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
        const text = remindersToText(items, "tr");
        const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6">
<h2 style="margin:0 0 8px">Bugünün aile hatırlatmaları</h2>
<ul style="padding-left:18px;margin:0">${items
          .map((i) => `<li>${remindersToText([i], "tr").replace(/</g, "&lt;")}</li>`)
          .join("")}</ul>
<p style="color:#888;font-size:12px;margin-top:16px">Bu e-postayı, hatırlatmaları açtığın için alıyorsun. Ayarlar'dan kapatabilirsin.</p>
</div>`;
        const r = await sendEmail({
          to: u.notifyEmail,
          subject: `🌳 Bugünün aile hatırlatmaları (${items.length})`,
          text: `Bugünün aile hatırlatmaları:\n\n${text}\n\nAyarlar'dan kapatabilirsin.`,
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
