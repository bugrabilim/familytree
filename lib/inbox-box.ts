import { MAX_MAILS, type Mail } from "./inbox.ts";

/**
 * GELEN KUTUSU DOSYASININ oku-değiştir-yaz kuralları.
 *
 * Depo katmanından (Vercel Blob) AYRI duruyor çünkü buradaki iki kural da
 * gerçek arızalardan doğdu ve ikisi de birim testi ister — oysa
 * `lib/inbox-store.ts` `server-only` ve `@vercel/blob` taşıdığı için
 * `node --experimental-strip-types` altında koşamıyor. Blob'a bağlı olan
 * her şey `BoxIO` arkasında.
 *
 * ## 1. OKUNAMAYAN kutu, BOŞ kutu DEĞİLDİR
 *
 * Eskiden okuma başarısız olduğunda boş kutu dönülüyordu ve çağıran onun
 * üstüne yazıyordu: tek bir geçici indirme hatası, o ana kadarki BÜTÜN
 * postaları siliyordu. Üstelik sessizce — webhook 200 dönüyor, sağlayıcı
 * memnun, kutu bomboş.
 *
 * Kural: kutu GERÇEKTEN yoksa boş kutu; okunamadıysa HATA. `BoxIO.read`
 * "yok"u `null` ile, "okuyamadım"ı fırlatarak bildirir.
 *
 * ## 2. Kilit yerine SÜRÜM DAMGASI (ETag / compare-and-swap)
 *
 * Kutu tek bir dosya ve yazanlar aynı anda çalışıyor: webhook postayı
 * saklarken ekran "okundu" işaretleyebiliyor, iki posta aynı saniyede
 * gelebiliyor. Kilitsiz oku-değiştir-yazda ikisi de aynı sürümü okur, ikisi
 * de yazar ve İKİNCİ YAZAN BİRİNCİYİ SİLER — kaybolan posta hiçbir yerde
 * görünmez.
 *
 * Sunucusuz ortamda gerçek kilit yok (her istek başka bir örnekte). En ucuz
 * DOĞRU çözüm koşullu yazma: okurken sürüm damgası alınıyor, yazarken
 * "hâlâ bu sürümdeyse" deniyor. Damga tutmazsa yazma reddediliyor, kutu
 * YENİDEN okunup değişiklik tazesine uygulanıyor.
 *
 * Denemeler tükenirse hata FIRLATILIYOR, yutulmuyor: çağıran (webhook) 500
 * döner ve sağlayıcı postayı yeniden gönderir. Sessizce başarı dönmek,
 * tam da kaçınmaya çalıştığımız kayıp olurdu.
 */

export interface Box {
  mails: Mail[];
  updatedAt: string;
}

/** Depoya bakan tek yüzey. Gerçeği `lib/inbox-store.ts`, sahtesi testler verir. */
export interface BoxIO {
  /**
   * Ham kutu içeriğini ve sürüm damgasını okur.
   *
   * Kutu HİÇ YOKSA `null`. Okuma BAŞARISIZSA fırlatır — boş kutu döndürmek
   * yasak (bkz. dosya başı, kural 1). Damga alınamıyorsa `etag` boş kalır:
   * o zaman koşulsuz yazılır, yani yarış koruması olmadan.
   */
  read(): Promise<{ raw: unknown; etag?: string } | null>;
  /** `etag` verilmişse yalnız kutu hâlâ o sürümdeyse yazar; değilse fırlatır. */
  write(box: Box, etag: string | undefined): Promise<void>;
  /** Fırlatılan hata bir sürüm çakışması mı? (Öbür hatalar yeniden denenmez.) */
  isConflict(e: unknown): boolean;
}

/** Çakışma yüzünden kaç kez yeniden denenir. */
export const CAS_DENEME = 4;

export const bosKutu = (): Box => ({ mails: [], updatedAt: new Date(0).toISOString() });

/**
 * Ham JSON'u kutuya çevirir; tanınmayan kayıtlar düşer, tavan uygulanır.
 *
 * Dosya elle ya da eski bir sürümle bozulmuş olabilir; tek bir bozuk kayıt
 * yüzünden bütün kutunun okunamaz olması, tam da kaçındığımız kayıp olurdu.
 */
export function normalizeBox(raw: unknown): Box {
  const r = (raw ?? {}) as Partial<Box>;
  const arr = Array.isArray(r.mails) ? r.mails : [];
  return {
    mails: arr
      .filter(
        (m): m is Mail =>
          !!m && typeof m.id === "string" && typeof m.from === "string" && typeof m.at === "string"
      )
      .slice(0, MAX_MAILS),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date(0).toISOString(),
  };
}

/** Kutuyu okur. Yoksa boş; OKUNAMADIYSA fırlatır (yutmaz). */
export async function readBox(io: BoxIO): Promise<Box> {
  const anlik = await io.read();
  return anlik ? normalizeBox(anlik.raw) : bosKutu();
}

/** `uygula`nın dönüşü: yazılacak mı, ve çağırana ne dönecek. */
export interface Degisiklik<R> {
  yaz: boolean;
  sonuc: R;
}

/**
 * Oku → değiştir → KOŞULLU yaz; çakışmada baştan.
 *
 * `uygula` HER denemede yeniden çağrılıyor ve TAZE kutuyu alıyor — eski
 * denemede hesaplanmış sonucu yeniden kullanmak, başkasının yazdığının
 * üstüne bayat karar yazmak olurdu.
 *
 * `yaz: false` (değişiklik yok, ör. posta bulunamadı) hiç yazmıyor: gereksiz
 * sürüm üretmenin anlamı yok ve boşuna çakışma yaratır.
 */
export async function mutateBox<R>(
  io: BoxIO,
  uygula: (box: Box) => Degisiklik<R>,
  kere = CAS_DENEME
): Promise<R> {
  let son: unknown;
  for (let i = 0; i < kere; i++) {
    const anlik = await io.read();
    const box = anlik ? normalizeBox(anlik.raw) : bosKutu();
    const { yaz, sonuc } = uygula(box);
    if (!yaz) return sonuc;
    box.updatedAt = new Date().toISOString();
    try {
      await io.write(box, anlik?.etag);
      return sonuc;
    } catch (e) {
      // Çakışma DIŞINDAKİ hata yeniden denenmez: aynı sonucu verir.
      if (!io.isConflict(e)) throw e;
      son = e;
    }
  }
  throw son;
}
