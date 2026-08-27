/**
 * Bir sözü (promise) süreyle sınırlar — SAF, test edilebilir.
 *
 * Kullanım yeri: "en iyi çaba" (best-effort) yan işlemler. Supabase çift-yazma
 * aynası gibi işlemler kullanıcının isteğini BEKLETMEMELİ; ağ/servis yanıt
 * vermezse (ör. duraklatılmış bir proje) `await` süresiz asılı kalır ve istek
 * platform zaman aşımına düşene dek kullanıcı boş yere bekler.
 *
 * Süre dolunca yalnız BU bekleme sonlanır; asıl söz arka planda sürer (iptal
 * edilemez), ama çağıran artık ona bağlı değildir.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "işlem"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: ${ms} ms içinde yanıt vermedi (zaman aşımı)`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

/** Çift-yazma aynası için üst sınır (ms). Kullanıcı isteği bundan çok beklemez. */
export const MIRROR_TIMEOUT_MS = 4000;
