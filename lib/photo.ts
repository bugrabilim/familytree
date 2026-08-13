/**
 * Fotoğraf gösterim yardımcıları — Cloudinary dönüşümleriyle "hafif" iyileştirme
 * (Deep Nostalgia'nın basit karşılığı). Depoyu DEĞİŞTİRMEZ; yalnız görüntü-anı
 * URL'ine dönüşüm enjekte eder → tek tık aç/kapa. Saf mantık (test edilebilir).
 */

/** Cloudinary "upload" görsel URL'i mi? (dönüşüm enjekte edilebilir) */
export function isCloudinaryImage(url: string): boolean {
  return /res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url);
}

/**
 * Otomatik iyileştirme + keskinlik + kalite dönüşümünü URL'e ekler.
 * Cloudinary olmayan URL'ler olduğu gibi döner. Zaten iyileştirilmişse
 * (idempotent) tekrar eklemez.
 */
export function enhancedUrl(url: string): string {
  const marker = "/image/upload/";
  const i = url.indexOf(marker);
  if (i < 0) return url;
  const after = i + marker.length;
  if (url.slice(after).startsWith("e_improve")) return url; // zaten iyileştirilmiş
  return url.slice(0, after) + "e_improve,e_sharpen,q_auto/" + url.slice(after);
}
