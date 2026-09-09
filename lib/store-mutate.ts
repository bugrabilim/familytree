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

/**
 * Değiştirici SENKRON ya da ASENKRON olabilir.
 *
 * Çoğu depo için senkron yeter. Erişim kaydı (`lib/members.ts`) ise karar
 * verirken `await` istiyor: davet kabulünde şifre çakışması `bcrypt.compare`
 * ile, kurucunun şifresi ayrı bir okumayla denetleniyor.
 *
 * Asenkron gövde çakışma penceresini GENİŞLETMİYOR: doğrulama okuması
 * gövdeden SONRA, yazmadan hemen önce yapılıyor. Gövde ne kadar sürerse
 * sürsün, karşılaştırılan damga her zaman yazmanın hemen öncesinden.
 */
export type Degistirici<B, T> = (kutu: B) => Degisiklik<T> | Promise<Degisiklik<T>>;

export async function mutateStore<B extends DamgaliKutu, T>(
  oku: () => Promise<B>,
  yaz: (kutu: B) => Promise<void>,
  degistir: Degistirici<B, T>,
  /** Denemeler tükendiğinde kullanıcıya gösterilecek ad ("tarif", "mektup"…). */
  etiket: string,
  deneme: number = CAKISMA_DENEME
): Promise<T> {
  for (let i = 0; i < deneme; i++) {
    const kutu = await oku();
    const damga = kutu.updatedAt;
    const r = await degistir(kutu);
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

/**
 * TEK SATIR üzerinde OKU → DEĞİŞTİR → KOŞULLU YAZ (karşılaştır-ve-değiştir).
 *
 * ## `mutateStore`tan farkı ve neden ayrı
 *
 * `mutateStore` bir KUTUYU (tüm dosya) okuyup tamamını geri yazıyor ve
 * yazmadan hemen önce yeniden okuyup damgaya bakıyor. Bu pencereyi
 * DARALTIYOR ama kapatmıyor — çünkü Vercel Blob'da koşullu yazma yok:
 * "damga hâlâ aynı mı" sorusu ile yazma arasında her zaman bir aralık
 * kalıyor.
 *
 * Postgres'te o aralık yok. `update … where id = ? and updated_at = ?`
 * soruyu ve yazmayı TEK ifadede yapıyor; satır güncellenmediyse araya biri
 * girmiş demektir ve bunu veritabanının kendisi söylüyor. Bu yüzden burada
 * "yazmadan önce yeniden oku" adımı YOK: olsaydı kapanmış bir pencereyi
 * ikinci kez, daha zayıf biçimde denetlemek olurdu.
 *
 * ## İkinci kazanç: çakışma alanı daralıyor
 *
 * Kutu modelinde iki FARKLI hesaba yazan iki istek de çakışıyordu (ikisi de
 * aynı dosyayı yazıyor). Satır modelinde çakışan yalnız AYNI hesaba yazan
 * istekler; kimlik yazmaları zaten hesap başına seyrek olduğu için pratikte
 * çakışma kalmıyor.
 *
 * ## Sözleşme
 *
 * `oku` satırı ve damgasını verir, satır yoksa `null`. `degistir` satırı
 * YERİNDE değiştirir. `yaz` koşullu güncellemeyi yapar ve GERÇEKTEN
 * yazıldıysa `true` döner — `false` "çakışma oldu" demektir, hata değil.
 *
 * Damga `null` olabilir: sütun sonradan eklendiği için eski satırlarda boş.
 * `yaz` bunu "damgası olmayan satır" olarak ele almak zorunda (SQL'de
 * `is null`, `= null` değil) — yoksa hiçbir eski satır bir daha
 * güncellenemezdi.
 */
export type SatirYazici<R> = (
  satir: R,
  eskiDamga: string | null,
  yeniDamga: string
) => Promise<boolean>;

export async function mutateRow<R, T>(
  oku: () => Promise<{ satir: R; damga: string | null } | null>,
  yaz: SatirYazici<R>,
  /** Satır yoksa `null` alır — "bulunamadı" kararını çağıran verir. */
  degistir: (satir: R | null) => Degisiklik<T> | Promise<Degisiklik<T>>,
  etiket: string,
  deneme: number = CAKISMA_DENEME
): Promise<T> {
  for (let i = 0; i < deneme; i++) {
    const kayit = await oku();
    const r = await degistir(kayit ? kayit.satir : null);
    // Yazma yoksa çakışma da yok (gerekçe `mutateStore`ta).
    if (!r.yaz) return r.sonuc;
    /*
     * Satır YOKKEN yazmak istenemez: `degistir` `null` aldığında yalnız
     * "bulunamadı" diyebilir. Buraya düşmek, çağıranın sözleşmeyi bozduğu
     * anlamına gelir; sessizce başarılı dönmek yazılmamış bir değişikliği
     * yazılmış göstermek olurdu.
     */
    if (!kayit) throw new Error(`${etiket} kaydı yok; yazılamaz.`);
    const yeniDamga = new Date().toISOString();
    if (await yaz(kayit.satir, kayit.damga, yeniDamga)) return r.sonuc;
    // Koşul tutmadı → araya biri girdi → baştan oku.
  }
  throw new Error(`${etiket} kaydı şu an çok yoğun; birazdan tekrar dene.`);
}
