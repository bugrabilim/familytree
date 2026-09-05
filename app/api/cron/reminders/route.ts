import { NextRequest, NextResponse } from "next/server";
import { getUsersData } from "@/lib/users";
import { getFamilyData } from "@/lib/blob";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { todaysReminders, remindersToText } from "@/lib/reminders";
import { renderEmail } from "@/lib/email-template";
import { todaysMemorialNotices, memorialNoticesToText } from "@/lib/memorial-notify";
import { buildNewsletter, newsletterToLines, shouldSend } from "@/lib/newsletter";
import { getHistorySnapshot, listHistorySnapshots } from "@/lib/history";

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
  let newsletters = 0;

  /*
   * BÜLTEN NEDEN AYRI BİR CRON DEĞİL
   *
   * Vercel Hobby planında proje başına cron sayısı sınırlı ve bugün ikisi de
   * dolu (`reminders`, `backup`). Aylık bülten yeni bir iş olarak eklenemezdi;
   * bu yüzden GÜNLÜK iş ayın ilk günü ek olarak bülteni de gönderiyor.
   * Zamanlama sayısı değil, işin içindeki koşul değişiyor.
   */
  const ayinIlkGunu = today.getDate() === 1;

  /** "YYYY-MM-DD" (yerel) — `lib/newsletter.ts` dönemi bu biçimde bekliyor. */
  const gun = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  try {
    const { users } = await getUsersData();
    for (const u of users) {
      const gunluk = !!u.notifyEmail && (!!u.notifyReminders || !!u.notifyMemorials);
      const bultenGunu = !!u.notifyEmail && !!u.notifyNewsletter && ayinIlkGunu;
      if (!gunluk && !bultenGunu) continue;
      considered++;
      try {
        const { people } = await getFamilyData(u.id);

        /*
         * BÜLTEN — geçen ay. Kendi onayı var (`notifyNewsletter`), çünkü
         * aylık özet ile günlük hatırlatma farklı şeyler.
         */
        if (bultenGunu) {
          const bas = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const bit = new Date(today.getFullYear(), today.getMonth(), 0);
          /*
           * "Eklenenler" bölümü için dönem BAŞINDAKİ liste gerekiyor. En yeni
           * ama dönemden ÖNCEKİ anlık görüntüyü arıyoruz; yoksa bölüm `null`
           * kalıyor — `lib/report-card.ts`teki kural: geçmiş yoksa uydurma bir
           * sayı göstermektense hiç göstermemek.
           */
          let before: Awaited<ReturnType<typeof getHistorySnapshot>> = null;
          try {
            const damgalar = await listHistorySnapshots(u.id);
            const onceki = damgalar
              .filter((h) => h.at < bas.toISOString())
              .sort((a, b) => (a.at < b.at ? 1 : -1))[0];
            if (onceki) before = await getHistorySnapshot(u.id, onceki.id);
          } catch {
            /* geçmiş okunamadıysa bülten yine gider, "eklenenler" bölümü olmaz */
          }

          const b = buildNewsletter(people, {
            from: gun(bas),
            to: gun(bit),
            ...(before ? { before } : {}),
          });
          if (shouldSend(b)) {
            const satirlar = newsletterToLines(b, "tr");
            const { html, text } = renderEmail({
              title: "Aile bülteni",
              intro: `${b.from} – ${b.to} arası ağacında olup bitenler.`,
              items: satirlar,
              footer: "Bu e-postayı, aylık bülteni açtığın için alıyorsun. Ayarlar'dan kapatabilirsin.",
            });
            const r = await sendEmail({
              to: u.notifyEmail!,
              subject: "🌳 Aile bülteni",
              text,
              html,
            });
            if (r.sent) newsletters++;
          }
        }

        if (!gunluk) continue;

        /*
         * GÜNLÜK — hatırlatma ve anma TEK postada. İkisi de "bugün" ile ilgili;
         * ayrı ayrı göndermek aynı sabah iki posta demek olurdu. Onaylar ayrı
         * olduğu için içerik de onaya göre kuruluyor.
         */
        const items = u.notifyReminders ? todaysReminders(people, today) : [];
        const anmalar = u.notifyMemorials ? todaysMemorialNotices(people, today) : [];
        if (items.length === 0 && anmalar.length === 0) continue;
        /*
         * Ortak markalı şablon. Buradaki HTML elle örülüydü ve kaçış da elle
         * yapılıyordu (`.replace(/</g, "&lt;")`) — yalnız `<` kaçıyordu, `&`
         * ve `"` kaçmıyordu. Kişi adından gelen bir `&` bozuk görünüm, bir
         * `"` ise öznitelik sınırını taşırma riski demekti. Şablon kaçışı tek
         * yerde ve tam yapıyor.
         */
        const satirlar = [
          ...items.map((i) => remindersToText([i], "tr")),
          ...anmalar.map((a) => memorialNoticesToText([a], "tr")),
        ];
        const { html, text } = renderEmail({
          title: "Bugün ailende",
          items: satirlar,
          footer: "Bu e-postayı, bildirimleri açtığın için alıyorsun. Ayarlar'dan kapatabilirsin.",
        });
        const r = await sendEmail({
          to: u.notifyEmail!,
          subject: `🌳 Bugün ailende (${satirlar.length})`,
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

  return NextResponse.json({ ok: true, considered, sent, newsletters });
}
