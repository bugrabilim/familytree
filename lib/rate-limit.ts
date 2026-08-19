/**
 * Basit token-bucket hız sınırı (örnek-içi / instance-local). Sunucusuz ortamda
 * birden çok örnek olabileceğinden global değildir; yine de tek bir istemcinin
 * bir örneği döverek Gemini kotasını/maliyetini tüketmesine karşı ilk savunma.
 * Daha güçlü global sınır için paylaşımlı depo (Supabase/Upstash) gerekir.
 */
type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  /** Sınır aşıldıysa saniye cinsinden yeniden deneme süresi. */
  retryAfter: number;
}

export function rateLimit(
  key: string,
  opts: { capacity: number; refillPerSec: number }
): RateResult {
  const now = Date.now();

  // Bellek sızıntısını önle: ara sıra eski kovaları süpür.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now - b.updated > 3_600_000) buckets.delete(k);
  }

  const b = buckets.get(key) ?? { tokens: opts.capacity, updated: now };
  const elapsed = (now - b.updated) / 1000;
  b.tokens = Math.min(opts.capacity, b.tokens + elapsed * opts.refillPerSec);
  b.updated = now;

  if (b.tokens < 1) {
    buckets.set(key, b);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - b.tokens) / opts.refillPerSec)) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { ok: true, retryAfter: 0 };
}
