/**
 * ZAMANLANMIŞ İŞİN İKİ SINIRI: SÜRE ve SIRA.
 *
 * ## Sorun
 *
 * `app/api/cron/reminders` bütün hesapları tek tek dolaşıyor ve her hesap
 * için ağaç okuyup posta gönderiyor. Sunucusuz işlevin ömrü sabit
 * (`maxDuration`), yapılacak iş ise hesap sayısıyla büyüyor. Bir gün süre
 * yetmemeye başlıyor ve işlev ortada kesiliyor.
 *
 * Kesilmenin kendisi kaçınılmaz; ASIL ARIZA kimin kesildiği. Liste her koşuda
 * aynı yerden, aynı sırayla başladığı için hep AYNI hesaplar işleniyor ve
 * kuyruktakiler hiç sıraya gelmiyor — bir kez sığmayan bir daha hiç sığmıyor.
 * Buna deterministik açlık deniyor ve en kötü yanı sessiz olması: iş her gün
 * 200 dönüyor, günlükte hata yok, ama listenin kuyruğundaki aile doğum günü
 * hatırlatmasını HİÇ almıyor.
 *
 * ## Çözüm
 *
 * İki küçük kural, ikisi de saf:
 *
 * 1. **Bütçe** — iş, ömrünün tamamını değil bir bölümünü harcar ve kalan
 *    süreyle özetini yazıp düzgün biter. Ortada kesilen bir işlev hiçbir şey
 *    anlatamaz; bütçesini bilerek bitiren iş "şu kadarını yapabildim" der.
 * 2. **Döndürme** — liste her gün farklı bir yerden başlar. Sığmayan iş yine
 *    sığmaz, ama sığmayanlar her gün değişir: açlık kalıcı olmaktan çıkıp
 *    gecikmeye dönüşür ve gecikme, sayıyla birlikte günlükte görünür.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

/** Gün numarası (Unix çağından beri, UTC). Döndürmenin dayanağı. */
export function dayIndex(now: Date): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/**
 * Listeyi günün numarasına göre döndürür — içerik AYNI, başlangıç farklı.
 *
 * Hiçbir öğe düşmüyor, ikizlenmiyor: uzunluk korunuyor. Kesilme bu listenin
 * SONUNDAN olacağı için, her gün farklı bir öğe kümesi sona kalıyor.
 */
export function rotateForDay<T>(items: readonly T[], now: Date): T[] {
  const n = items.length;
  if (n < 2) return [...items];
  /* `%` negatif gün numarasında (1970 öncesi) negatif döner — normalleştir. */
  const off = ((dayIndex(now) % n) + n) % n;
  return [...items.slice(off), ...items.slice(0, off)];
}

/** İşin ne kadarını harcayabileceğini söyleyen sayaç. */
export interface Budget {
  /** Süre doldu mu? Döngü her turda bunu soruyor. */
  spent: () => boolean;
  /** Başlangıçtan beri geçen milisaniye — günlüğe yazmak için. */
  elapsed: () => number;
}

/**
 * `limitMs` milisaniyelik bütçe.
 *
 * `now` dışarıdan geliyor ki test saati kendi kontrol edebilsin; verilmezse
 * gerçek saat kullanılır.
 */
export function makeBudget(limitMs: number, now: () => number = Date.now): Budget {
  const basladi = now();
  return {
    spent: () => now() - basladi >= limitMs,
    elapsed: () => now() - basladi,
  };
}
