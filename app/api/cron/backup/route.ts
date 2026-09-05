import { NextRequest, NextResponse } from "next/server";
import { del, get, list, put } from "@vercel/blob";
import {
  backupSources,
  planRetention,
  snapshotPath,
  stampOf,
  type BackupSummary,
} from "@/lib/backup";

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

  try {
    // 1) Depodaki her şeyi listele (sayfalı).
    const hepsi: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ cursor, limit: 1000 });
      for (const b of res.blobs) hepsi.push(b.pathname);
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);

    // 2) Kaynakları seç — yedeğin yedeği ALINMAZ (`lib/backup.ts`).
    const kaynaklar = backupSources(hepsi);

    let copied = 0, bytes = 0, failed = 0;
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
        if (!okunan || okunan.statusCode !== 200) { failed++; continue; }
        const buf = Buffer.from(await new Response(okunan.stream).arrayBuffer());
        await put(snapshotPath(stamp, yol), buf, {
          access: "private",
          addRandomSuffix: false,
          // Aynı gün ikinci kez koşarsa görüntü tazelenir, ikizlenmez.
          allowOverwrite: true,
          contentType: "application/json",
        });
        copied++; bytes += buf.length;
      } catch {
        /*
         * Tek dosyanın hatası bütün yedeği düşürmesin — eksik bir yedek,
         * hiç yedek almamaktan iyidir. Sayı yanıtta dönüyor ki eksiklik
         * görünür olsun.
         */
        failed++;
      }
    }

    /*
     * 3) Saklama. SİLME YALNIZ KOPYALAMA BAŞARILIYSA yapılır: bu koşuda hiç
     * dosya yazılamadıysa (ör. depo erişimi bozuk) eski görüntüleri silmek,
     * elde hiçbir yedek bırakmamak olurdu.
     */
    let removed = 0;
    let plan = { keep: [] as string[], remove: [] as string[] };
    if (copied > 0) {
      const sonrakiListe = [
        ...hepsi,
        ...kaynaklar.map((yol) => snapshotPath(stamp, yol)),
      ];
      plan = planRetention(sonrakiListe, keep);
      for (const p of plan.remove) {
        try {
          await del(p);
          removed++;
        } catch {
          /* silinemeyen dosya bir sonraki koşuda yine denenecek */
        }
      }
    }

    const summary: BackupSummary = {
      stamp,
      copied,
      bytes,
      failed,
      removed,
      keptSnapshots: plan.keep.length,
    };

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
      `[yedek] ${stamp} — kopyalanan ${copied}, atlanan ${failed}, ` +
      `silinen ${removed}, saklanan görüntü ${plan.keep.length}, ${bytes} bayt`;
    if (copied === 0) console.warn(`${satir} — HİÇBİR ŞEY KOPYALANMADI`);
    else console.log(satir);

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    // Aynı gerekçe: yanıtı okuyan kimse yok, hata günlüğe düşmeli.
    console.error(`[yedek] ${stamp} — BAŞARISIZ:`, (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
