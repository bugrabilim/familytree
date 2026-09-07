import { isDemoTree } from "./demo-id.ts";

/* ----------------------------------------------------------------------
 * Madde 9 — İyimser kilitleme (optimistic locking).
 *
 * "Giriş yapan herkes düzenler" ve akış `oku→değiştir→yaz` olduğundan, iki
 * kişi aynı anda düzenlerse biri diğerinin değişikliğini eziyordu
 * (last-write-wins). İstemci, düzenlemeye başladığı sürümü (`updatedAt`)
 * `x-base-version` başlığıyla gönderir; sunucudaki güncel sürümle uyuşmuyorsa
 * yazma reddedilir (409) ve kullanıcıdan yenilemesi istenir.
 *
 * Bu dosya bilerek bağımsız (yalnız `./demo-id.ts`): kilidin kalbi burada ve
 * birim testi olmadan değiştirilmemeli. `lib/blob.ts` onu aynı adla yeniden
 * dışa aktarıyor, yani rotalar hâlâ `@/lib/blob`dan içe aktarıyor.
 * -------------------------------------------------------------------- */

/**
 * Bu yazma, istemcinin okuduğu sürümden SONRA değişmiş bir ağacı mı eziyor?
 *
 * `treeId` ZORUNLU ve bilinçli olarak öyle: aşağıdaki demo muafiyeti ancak
 * hangi ağaca bakıldığı biliniyorsa doğru uygulanabilir. Parametre isteğe
 * bağlı olsaydı çağıranın onu geçmeyi unutması derleyiciden sessizce geçer,
 * demo yine kilitlenir ve hata ancak canlıda görülürdü. Zorunlu parametre,
 * on dokuz çağrı yerinin her birini "hangi ağaç" sorusuna cevap vermeye
 * mecbur eder.
 *
 * ## Demo neden MUAF — ve bunu neden başka ağaçlara yaymamalısınız
 *
 * İyimser kilit, GERÇEK ailelerin geri getirilemez verisi için var: iki üye
 * aynı ağacı aynı anda düzenlediğinde, sonra yazanın öbürünün emeğini
 * SESSİZCE silmesini engelliyor (#313–#317'nin kapattığı hata tam olarak
 * buydu). Orada kilidin bedeli — "sayfayı yenileyin" demek — korunan şeyin
 * yanında hiç kalır.
 *
 * Demoda korunacak bir şey YOK ve kilidin bedeli tersine dönüyor:
 *
 *  · Veri oyuncak: `prepareDemoAccount` her girişte ağacı sıfırdan üretiyor.
 *    Ezilen bir şey kaybolmuyor, çünkü zaten kalıcı değil.
 *  · Ziyaretçiler birbirini TANIMIYOR. Demo tek bir ortak ağaç ve aynı anda
 *    kaç kişi içeride olduğunu kimse bilmiyor; "başkasının işini ezme"
 *    uyarısı, ortada bir "başkası"nın işi olmadığı için anlamsız.
 *  · Kilit burada korumaya değil BİRBİRİNİ DIŞARI ATMAYA dönüşüyor:
 *    ziyaretçi A çalışırken B demoya giriyor, sıfırlama yeni bir damga
 *    yazıyor ve A'nın elindeki damga bayatlıyor. A'nın bir sonraki
 *    düzenlemesi 409 alıyor — yani ikinci ziyaretçinin GİRİŞİ birincinin
 *    çalışmasını kilitliyor. Ürünün şartı bunun tam tersi: "biri demo
 *    hesabında ağacı silerken, başka biri işlem yapmaya devam edebilmeli."
 *
 * Herkese açık bir oyun alanında doğru semantik "son yazan kazanır".
 *
 * MUAFİYETİ GENİŞLETMEYİN. Bir gün biri "tutarlılık olsun" diye bu erken
 * `return false`u tüm ağaçlara yaymak isterse, yukarıdaki üç maddenin
 * hiçbirinin gerçek bir aile ağacında geçerli olmadığına dikkat: veri
 * oyuncak değil (yıllarca toplanmış, geri getirilemez), üyeler birbirini
 * tanıyor (ve ezilen düzenlemenin sahibi var), ve kilit orada kimseyi dışarı
 * atmıyor — yalnız "yenile" diyor. Muafiyetin demo dışına sızması, kilidin
 * kapattığı sessiz veri kaybını geri açar. Bu yüzden koşul KİMLİĞE bağlı
 * (`isDemoTree`), bir bayrağa ya da "yazma küçükse" gibi bir sezgiye değil.
 */
export function versionMismatch(
  req: { headers: { get(k: string): string | null } },
  current: string,
  treeId: string
): boolean {
  if (isDemoTree(treeId)) return false;
  const base = req.headers.get("x-base-version");
  return !!base && base !== current;
}
