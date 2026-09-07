/**
 * OKU → DEĞİŞTİR → YAZ, çakışma denetimiyle — BÜTÜN JSON depoları için.
 *
 * ## Sorun
 *
 * Bu depodaki her yan koleksiyon (bağlar, etkinlikler, mektuplar, tarifler,
 * duyurular, hikâyeler, erişim kayıtları) tek bir JSON blob'unda duruyor ve
 * her değişiklik dosyanın TAMAMINI geri yazıyor. Kilit yokken kayıp yazma
 * kaçınılmaz: iki kişi aynı anda bir şey eklediğinde ikisi de dosyayı AYNI
 * hâlde okuyor, sırayla yazıyor ve ikinci yazma birincinin eklediğini
 * tamamen siliyor. Ekleyen 200 alıyor, eklediği hiç yok — sessiz kayıp.
 *
 * Koruma `lib/proposal-store.ts`te vardı ve YALNIZ orada. Öbür yedi depo
 * korumasızdı; oysa aralarında ninenin tarifi ve torununa yazılmış mektup
 * gibi geri getirilemez içerik var.
 *
 * ## Neden bu koruma, gerçek bir kilit değil
 *
 * Vercel Blob'un koşullu yazması bu depoda kullanılamıyor: sürüm damgası
 * yalnız doğrudan `get` yolunda geliyor ve o yol her kurulumda çalışmıyor.
 * Dayanak, kutunun kendi `updatedAt` damgası: yazmadan HEMEN ÖNCE yeniden
 * okunuyor, damga değiştiyse işlem baştan alınıyor.
 *
 * Bu pencereyi KAPATMIYOR, DARALTIYOR — kapatan tek şey koşullu yazma
 * olurdu ve o burada yok. Ama daraltmanın değeri gerçek: pencere son
 * okumadan yazmaya kadar (bir Blob isteği), eskisi ise bütün iş mantığı
 * boyunca (okuma, hesaplama, doğrulama, yazma) açıktı.
 *
 * ## Neden G/Ç dışarıdan geliyor
 *
 * `oku` ve `yaz` parametre olarak veriliyor; bu dosya hiçbir depoyu
 * tanımıyor. Böylece hem her depo kendi biçimini koruyor hem de bu mantık
 * sahte G/Ç ile birim testi edilebiliyor — çakışma davranışını gerçek bir
 * blob deposuna karşı sınamanın başka yolu yok.
 */

/** Eşzamanlı yazma denemesi sayısı. */
export const CAKISMA_DENEME = 4;

/** Damga taşıyan her kutu bu koruma altına girebilir. */
export interface DamgaliKutu {
  updatedAt: string;
}

export type Degisiklik<T> = { yaz: boolean; sonuc: T };

export async function mutateStore<B extends DamgaliKutu, T>(
  oku: () => Promise<B>,
  yaz: (kutu: B) => Promise<void>,
  degistir: (kutu: B) => Degisiklik<T>,
  /** Denemeler tükendiğinde kullanıcıya gösterilecek ad ("tarif", "mektup"…). */
  etiket: string,
  deneme: number = CAKISMA_DENEME
): Promise<T> {
  for (let i = 0; i < deneme; i++) {
    const kutu = await oku();
    const damga = kutu.updatedAt;
    const r = degistir(kutu);
    /*
     * YAZMA YOKSA ÇAKIŞMA DA YOK. "Bulunamadı" ya da "değişiklik yok" gibi
     * sonuçlar tek okumayla dönüyor; onları da yeniden denemek, hiçbir şey
     * yazmayan bir işlemi ağ trafiğine çevirirdi.
     */
    if (!r.yaz) return r.sonuc;

    const taze = await oku();
    if (taze.updatedAt !== damga) continue; // araya biri girdi — baştan
    await yaz(kutu);
    return r.sonuc;
  }
  /*
   * Denemeler tükendi: SESSİZCE BAŞARILI DÖNMÜYORUZ.
   *
   * `true` ya da boş bir sonuç dönmek, tam olarak önlemeye çalıştığımız
   * arızayı üretirdi: kullanıcı yazdığını sanır, yazılmamıştır. Hata mesajı
   * eyleme dönük — "birazdan tekrar dene" — çünkü bu geçici bir durum.
   */
  throw new Error(`${etiket} kaydı şu an çok yoğun; birazdan tekrar dene.`);
}
