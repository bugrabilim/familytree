/**
 * Otomatik zamanlanmış yedek (madde 46) — KARAR mantığı.
 *
 * ## Neden ayrı bir yedek, geçmiş varken
 *
 * `lib/history.ts` her ağacın KİŞİ listesinin geçmişini tutuyor, yani bir
 * ağaçta yapılan hata geri alınabiliyor. Ama geçmişi olmayan blob'lar da var
 * ve en kritik olan onlar:
 *
 *  · `users.json` — kimlik deposu. Kaybı, herkesin hesabını kaybetmesi demek;
 *    geri alınacak bir "önceki sürüm" yok.
 *  · erişim kayıtları — üyeler, davetler, paylaşım bağlantıları, eşleşmeler.
 *  · ağaç kayıtları (founder başına ek ağaç listesi).
 *
 * Bu yüzden yedek "ağaç verisi"ni değil, blob deposunun TAMAMINI kapsıyor.
 *
 * ## Neden Blob'un içine
 *
 * `scripts/backup.mjs` yerel diske indiriyor ve elle çalıştırılıyor;
 * sunucusuz bir cron işinde kalıcı disk yok. Depo içinde zaman damgalı
 * kopya, gerçekleşmesi EN OLASI kayıp türüne karşı koruyor: uygulamanın
 * kendi hatasıyla verinin bozulması ya da silinmesi. Deponun tamamının
 * kaybına karşı korumaz — o ayrı bir hedef ister (madde 46'nın "senden
 * gereken" kısmı) ve `docs/YEDEKLEME.md`de yazılı.
 *
 * Saf ve bağımlılıksız — silme kararı birim testiyle kilitlenebilsin.
 */

/** Yedeklerin yaşadığı önek. Canlı veriyle KARIŞMAMASI için tek bir kök. */
export const BACKUP_PREFIX = "backups/";

/** Zaman damgası biçimi: `YYYY-MM-DD` (günde bir görüntü). */
const STAMP = /^\d{4}-\d{2}-\d{2}$/;

/** Bugünün damgası (UTC — cron da UTC'de koşuyor, ikisi ayrışmasın). */
export function stampOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Bir yol yedek alanına mı ait? */
export function isBackupPath(pathname: string): boolean {
  return pathname.startsWith(BACKUP_PREFIX);
}

/** `backups/2026-09-03/users.json` → `2026-09-03`. Tanınmazsa `null`. */
export function snapshotStamp(pathname: string): string | null {
  if (!isBackupPath(pathname)) return null;
  const stamp = pathname.slice(BACKUP_PREFIX.length).split("/")[0];
  return STAMP.test(stamp) ? stamp : null;
}

/** Kaynak yolu → o günkü yedek yolu. */
export function snapshotPath(stamp: string, pathname: string): string {
  return `${BACKUP_PREFIX}${stamp}/${pathname}`;
}

/**
 * Yedeklenecek kaynaklar.
 *
 * TEK kural: yedeğin yedeği alınmaz. Alınsaydı her koşu bir öncekinin
 * tamamını kopyalar ve depo katlanarak büyürdü — yedeğin kendisi arızaya
 * dönüşürdü.
 */
export function backupSources(pathnames: readonly string[]): string[] {
  return pathnames.filter((p) => !isBackupPath(p));
}

export interface RetentionPlan {
  /** Korunacak damgalar (en yeniden eskiye). */
  keep: string[];
  /** Silinecek YOLLAR. Yalnız `backups/` altındaki, damgası tanınan yollar. */
  remove: string[];
}

/**
 * Hangi görüntüler kalsın, hangi yollar silinsin.
 *
 * ## Silme burada, çünkü tehlikeli olan bu
 *
 * Saklama olmadan depo sonsuza dek büyür; ama yanlış silen bir yedek işi,
 * hiç yedek almamaktan kötüdür. Kurallar bilerek dar:
 *
 *  1. `backups/` DIŞINDAKİ hiçbir yol asla silinmez — canlı veri bu işlevin
 *     çıktısına giremez.
 *  2. Damgası TANINMAYAN bir yedek yolu da silinmez. Anlamadığımız şeyi
 *     silmek, en çok o dosyanın gerekli olduğu anda kaybetmenin yoludur.
 *  3. `keep` en az 1'dir; 0 verilirse her şeyi silen bir işe dönüşürdü.
 *
 * En yeni `keep` DAMGA korunur — dosya sayısı değil gün sayısı, çünkü bir
 * günün görüntüsü yüzlerce dosya olabilir ve yarısını silmek onu işe
 * yaramaz kılar.
 */
export function planRetention(
  pathnames: readonly string[],
  keep: number
): RetentionPlan {
  /*
   * `Number.isFinite` denetimi ŞART: `Math.max(1, Math.floor(NaN))` yine
   * `NaN` verir ve `slice(0, NaN)` boş küme döner — yani sayı olmayan bir
   * `keep` (ör. ayarlanmamış bir ortam değişkeninden gelen `Number(undefined)`)
   * işlevi sessizce "HEPSİNİ SİL"e çevirirdi. Kural 3'ün asıl tehlikesi 0
   * değil, sayı olmayan değerdi.
   */
  const kalacak = Number.isFinite(keep) ? Math.max(1, Math.floor(keep)) : 1;

  const damgalar = new Set<string>();
  for (const p of pathnames) {
    const s = snapshotStamp(p);
    if (s) damgalar.add(s);
  }
  // Damga biçimi sabit genişlikte olduğu için metin sıralaması = tarih sırası.
  const sirali = [...damgalar].sort().reverse();
  const tutulan = new Set(sirali.slice(0, kalacak));

  const remove: string[] = [];
  for (const p of pathnames) {
    const s = snapshotStamp(p);
    if (s === null) continue;        // kural 1 ve 2
    if (tutulan.has(s)) continue;
    remove.push(p);
  }

  return { keep: [...tutulan], remove };
}

/** Yedek koşusunun özeti — rota bunu döner, günlüğe de bu düşer. */
export interface BackupSummary {
  stamp: string;
  copied: number;
  bytes: number;
  failed: number;
  removed: number;
  keptSnapshots: number;
}
