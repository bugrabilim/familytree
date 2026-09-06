/**
 * Ağacın SÜRÜM JETONU (Madde 1 — silinen kişi dirilmesi).
 *
 * İyimser kilitleme (`versionMismatch`) tek bir dizgeye dayanıyor: istemci
 * düzenlemeye başladığı sürümü `x-base-version` ile geri gönderiyor, sunucu
 * güncel sürümle karşılaştırıyor. Bu jetonun tek şartı var: **geriye
 * gitmemek**.
 *
 * Postgres okuma yolunda jeton, kişi satırlarının en yeni `updated_at`
 * değerinden türetiliyordu. O değer bir SİLMEDE GERİYE GİDER: en son
 * güncellenen kişi silinince en büyük damga da onunla birlikte kaybolur ve
 * ağaç, silmeden ÖNCEKİ bir sürüme "geri döner". Sonucu şu:
 *
 *   1. A, kişi X'i içeren ağacı okur   → jeton V0
 *   2. B, en son güncellenen X'i siler → jeton V1 iken tekrar V0'a düşer
 *   3. A, elindeki (X'li) listeyi yazar → temel sürüm V0, güncel de V0:
 *      çakışma GÖRÜLMEZ, yazma kabul edilir ve X DİRİLİR.
 *
 * Çözüm, ağacın kendi damgasını (`trees.updated_at`) her kaydetmede
 * ilerletmek. Ama ayna en iyi çaba ile yazılıyor (zaman aşımı var), yani
 * damga yazılıp kişiler yazılamayabilir ya da tersi. Bu yüzden jeton
 * İKİSİNİN BÜYÜĞÜ: hangisi yazılabildiyse jeton onunla ilerler, hiçbir
 * durumda geri gitmez.
 *
 * Bu dosya bilerek bağımsız (saf TS): kilitlemenin kalbi burada ve birim
 * testi olmadan değiştirilmemeli.
 */

/**
 * Damgayı karşılaştırılabilir tek bir biçime (ISO-Z) indir.
 *
 * Neden gerekli: Postgres `timestamptz`'i `2026-09-06T10:00:00.123+00:00`
 * diye döndürüyor, JS `toISOString()` ise `...123Z` üretiyor. Jeton bazen
 * Postgres'ten bazen Blob'dan geldiği için iki biçim karışıyor ve dizge
 * karşılaştırması yanlış cevap veriyor: `"+"` (0x2B) < `"Z"` (0x5A), yani
 * AYNI AN'ın Postgres yazımı, Blob yazımından "küçük" görünüyor.
 *
 * Ayrıştırılamayan/boş değer `""` döner — "damga yok" demektir ve her
 * gerçek damgadan küçüktür.
 */
export function normalizeStamp(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (s === "") return "";
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString();
}

/**
 * Ağacın sürüm jetonu: ağaç damgası ile kişi damgalarının EN BÜYÜĞÜ.
 *
 * `treeStamp` henüz damgalanmamış (göç etmiş ama o günden beri
 * kaydedilmemiş) ağaçlarda `null` gelir; o zaman eski davranış — kişilerin
 * en yeni damgası — sürer. İlk kaydetmeden sonra ağaç damgası devralır.
 */
export function pickVersion(treeStamp: unknown, peopleStamps: readonly unknown[]): string {
  let en = normalizeStamp(treeStamp);
  for (const s of peopleStamps) {
    const n = normalizeStamp(s);
    if (n > en) en = n;
  }
  return en;
}
