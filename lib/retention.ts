/**
 * SİLMEDE BEKLEME SÜRESİ (grace period) — tek kural kaynağı.
 *
 * ## Neden hemen silmiyoruz
 *
 * Aile ağacı geri getirilemez bir içerik: kişiler, tarifler, mektuplar,
 * hikâyeler, yas ilanları. Çoğunun başka bir kopyası yok. Buna karşılık
 * "yanlış ağacı sildim" çok kolay bir hata — ağaç değiştirici iki tık ötede
 * ve ağaçların adları birbirine benziyor. Bu ikisi bir araya gelince ANINDA
 * silme, tek bir yanlış tıkla telafisi olmayan bir kayba dönüşüyor.
 *
 * Bu yüzden silme İKİ AŞAMALI:
 *   1. YUMUŞAK SİLME — kayıt `deletedAt` damgasıyla işaretlenir. Ağaç/hesap
 *      her yüzeyden düşer (liste, geçiş, oturum, paylaşım, davet, genel API)
 *      ama veri DURUR.
 *   2. KALICI SİLME — `GRACE_DAYS` gün sonra zamanlanmış iş envanterdeki her
 *      şeyi gerçekten yok eder.
 *
 * ## Neden saf (bağımlılıksız) bir dosya
 *
 * Süre ve "sırası geldi mi" kararı tek yerde olmalı: iki kopya ayrışırsa bir
 * yüzey ağacı gizler, öteki hâlâ açar — ya da temizlik işi henüz süresi
 * dolmamış bir ağacı siler. Bağımlılığı olmadığı için `tests/*.test.mts`
 * doğrudan içe aktarıp sınayabiliyor.
 *
 * SAYIYI TESTE SERPME: testler `GRACE_DAYS`i buradan okur. 30 sayısını
 * testlere yazmak, süreyi değiştirmeyi "testleri de düzelt" işine çevirirdi
 * ve o düzeltme sırasında kuralın kendisi gözden kaçardı.
 */

/** Yumuşak silme ile kalıcı silme arasındaki gün sayısı. */
export const GRACE_DAYS = 30;

const DAY_MS = 86_400_000;

/** `deletedAt` damgası taşıyabilen her kayıt (ağaç kaydı, hesap, erişim kaydı). */
export interface SoftDeletable {
  /** Yumuşak silme anı (ISO). Yoksa kayıt canlıdır. */
  deletedAt?: string;
}

/** Zaman parametresi hem `Date` hem epoch-ms kabul eder (test kolaylığı). */
function ms(t: Date | number): number {
  return typeof t === "number" ? t : t.getTime();
}

/**
 * Kayıt yumuşak silinmiş mi?
 *
 * DAMGA VARSA SİLİNMİŞTİR — damganın ayrıştırılabilir olması aranmıyor.
 * Bozuk bir damgayı "silinmemiş" saymak, kullanıcının sildiği ağacı geri
 * açmak olurdu; bozuk damgada güvenli yön GİZLEMEK.
 */
export function isSoftDeleted(x: SoftDeletable | null | undefined): boolean {
  return !!x?.deletedAt;
}

/** Kalıcı silme anı (ISO). Damga ayrıştırılamazsa boş dize. */
export function purgeAt(deletedAt: string): string {
  const t = Date.parse(deletedAt);
  if (Number.isNaN(t)) return "";
  return new Date(t + GRACE_DAYS * DAY_MS).toISOString();
}

/**
 * Kalıcı silmenin sırası geldi mi?
 *
 * BOZUK DAMGADA `false`. Burada güvenli yön gizlemenin TERSİ: elimizde ne
 * zaman silindiği yoksa süreyi dolmuş saymak, veriyi belki de daha ilk gün
 * yok etmek olur. Böyle bir kayıt beklemede kalır ve elle bakılır — kalıcı
 * silme geri alınamaz, o yüzden şüphe daima beklemeden yana.
 */
export function isPurgeDue(deletedAt: string, now: Date | number): boolean {
  const t = Date.parse(deletedAt);
  if (Number.isNaN(t)) return false;
  return ms(now) >= t + GRACE_DAYS * DAY_MS;
}

/**
 * Kalıcı silmeye kalan TAM gün sayısı (yukarı yuvarlar; 0'ın altına inmez).
 *
 * Yukarı yuvarlama bilinçli: "yarım gün kaldı" kullanıcıya "1 gün" olarak
 * gösterilmeli, "0 gün" değil — 0, "artık geri alamazsın" gibi okunur, oysa
 * hâlâ alabilir.
 */
export function daysLeft(deletedAt: string, now: Date | number): number {
  const t = Date.parse(deletedAt);
  if (Number.isNaN(t)) return GRACE_DAYS; // bilinmiyor → en geniş süre
  const kalan = t + GRACE_DAYS * DAY_MS - ms(now);
  return kalan <= 0 ? 0 : Math.ceil(kalan / DAY_MS);
}

/** Arayüzün gösterdiği üçlü — uçlar bunu olduğu gibi döner. */
export interface GraceInfo {
  deletedAt: string;
  purgeAt: string;
  daysLeft: number;
}

export function graceInfo(deletedAt: string, now: Date | number = Date.now()): GraceInfo {
  return { deletedAt, purgeAt: purgeAt(deletedAt), daysLeft: daysLeft(deletedAt, now) };
}

/**
 * HESAP SİLMEDE ONAY METNİ — kullanıcının aile adını birebir yazması.
 *
 * Şifre "sen misin" sorusunun yanıtı; bu alan "ne yaptığının farkında mısın"
 * sorusununki. İkisi ayrı sorular: çalınmış bir oturumda şifre bilinmez,
 * ama kendi oturumunda dalgın bir kullanıcı şifresini kolayca yazar.
 *
 * Karşılaştırma BİREBİR (büyük/küçük harf dahil): yalnız baştaki/sondaki
 * boşluklar atılıyor, çünkü kopyala-yapıştır sonu boşluk taşır ve bu,
 * kullanıcının niyetiyle ilgili hiçbir şey söylemez. Türkçe'de büyük/küçük
 * harf dönüşümü ("İ"/"ı") güvenilmez olduğu için gevşetme yapılmıyor.
 */
export function confirmMatches(input: unknown, familyName: string): boolean {
  if (typeof input !== "string" || !familyName) return false;
  return input.trim() === familyName.trim();
}
