import { NextRequest, NextResponse } from "next/server";
import { del, get, list, put } from "@vercel/blob";
import {
  backupSources,
  planRetention,
  snapshotPath,
  stampOf,
  type BackupSummary,
} from "@/lib/backup";
import { sweepExpired } from "@/lib/account-lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Otomatik zamanlanmış yedek (madde 46) — Vercel Cron günde bir çağırır.
 *
 * Blob deposunun tamamını `backups/<YYYY-MM-DD>/…` altına kopyalar ve eski
 * görüntüleri saklama sınırına göre siler. Karar mantığı (özellikle SİLME)
 * `lib/backup.ts`te ve birim testi var; burası yalnız G/Ç.
 *
 * ## Neden ağaç verisinden fazlası
 *
 * `lib/history.ts` her ağacın kişi listesinin geçmişini tutuyor, ama geçmişi
 * OLMAYAN blob'lar da var ve en kritikleri onlar: `users.json` (kimlik
 * deposu — kaybı herkesin hesabını kaybetmesi demek), erişim kayıtları
 * (üyeler/davetler/paylaşımlar/eşleşmeler) ve ağaç kayıtları.
 *
 * ## Güvenlik
 *
 * `CRON_SECRET` ile korunur ve KAPALI DÜŞER: sır tanımsızsa istek reddedilir.
 * Bu uç bütün depoyu okuyup yazdığı için "sır yoksa serbest" davranışı, tek
 * bir HTTP çağrısıyla deponun tamamının kopyalanabilmesi demek olurdu.
 *
 * ## Sınırlar
 *
 * Aynı depo içindeki kopya, gerçekleşmesi EN OLASI kayba karşı korur:
 * uygulamanın kendi hatasıyla verinin bozulması ya da silinmesi. Deponun
 * tamamının kaybına karşı KORUMAZ — o ayrı bir hedef ister (`docs/YEDEKLEME.md`).
 *
 * ## Neden SİLME TEMİZLİĞİ de burada
 *
 * Bekleme süresi dolmuş ağaç/hesapların kalıcı silinmesi (`sweepExpired`)
 * bu işin son adımı. Ayrı bir cron olmasının sebebi YOK DEĞİL: Vercel Hobby
 * planında proje başına EN FAZLA İKİ zamanlanmış iş var ve ikisi de dolu
 * (`reminders`, `backup`). Günlük koşan ve zaten veriyle uğraşan iş bu
 * olduğu için temizlik buraya bağlandı.
 *
 * SIRA ÖNEMLİ: temizlik yedekten SONRA. Böylece silinen verinin o günkü
 * görüntüsü `backups/<gün>/` altına alınmış oluyor ve saklama süresi boyunca
 * elle geri getirilebiliyor. Ters sırada silinen ağacın son yedeği hiç
 * alınmamış olurdu.
 *
 * AMA "SONRA" DEMEK "YEDEK BAŞARILIYSA" DEMEK DEĞİL. İlk hâlinde temizlik
 * yedeğin `try` bloğunun İÇİNDEYDİ: depo listelenemediğinde ya da yedeğin
 * herhangi bir adımı fırlattığında akış doğrudan `catch`e atlıyor, temizlik
 * hiç çağrılmıyordu — ve bunu söyleyen tek bir satır bile yoktu. Sonuç,
 * ilgisiz bir altyapı arızasının kullanıcının SİLME TALEBİNİ süresiz askıya
 * alması olurdu: 30 günü dolmuş veri, kimsenin haberi olmadan durmaya devam
 * eder. Bu iki iş artık ayrı bloklarda; biri düşse öbürü koşuyor ve ikisi de
 * her koşuda günlüğe yazıyor.
 */

/** Kaç günlük görüntü saklanacak. */
const DEFAULT_KEEP = 14;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const keep = Number(process.env.BACKUP_KEEP_DAYS ?? DEFAULT_KEEP);
  const stamp = stampOf(new Date());

  const summary: BackupSummary = {
    stamp,
    copied: 0,
    bytes: 0,
    failed: 0,
    removed: 0,
    keptSnapshots: 0,
  };
  /** Yedek düştüyse sebebi — yanıtın durum kodunu bu belirliyor. */
  let yedekHatasi: string | null = null;

  /* ── 1) YEDEK ──────────────────────────────────────────────────────────── */
  try {
    // Depodaki her şeyi listele (sayfalı).
    const hepsi: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ cursor, limit: 1000 });
      for (const b of res.blobs) hepsi.push(b.pathname);
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);

    // Kaynakları seç — yedeğin yedeği ALINMAZ (`lib/backup.ts`).
    const kaynaklar = backupSources(hepsi);

    for (const yol of kaynaklar) {
      try {
        /*
         * ÖZEL DEPO: blob URL'ine düz `fetch` ATILMAZ.
         *
         * İlk sürüm `fetch(b.downloadUrl ?? b.url)` kullanıyordu ve bu depo
         * `private` olduğu için her istek yetkisiz dönüyordu: `failed`
         * artıyor, `copied` sıfırda kalıyor, iş yine de 200 dönüyordu. Yani
         * yedek hiç alınmıyordu ve dışarıdan bakınca çalışıyor görünüyordu.
         *
         * Deponun geri kalanı (`lib/blob.ts`, `lib/members.ts`,
         * `lib/trees.ts`) baştan beri doğru yolu kullanıyor; bu dosya deseni
         * `scripts/backup.mjs`ten kopyalamıştı ve O BETİK DE aynı sebeple
         * bozuktu — belgelenmiş elle yedek de çalışmıyormuş.
         */
        const okunan = await get(yol, { access: "private", useCache: false });
        if (!okunan || okunan.statusCode !== 200) { summary.failed++; continue; }
        const buf = Buffer.from(await new Response(okunan.stream).arrayBuffer());
        await put(snapshotPath(stamp, yol), buf, {
          access: "private",
          addRandomSuffix: false,
          // Aynı gün ikinci kez koşarsa görüntü tazelenir, ikizlenmez.
          allowOverwrite: true,
          contentType: "application/json",
        });
        summary.copied++; summary.bytes += buf.length;
      } catch {
        /*
         * Tek dosyanın hatası bütün yedeği düşürmesin — eksik bir yedek,
         * hiç yedek almamaktan iyidir. Sayı yanıtta dönüyor ki eksiklik
         * görünür olsun.
         */
        summary.failed++;
      }
    }

    /*
     * Saklama. SİLME YALNIZ KOPYALAMA BAŞARILIYSA yapılır: bu koşuda hiç
     * dosya yazılamadıysa (ör. depo erişimi bozuk) eski görüntüleri silmek,
     * elde hiçbir yedek bırakmamak olurdu.
     */
    if (summary.copied > 0) {
      const sonrakiListe = [
        ...hepsi,
        ...kaynaklar.map((yol) => snapshotPath(stamp, yol)),
      ];
      const plan = planRetention(sonrakiListe, keep);
      summary.keptSnapshots = plan.keep.length;
      for (const p of plan.remove) {
        try {
          await del(p);
          summary.removed++;
        } catch {
          /* silinemeyen dosya bir sonraki koşuda yine denenecek */
        }
      }
    }
  } catch (e) {
    // Yanıtı okuyan kimse yok, hata günlüğe düşmeli.
    yedekHatasi = (e as Error).message;
    console.error(`[yedek] ${stamp} — BAŞARISIZ:`, yedekHatasi);
  }

  /*
   * ÖZET GÜNLÜĞE YAZILIYOR — yanıt gövdesi kimsenin görmediği yere gidiyor.
   *
   * Bu işi bir cron tetikliyor; yanıtı okuyan bir insan ya da istemci yok.
   * Sağlayıcı günlüğünde yalnız durum kodu görünüyordu ve bir yedek işi için
   * asıl tehlikeli hâl "200 döndü ama SIFIR dosya kopyaladı": hata yok,
   * uyarı yok, yedek de yok. Aynı sessizlik türü bu depoda bir kez
   * Postgres aynasını aylarca ölü tuttu.
   *
   * `copied === 0` ayrıca `warn` seviyesinde: 200 yanıtı içinde saklı bir
   * başarısızlık, günlükte de başarısızlık gibi görünmeli.
   */
  const satir =
    `[yedek] ${stamp} — kopyalanan ${summary.copied}, atlanan ${summary.failed}, ` +
    `silinen ${summary.removed}, saklanan görüntü ${summary.keptSnapshots}, ${summary.bytes} bayt`;
  if (summary.copied === 0) console.warn(`${satir} — HİÇBİR ŞEY KOPYALANMADI`);
  else console.log(satir);

  /* ── 2) SİLME TEMİZLİĞİ ────────────────────────────────────────────────── */
  /*
   * YEDEKTEN BAĞIMSIZ. Yukarıdaki blok düşse de burası koşar — gerekçe dosya
   * başında. Kendi hatası da yanıtı düşürmüyor; özete ve günlüğe yazılıyor.
   */
  const sweep = { purgedAccounts: 0, purgedTrees: 0, failed: [] as string[] };
  try {
    const r = await sweepExpired(new Date());
    sweep.purgedAccounts = r.purgedAccounts;
    sweep.purgedTrees = r.purgedTrees;
    sweep.failed.push(...r.failed);
  } catch (e) {
    console.error("[temizlik] koşu başarısız:", (e as Error).message);
    sweep.failed.push(`sweep:${(e as Error).message}`);
  }

  /*
   * HER KOŞUDA yazılıyor, "iş vardı" koşuluna bağlı DEĞİL. Eskiden yalnız bir
   * şey silindiğinde satır düşüyordu; "sıfır" ile "hiç koşmadı" günlükte aynı
   * görünüyordu ve tam da bu iş sessizce koşmayı bırakabilen iş.
   */
  console.log(
    `[temizlik] ${stamp} — kalıcı silinen hesap ${sweep.purgedAccounts}, ` +
      `ağaç ${sweep.purgedTrees}, silinemeyen yol ${sweep.failed.length}`
  );

  return NextResponse.json(
    { ok: !yedekHatasi, ...summary, ...(yedekHatasi ? { error: yedekHatasi } : {}), sweep },
    { status: yedekHatasi ? 500 : 200 }
  );
}
