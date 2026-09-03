import { consume, type BucketState, type RateOpts, type RateResult } from "@/lib/rate-limit-core";

/**
 * Hız sınırı — iki katman.
 *
 * ## Neden paylaşımlı bir depo gerekiyordu
 *
 * Buradaki kovalar örnek-içi bellekteydi. Sunucusuz ortamda her örneğin
 * kendi belleği var; yani "hesap başına 5 istek" aslında "hesap başına,
 * ÖRNEK BAŞINA 5 istek" demekti. Yeterince örnek varsa bir istemci sınırın
 * katlarını geçirebiliyordu — ve tam da korumaya çalıştığımız şey (Gemini
 * kotası ve faturası) hesap başına değil GLOBAL bir kaynak.
 *
 * ## İki katman neden
 *
 * `rateLimitShared` Postgres'teki atomik işlevi çağırır (gerçek, global
 * sınır). Ama Supabase yapılandırılmamışsa ya da o an ulaşılamıyorsa
 * isteği reddetmek yanlış olurdu: kullanıcı, bizim altyapı sorunumuz
 * yüzünden uygulamayı kullanamaz hâle gelirdi. O durumda örnek-içi kovaya
 * düşülür — zayıf ama sıfırdan iyi bir savunma.
 *
 * Yani kural şu: paylaşımlı katman ÇALIŞIYORSA sözü onun; çalışmıyorsa yerel
 * katman devreye girer ve hiçbir durumda "sınır yok" olmaz.
 */

export type { RateResult, RateOpts } from "@/lib/rate-limit-core";

const buckets = new Map<string, BucketState>();

/** Örnek-içi (yerel) sınır — eş zamanlı, yedek katman. */
export function rateLimit(key: string, opts: RateOpts): RateResult {
  const now = Date.now();

  // Bellek sızıntısını önle: ara sıra eski kovaları süpür.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now - b.updated > 3_600_000) buckets.delete(k);
  }

  const { state, result } = consume(buckets.get(key), opts, now);
  buckets.set(key, state);
  return result;
}

/**
 * Paylaşımlı (global) sınır. Postgres'te atomik olarak hesaplanır.
 *
 * "Oku → hesapla → yaz" turunu buradan yapmıyoruz: iki örnek aynı anda
 * okuyup ikisi de dolu kova görür ve ikisi de geçirirdi. Bütün hesap tek
 * bir `for update` kilidi altında, veritabanında.
 */
export async function rateLimitShared(key: string, opts: RateOpts): Promise<RateResult> {
  try {
    // Dinamik içe aktarma: Supabase yapılandırılmamış kurulumlarda (yerel
    // geliştirme) istemciyi hiç kurmayalım.
    const { isSupabaseConfigured, supabaseAdmin } = await import("@/lib/supabase");
    if (!isSupabaseConfigured()) return rateLimit(key, opts);

    const { data, error } = await supabaseAdmin().rpc("consume_rate_limit", {
      p_key: key,
      p_capacity: opts.capacity,
      p_refill: opts.refillPerSec,
      p_now_ms: Date.now(),
    });
    if (error) throw new Error(error.message);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") throw new Error("beklenmeyen yanıt");

    return { ok: row.allowed, retryAfter: Number(row.retry_after) || 0 };
  } catch {
    /*
     * Paylaşımlı katman çalışmıyor. İsteği REDDETMİYORUZ — bizim altyapı
     * sorunumuz kullanıcının uygulamayı kullanamamasına dönüşmemeli. Yerel
     * kovaya düşüyoruz: zayıf, ama sınırsız değil.
     */
    return rateLimit(key, opts);
  }
}
