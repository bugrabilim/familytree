import { NextRequest, NextResponse } from "next/server";
import { getUsersData } from "@/lib/users";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { todaysReminders, remindersToText } from "@/lib/reminders";
import { renderEmail } from "@/lib/email-template";
import { todaysMemorialNotices, memorialNoticesToText } from "@/lib/memorial-notify";
import { buildNewsletter, newsletterToLines, shouldSend } from "@/lib/newsletter";
import { getHistorySnapshot, listHistorySnapshots } from "@/lib/history";
import { canEmailContact, planAsk } from "@/lib/contact-consent";
import { isUnsubConfigured, makeAskToken, makeUnsubToken } from "@/lib/contact-token";
import { stripPrivateFields } from "@/lib/privacy";
import { SITE_URL } from "@/lib/site";

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

  /*
   * ── AĞAÇTAKİ KİŞİLERE (madde 47/48) ────────────────────────────────────
   *
   * Yukarıdaki döngü HESAP SAHİBİNE yazıyor; bu döngü ağacın içindeki
   * kişilere. Ayrı olmasının sebebi onayların ayrı olması: hesap sahibi
   * bildirimleri kapatmış olabilir ama teyzesi kendi adresi için onay vermiş
   * olabilir — biri öbürünü susturmamalı.
   */
  let asked = 0;
  let contacted = 0;
  /*
   * Çıkış jetonu ÜRETİLEMİYORSA hiç gönderilmiyor. Abonelikten çıkma
   * bağlantısı olmayan bir bildirim postası, onayı tek yönlü bir kapıya
   * çevirir: onay veren biri fikrini değiştirmek istediğinde yapabileceği
   * hiçbir şey kalmaz — uygulamada hesabı yok.
   */
  if (isUnsubConfigured()) {
    try {
      const { users } = await getUsersData();
      for (const u of users) {
        try {
          const data = await getFamilyData(u.id, { skipCache: true });

          /*
           * ÜÇÜNCÜ KİŞİYE giden içerik gizlilik süzgecinden GEÇİYOR. Hesap
           * sahibi kendi verisini görüyor; ağacın içindeki bir akraba ise
           * yalnız bir alıcı. `confidential` kayıt mutlak dışlanıyor, kalan
           * herkes alan-bazlı gizliliğin süzgecinden geçiyor —
           * `lib/memorial-notify.ts`teki kuralın aynısı, ve `todaysReminders`
           * kendi başına böyle bir süzgeç uygulamıyor.
           */
          const gorunur = data.people.filter((p) => !p.confidential).map(stripPrivateFields);
          const gunun = [
            ...todaysReminders(gorunur, today).map((i) => remindersToText([i], "tr")),
            ...todaysMemorialNotices(data.people, today).map((a) => memorialNoticesToText([a], "tr")),
          ];

          /*
           * Değişiklikler ÖNCE toplanıyor, sonra tek seferde yazılıyor —
           * ve yazmadan hemen önce ağaç YENİDEN okunuyor (aşağıya bakın).
           */
          const yeniJetonlar = new Map<string, { hash: string; askedAt: string }>();
          /*
           * Koşu başına ağaç başına SORU TAVANI. Bir kerede yüzlerce adres
           * içe aktarılırsa (bir dosyadan, bir eşleştirmeden) tavan olmadan
           * tek gecede yüzlerce soru postası giderdi — teknik olarak hepsi
           * "izin isteme" ama pratikte toplu posta. Kalanlar yarın sorulur.
           */
          let kalanSoru = 25;

          for (let i = 0; i < data.people.length; i++) {
            const kisi = data.people[i];

            /* 1) Onay sorusu — henüz sorulmamış ya da süresi geçmiş adreslere. */
            const plan = planAsk(kisi, today);
            if (plan.kind === "sor") {
              if (kalanSoru <= 0) continue;
              const { token, hash } = makeAskToken({ treeId: u.id, personId: kisi.id });
              const { html, text } = renderEmail({
                title: "Sana bir soru var",
                intro: `${kisi.lastName} ailesinin soy ağacında ${kisi.firstName} olarak yer alıyorsun. Ağacı tutan kişi, aile içindeki günleri sana e-postayla hatırlatmak istiyor.`,
                button: { label: "Yanıtla", url: `${SITE_URL}/contact/${token}` },
                note: "Yanıt vermezsen hiçbir posta gönderilmez ve bir daha sorulmaz. Hiçbir şey yapmamak da geçerli bir yanıt.",
                footer: "Bu tek seferlik bir sorudur. Adresin kimseyle paylaşılmaz.",
              });
              const r = await sendEmail({ to: plan.email, subject: "🌳 Sana bir soru var", html, text });
              /*
               * İŞARET YALNIZ GÖNDERİM BAŞARILIYSA konuyor. Önce konsaydı,
               * başarısız bir gönderim kişiyi otuz gün boyunca "soruldu"
               * sayardı ve o kişi hiç görmediği bir soruya yanıt veremediği
               * için sessizce listeden düşerdi.
               *
               * Kayıt en sonda toplu yazılıyor; yazma başarısız olursa jeton
               * özeti de kaydedilmemiş olur, yani gönderilen bağlantı
               * çalışmaz — ama `contactAskedAt` da yazılmadığı için yarın
               * ÇALIŞAN yeni bir bağlantıyla yeniden sorulur. Güvenli yön bu.
               */
              if (r.sent) {
                yeniJetonlar.set(kisi.id, { hash, askedAt: today.toISOString() });
                asked++;
                kalanSoru--;
              }
              continue;
            }

            /* 2) Günün bildirimleri — YALNIZ onay vermiş kişiye. */
            if (!canEmailContact(kisi)) continue;
            if (gunun.length === 0) continue;
            const unsub = makeUnsubToken({ treeId: u.id, personId: kisi.id });
            if (!unsub) continue;
            const { html, text } = renderEmail({
              title: "Bugün ailende",
              items: gunun,
              button: { label: "Postaları durdur", url: `${SITE_URL}/contact/cikis/${unsub}` },
              footer:
                "Bu postayı, adresine gönderilen soruyu onayladığın için alıyorsun. İstemediğinde yukarıdaki bağlantıyla tek tıkla durdurabilirsin.",
            });
            const r = await sendEmail({
              to: kisi.contactEmail!,
              subject: `🌳 Bugün ailende (${gunun.length})`,
              html,
              text,
            });
            if (r.sent) contacted++;
          }

          /*
           * YAZMADAN ÖNCE YENİDEN OKU — bu işin iyimser kilidi bu.
           *
           * Rotanın bir isteği yok, dolayısıyla `x-base-version` başlığı da
           * yok; `versionMismatch` burada uygulanamaz. Ama tehlike gerçek:
           * yukarıdaki döngü onlarca posta gönderiyor ve dakikalar sürebilir.
           * Başta okunan `data` olduğu gibi geri yazılsaydı, o dakikalarda
           * ağacına kişi ekleyen bir kullanıcının işi sessizce silinirdi.
           *
           * Bu yüzden taze kopya okunuyor ve üstüne YALNIZ bu işin ürettiği
           * alanlar (jeton özeti ve sorma anı) konuyor. Arada silinmiş bir
           * kişi varsa atlanıyor: silinen kişi geri gelmemeli.
           */
          if (yeniJetonlar.size > 0) {
            const taze = await getFamilyData(u.id, { skipCache: true });
            let yazilacak = false;
            for (const [id, v] of yeniJetonlar) {
              const j = taze.people.findIndex((p) => p.id === id);
              if (j === -1) continue;
              taze.people[j] = {
                ...taze.people[j],
                contactTokenHash: v.hash,
                contactAskedAt: v.askedAt,
              };
              yazilacak = true;
            }
            if (yazilacak) await saveFamilyData(u.id, taze);
          }
        } catch {
          /* tek ağaç hatası tüm işi durdurmasın */
        }
      }
    } catch {
      /* kullanıcı listesi okunamadıysa hesap sahibi postaları yine gitti */
    }
  }

  return NextResponse.json({ ok: true, considered, sent, newsletters, asked, contacted });
}
