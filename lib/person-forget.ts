import { deleteBondsOfPeople } from "@/lib/bond-store";
import { closeRequestsOfPeople } from "@/lib/story-store";

/**
 * KİŞİ AĞAÇTAN GİTTİĞİNDE, AĞACIN DIŞINDA KALANLAR.
 *
 * `lib/scrub.ts` kişi listesinin İÇİNDEKİ başvuruları temizliyor (ebeveyn,
 * eş, eski eş, `parentLinks`, `associations`). Ama kişiye işaret eden veri
 * yalnız orada değil: duygusal bağlar, hikâye talepleri, tarifler,
 * mektuplar, anma duyuruları hepsi AYRI blob'larda ve kişi listesinden
 * silmek onlara dokunmuyor.
 *
 * Bu işlev o dışarıyı topluyor — ve tekli silme ile toplu silmenin AYNI
 * işlevi çağırması, ikisinin ayrı düşmemesi için. Ayrı düşmüşlerdi zaten:
 * tekli silme bağları temizliyordu, toplu silme hiç uğramıyordu; yirmi kişi
 * silindiğinde yirmi kişinin bütün bağları diskte kalıyordu.
 *
 * ## Neye DOKUNULMUYOR ve neden
 *
 * Tarif, mektup ve anma duyurusu kişiye bir kimlikle işaret ediyor ama adı
 * AYRICA saklıyor (`fromName`, `toName`, `personName`) — ve bu tasarım
 * bilerek böyle: "Kişi ağaçtan silinse bile tarif kalır" (`types/recipe.ts`).
 * Görünüm katmanları da buna göre yazılmış; kişi bulunamazsa saklanan ada
 * düşüyorlar, kırılmıyorlar.
 *
 * Bu kayıtları silmek ya da alanlarını boşaltmak, bir kişiyi silmeyi
 * KULLANICI İÇERİĞİNİ silmeye çevirirdi: ninenin tarifi, torununa yazılmış
 * mektup. Sarkan kimlik burada zararsız (kimlikler nanoid, yeniden
 * kullanılmıyor), içerik ise geri getirilemez. O yüzden sarkan kimlik
 * BİLEREK bırakılıyor.
 *
 * Temizlenenler, içerik değil DURUM taşıyanlar:
 *
 *  · duygusal bağlar — iki kişi arasında; bir ucu yoksa bağ da yok.
 *  · açık hikâye talepleri — silinen kişi hakkında hâlâ yanıt bekleyen bir
 *    soru, dışarıdaki birine gönderilmiş canlı bir bağlantı demek. Talep
 *    SİLİNMİYOR, KAPATILIYOR: gelmiş katkılar duruyor, yeni katkı gelmiyor.
 *
 * EN İYİ ÇABA ve çağıran hatayı yutuyor: kişi kaydı zaten silindikten SONRA
 * çağrılıyor, çünkü bu temizlik başarısız diye silme geri alınamaz —
 * kullanıcıya "silinmedi" demek olurdu.
 */
export interface ForgetSummary {
  bonds: number;
  storyRequests: number;
}

export async function forgetPeople(
  treeId: string,
  personIds: readonly string[]
): Promise<ForgetSummary> {
  const ozet: ForgetSummary = { bonds: 0, storyRequests: 0 };
  if (personIds.length === 0) return ozet;

  /*
   * İki depo BİRBİRİNDEN BAĞIMSIZ. Ayrı `try` blokları: bağ deposu
   * okunamadığında hikâye taleplerinin de kapatılmaması için bir sebep yok.
   */
  try {
    ozet.bonds = await deleteBondsOfPeople(treeId, personIds);
  } catch (e) {
    console.warn(`[kisi-silme] bağlar temizlenemedi (${treeId}):`, (e as Error).message);
  }
  try {
    ozet.storyRequests = await closeRequestsOfPeople(treeId, personIds);
  } catch (e) {
    console.warn(`[kisi-silme] hikâye talepleri kapatılamadı (${treeId}):`, (e as Error).message);
  }
  return ozet;
}
