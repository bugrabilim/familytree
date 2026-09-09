import { NextRequest, NextResponse } from "next/server";
import { listUsers } from "@/lib/users";
import { isSoftDeleted } from "@/lib/retention";
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
import { makeBudget, rotateForDay } from "@/lib/cron-budget";
import { issueWeekly, markWeeklySent, readSeries } from "@/lib/story-store";
import { planWeekly } from "@/lib/story-series";
import { promptKey, subjectFromPerson } from "@/lib/prompts";
import { translate } from "@/lib/i18n-dict";
import { fullName } from "@/lib/name";
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
 *
 * ## Süre bütçesi ve döndürme
 *
 * İki döngü de hesap sayısıyla büyüyor, işlevin ömrü ise sabit
 * (`maxDuration`). İlk hâlinde bütçe yoktu: gün gelip iş sığmadığında işlev
 * ORTADA kesiliyor, ve liste her koşuda aynı yerden başladığı için hep aynı
 * hesaplar işleniyordu — kuyruktakiler hatırlatmayı HİÇ almıyordu, üstelik
 * sessizce (iş 200 dönüyor, günlükte hiçbir şey yok).
 *
 * Şimdi `lib/cron-budget.ts`teki iki kural geçerli: liste günlük döndürülüyor
 * (sona kalanlar her gün değişiyor) ve bütçe dolunca döngü DÜZGÜN bitip
 * özetini yazıyor. Bütçe `maxDuration`ın altında; aradaki fark, özetin
 * yazılıp yanıtın dönmesi için.
 *
 * ## Günlük
 *
 * Her koşu tek satır yazıyor — "sıfır" ile "hiç koşmadı"yı ayırmanın tek
 * yolu bu. Bu iş kimsenin okumadığı bir yanıt döndürüyor; sessizce çalışmayı
 * bırakması, hiç fark edilmeyecek bir arıza türü.
 */

/** İşin harcayabileceği süre — `maxDuration` 60 sn, özete pay bırakılıyor. */
const BUDGET_MS = 50_000;

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

  /*
   * HAFTANIN GÜNÜ KAPISI — haftalık soru serisi neden bu GÜNLÜK işin içinde
   *
   * Bültenle birebir aynı gerekçe, bir kat yukarısı: Vercel Hobby planında
   * proje başına cron sayısı sınırlı ve iki yuva da dolu (`reminders`,
   * `backup`). "Haftalık" bir iş için üçüncü bir zamanlama YOK. Bu yüzden
   * kadans, zamanlamanın değil işin İÇİNDEKİ bir koşulun sorumluluğu:
   * günlük iş haftada bir kez (pazar) ek olarak seri postalarını da atıyor.
   *
   * Pazar seçildi: aile postasının en çok okunacağı gün ve `weekIndex`in
   * hafta sınırı perşembeye denk geldiği için ardışık iki pazar hiçbir zaman
   * aynı hafta numarasını taşımıyor — yani "haftada bir" gerçekten haftada
   * bir oluyor. Gün numarası sunucunun yerel saatinden (Vercel'de UTC).
   */
  const hikayeGunu = today.getDay() === 0;

  /** "YYYY-MM-DD" (yerel) — `lib/newsletter.ts` dönemi bu biçimde bekliyor. */
  const gun = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const butce = makeBudget(BUDGET_MS);
  /** Bütçe dolduğu için sıraya gelmeyen hesap sayısı — günlükte görünüyor. */
  let skipped = 0;

  try {
    const users = await listUsers();
    /*
     * DÖNDÜRÜLMÜŞ liste: kesilme her gün başka hesapları vurur (dosya başı).
     */
    const sira = rotateForDay(users, today);
    for (const u of sira) {
      if (butce.spent()) { skipped++; continue; }
      /*
       * SİLİNMEKTE OLAN HESABA POSTA GİTMEZ. Veri bekleme süresi boyunca
       * duruyor, yani hatırlatmalar hesaplanabilir hâlde — ama hesabını
       * silmiş birine doğum günü hatırlatması göndermek, silmenin
       * yapılmadığını söylemenin en gürültülü yolu olurdu.
       */
      if (isSoftDeleted(u)) continue;
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
  /** Bu koşuda gönderilen haftalık seri sorusu sayısı — günlükte görünüyor. */
  let weekly = 0;
  /*
   * Çıkış jetonu ÜRETİLEMİYORSA hiç gönderilmiyor. Abonelikten çıkma
   * bağlantısı olmayan bir bildirim postası, onayı tek yönlü bir kapıya
   * çevirir: onay veren biri fikrini değiştirmek istediğinde yapabileceği
   * hiçbir şey kalmaz — uygulamada hesabı yok.
   */
  if (isUnsubConfigured()) {
    try {
      const users = await listUsers();
      for (const u of rotateForDay(users, today)) {
        /*
         * SİLİNMEKTE OLAN HESABIN AĞACINA DOKUNULMAZ. Yukarıdaki döngüde bu
         * denetim baştan beri vardı, burada YOKTU — ve bu döngü daha ileri
         * gidiyor: hesap sahibine değil ÜÇÜNCÜ KİŞİLERE posta atıyor ve
         * jetonları yazmak için silinmekte olan ağaca YAZIYOR. Yani hesabını
         * silmiş birinin ağacındaki akrabalara, hesap bekleme süresindeyken
         * "sana bir soru var" postası gidiyordu; hesap kalıcı silindiğinde o
         * bağlantılar da ölüyordu. Silmenin en kötü yarım hâli.
         */
        if (isSoftDeleted(u)) continue;
        if (butce.spent()) { skipped++; continue; }
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

          /*
           * HAFTALIK SERİLER — ağaç başına TEK okuma ve yalnız pazar günü.
           *
           * Kişi döngüsünün içinde okunsaydı yüz kişilik bir ağaçta yüz blob
           * isteği olurdu; öbür altı gün hiç okunmuyor, çünkü o günlerde
           * `planWeekly` zaten hiçbir şey göndermeyecek.
           *
           * Okuma DÜŞERSE seri yok sayılıyor (boş liste): hikâye postasının
           * gitmemesi, günün hatırlatmalarını da durdurmayı hak etmiyor.
           */
          let seriler: Awaited<ReturnType<typeof readSeries>> = [];
          if (hikayeGunu) {
            try {
              seriler = await readSeries(u.id);
            } catch {
              /* seri okunamadı — bu ağaçta bu hafta soru gönderilmiyor */
            }
          }
          const seriOf = new Map(seriler.filter((s) => !s.closed).map((s) => [s.personId, s]));
          /*
           * Koşu başına ağaç başına HAFTALIK POSTA TAVANI — `kalanSoru`nun
           * eşi ve aynı gerekçe. `MAX_SERIES` deponun tavanı; bu, tek bir
           * koşunun tek bir ağaç için harcayabileceği posta sayısı.
           */
          let kalanHafta = 25;

          for (let i = 0; i < data.people.length; i++) {
            /*
             * İÇ DÖNGÜ DE bütçeye bakıyor: tek bir büyük ağaç (yüzlerce
             * adres) bütçenin tamamını yiyip sonraki hesapları aç bırakabilir.
             * Çıkış `break` — toplanan jetonlar aşağıda yine YAZILIYOR,
             * yoksa gönderilmiş sorular işaretlenmemiş kalırdı.
             */
            if (butce.spent()) break;
            const kisi = data.people[i];

            /* 1) Onay sorusu — henüz sorulmamış ya da süresi geçmiş adreslere. */
            const plan = planAsk(kisi);
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

            /*
             * 2) Günün bildirimleri — YALNIZ onay vermiş kişiye.
             *
             * `canEmailContact` TEK KAPI: aşağıdaki haftalık seri de bu
             * kapının ardında. Seri, `planAsk`ın tek seferlik onay sorusundan
             * farklı olarak TEKRARLAYAN bir posta; kendine ait yeni bir izin
             * kavramı uydurmak, onayı ikiye bölmek ve birini er geç unutmak
             * olurdu. İzin bir tane: adresin sahibinin kendi tıklaması.
             */
            if (!canEmailContact(kisi)) continue;
            /*
             * Çıkış bağlantısı ikisinin de ÖNKOŞULU, o yüzden burada bir kez
             * üretiliyor. Üretilemiyorsa bu kişiye hiçbir posta gitmiyor —
             * çıkışsız bir bildirim postası onayı tek yönlü kapıya çevirir.
             */
            const unsub = makeUnsubToken({ treeId: u.id, personId: kisi.id });
            if (!unsub) continue;

            if (gunun.length > 0) {
              const { html, text } = renderEmail({
                title: "Bugün ailende",
                items: gunun,
                button: { label: "Postaları durdur", url: `${SITE_URL}/contact/cikis/${unsub}` },
                footer:
                  "Bu postayı, adresine gönderilen soruyu onayladığın için alıyorsun. İstemediğinde yukarıdaki bağlantıyla tek tıkla durdurabilirsin.",
              });
              const gunlukPosta = await sendEmail({
                to: kisi.contactEmail!,
                subject: `🌳 Bugün ailende (${gunun.length})`,
                html,
                text,
              });
              if (gunlukPosta.sent) contacted++;
            }

            /*
             * 3) HAFTALIK SORU SERİSİ (madde 39) — kadans.
             *
             * Bugüne kadar hikâye bağlantısı HİÇ gönderilmiyordu: uç onu
             * üretip bir kez yanıtta döndürüyor, ağaç sahibi elle
             * kopyalıyordu. Motor (`nextPrompt`) "haftalık cron aynı hafta
             * için aynı soruyu üretmeli" gerekçesiyle yazılmıştı ama o cron
             * hiç var olmamıştı. Bu dal o borunun eksik parçası.
             */
            if (!hikayeGunu || kalanHafta <= 0) continue;
            const seri = seriOf.get(kisi.id);
            if (!seri) continue;

            /*
             * Karar SAF katmanda: hangi hafta, hangi soru, seri bitti mi.
             * "bitti" ve "atla" dallarında hiçbir şey yapılmıyor — yürüyen
             * seriyi KAPATMAK ağaç sahibinin işi, zamanlanmış işin değil.
             * Banka tükendiğinde ekran ilerlemeyi "26/26" gösteriyor.
             */
            const haftalik = planWeekly(seri, subjectFromPerson(kisi, data.people), today);
            if (haftalik.kind !== "gonder") continue;

            /*
             * Soru metni sözlükten geliyor (`memoryPrompt.<id>`), depoda
             * kimliği duruyor. Kişi adı yer tutucuya giriyor; "self" sesli
             * sorularda yer tutucu yok, interpolasyon zararsız geçiyor.
             */
            const soruMetni = translate("tr", promptKey(haftalik.promptId), {
              name: fullName(kisi),
            });
            /*
             * TEK işlemde: geçen haftanın talebi kapanıyor, bu haftanınki
             * YENİ bir jetonla açılıyor. Gerekçe `issueWeekly`de — 100'lük
             * talep tavanı ve tek uzun ömürlü jeton bırakmama.
             */
            const acilan = await issueWeekly(
              u.id,
              seri.id,
              haftalik.promptId,
              soruMetni,
              { id: kisi.id, confidential: kisi.confidential }
            );
            if ("error" in acilan) continue;

            const hafta = renderEmail({
              title: "Bu haftanın sorusu",
              intro: soruMetni,
              button: {
                label: "Yanıtla",
                url: `${SITE_URL}/hikaye/${u.id}?token=${acilan.token}`,
              },
              /*
               * ÇIKIŞ bağlantısı burada, `note` içinde: `renderEmail` tek
               * düğme taşıyor ve o düğme bu postada yanıt bağlantısı olmak
               * zorunda. Tam URL yazılıyor — düz metin sürümünde tıklanabilir
               * geliyor, HTML sürümünde kopyalanabilir duruyor. Çıkışsız bir
               * tekrarlayan posta göndermektense biçimden ödün veriyoruz.
               */
              note: `Bu haftalık soruları durdurmak için: ${SITE_URL}/contact/cikis/${unsub}`,
              footer:
                "Yanıtın doğrudan kayda geçmez; ağacı tutan kişi onayladıktan sonra anılara eklenir.",
            });
            const haftaPosta = await sendEmail({
              to: kisi.contactEmail!,
              subject: "🌳 Bu haftanın sorusu",
              html: hafta.html,
              text: hafta.text,
            });
            /*
             * İŞARET YALNIZ GÖNDERİM BAŞARILIYSA. Talep gönderimden ÖNCE
             * açılmak zorunda (bağlantı postanın içinde), ama hafta damgası
             * yalnız posta gittiyse konuyor: düşen bir gönderim, kişinin hiç
             * görmediği bir soruyu "sorulmuş" saymamalı. Damgasız kalan
             * hafta ertesi pazar (ya da aynı hafta içindeki bir sonraki
             * koşuda) AYNI soruyla yeniden deneniyor ve düşen talep
             * `issueWeekly` tarafından kapatılıyor.
             */
            if (haftaPosta.sent) {
              await markWeeklySent(u.id, seri.id, haftalik.promptId, haftalik.week);
              weekly++;
              kalanHafta--;
            }
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
            /*
             * GEÇMİŞE YAZILMIYOR: yazılan tek şey jeton özeti ve sorma anı —
             * kullanıcının göreceği ya da geri almak isteyeceği bir
             * düzenleme değil. Günlüğe girseydi zamanlanmış iş her koşuda
             * geri alma ringini kemirir ve akışta sahte "düzenleme"ler
             * üretirdi.
             */
            if (yazilacak) await saveFamilyData(u.id, taze, { skipHistory: true });
          }
        } catch {
          /* tek ağaç hatası tüm işi durdurmasın */
        }
      }
    } catch {
      /* kullanıcı listesi okunamadıysa hesap sahibi postaları yine gitti */
    }
  }

  const ozet = { ok: true, considered, sent, newsletters, asked, contacted, weekly, skipped };
  /*
   * HER KOŞUDA tek satır. `skipped > 0` uyarı seviyesinde: iş 200 dönüyor
   * ama bazı hesaplar bugün hiç işlenmedi ve bu, büyüme sınırına gelindiğinin
   * tek görünür işareti.
   */
  const satir =
    `[hatirlatma] bakilan ${considered}, gonderilen ${sent}, bulten ${newsletters}, ` +
    `soru ${asked}, kisiye ${contacted}, haftalik ${weekly}, ${butce.elapsed()} ms`;
  if (skipped > 0) console.warn(`${satir} — BUTCE DOLDU, ${skipped} hesap atlandi`);
  else console.log(satir);

  return NextResponse.json(ozet);
}
