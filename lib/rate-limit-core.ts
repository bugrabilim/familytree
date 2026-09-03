/**
 * Token-bucket matematiği — saf, test edilebilir.
 *
 * Ayrı bir dosya olmasının sebebi: aynı hesap İKİ yerde yapılıyor. Biri
 * burada (TypeScript, örnek-içi yedek), öteki Postgres tarafında
 * (`consume_rate_limit`, paylaşımlı gerçek sınır). İkisi aynı davranmak
 * zorunda; kural tek yerde yazılı ve testli olmazsa sessizce ayrışırlar —
 * ve "sınır neden farklı davrandı" sorusunun cevabı hiç bulunamazdı.
 */

export interface RateOpts {
  /** Kova dolu kapasitesi = arka arkaya izin verilen istek sayısı. */
  capacity: number;
  /** Saniyede kaç jeton geri dolar. */
  refillPerSec: number;
}

export interface BucketState {
  tokens: number;
  /** Son güncelleme, epoch ms. */
  updated: number;
}

export interface RateResult {
  ok: boolean;
  /** Sınır aşıldıysa saniye cinsinden yeniden deneme süresi. */
  retryAfter: number;
}

/**
 * Bir isteği kovadan düşürür.
 *
 * `state` yoksa kova DOLU sayılır — yeni bir anahtarın ilk isteği
 * engellenmemeli.
 *
 * Reddedilen istek jeton HARCAMAZ: aksi hâlde sürekli deneyen bir istemci
 * kovayı hiç dolmaz hâlde tutar ve `retryAfter` yalan söylerdi.
 */
export function consume(
  state: BucketState | null | undefined,
  opts: RateOpts,
  now: number
): { state: BucketState; result: RateResult } {
  const capacity = Math.max(1, opts.capacity);
  const refill = Math.max(0, opts.refillPerSec);

  const onceki = state ?? { tokens: capacity, updated: now };
  // Saat geri gitmiş olabilir (sunucular arası kayma): negatif süre 0 sayılır,
  // yoksa jeton geri ALINIR ve sınır kendiliğinden sertleşirdi.
  const gecen = Math.max(0, (now - onceki.updated) / 1000);
  const tokens = Math.min(capacity, onceki.tokens + gecen * refill);

  if (tokens < 1) {
    const bekle = refill > 0 ? Math.ceil((1 - tokens) / refill) : 3600;
    return {
      state: { tokens, updated: now },
      result: { ok: false, retryAfter: Math.max(1, bekle) },
    };
  }

  return {
    state: { tokens: tokens - 1, updated: now },
    result: { ok: true, retryAfter: 0 },
  };
}
