/**
 * PAYLAŞIM KAPSAMI — bir bağlantının hangi görünümleri açtığı (madde 35/G).
 *
 * Herkese açık bağlantı her şeyi açıyordu: ağaç, yelpaze, harita, kitap,
 * tarifler, mektuplar, taziye… Oysa paylaşımın amacı çoğu zaman dar —
 * "akrabalara yalnız ağacı göstereyim", "kitabı göndereyim". Ailenin tarif
 * defteri ya da mektupları, ağaç bağlantısını alan herkese açılmak zorunda
 * değil.
 *
 * ## Yokluk "hepsi" demek
 *
 * Alan hiç yoksa (bu özellikten önce açılmış bağlantılar) kısıt YOKTUR ve
 * bağlantı eskisi gibi çalışır. Yokluğu "hiçbiri" saymak, var olan her
 * bağlantıyı sessizce boş sayfaya çevirirdi — göç betiği gerektirmeyen tek
 * güvenli varsayım bu.
 *
 * Aynı gerekçeyle BOŞ LİSTE de "hepsi" sayılıyor: uç zaten boş seçimi
 * reddediyor, dolayısıyla boş bir liste ancak bozuk/eski kayıttan gelebilir
 * ve orada "kısıt yok" demek, ziyaretçiye bomboş bir sayfa göstermekten
 * iyidir.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

/**
 * Seçilebilir görünümler — `VIEW_GROUPS` (components/TopBar.tsx) ile AYNI
 * küme, aynı sırada. İkisinin ayrışmaması `tests/share-scope.test.mts`te
 * kaynak düzeyinde kilitli: burada olmayan bir sekme paylaşımda seçilemez
 * hâle gelir ve kimse fark etmez.
 *
 * `tablo` yok, çünkü o bir sekme değil (⋮ → Kişiler altında).
 */
export const SHARE_SCOPES = [
  "agac", "cevre", "soy", "yelpaze", "liste", "zaman", "harita",
  "istatistik", "iliski", "takvim",
  "kitap", "tarifler", "mektup", "taziye",
] as const;

export type ShareScope = (typeof SHARE_SCOPES)[number];

const BILINEN = new Set<string>(SHARE_SCOPES);

/**
 * İstemciden gelen kapsamı normalleştirir.
 *
 * `undefined` döndürmek "kısıt yok" demek ve bu KAYDEDİLMEZ: hepsi seçiliyse
 * damga tutmuyoruz. Böylece "hepsi" tek bir biçimde temsil ediliyor —
 * yokluk. İki temsil olsaydı (yokluk ve tam liste), okuma yolunun ikisini de
 * bilmesi gerekirdi ve biri unutulurdu.
 *
 * Dönen liste BOŞ olabilir: bilinen hiçbir anahtar gelmemiş demektir ve
 * çağıran bunu reddeder — sessizce "hepsi"ne çevirmek, kullanıcının
 * seçtiğinin tam tersini yapmak olurdu.
 */
export function parseScope(raw: unknown): ShareScope[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const secili = new Set(raw.filter((x): x is string => typeof x === "string" && BILINEN.has(x)));
  // Kanonik SIRA korunuyor: kayıt, istemcinin tıklama sırasına göre değişmesin.
  const liste = SHARE_SCOPES.filter((k) => secili.has(k));
  return liste.length === SHARE_SCOPES.length ? undefined : liste;
}

/**
 * SEKME DEĞİL, KİP olan kapsamlar.
 *
 * "kitap" bir görünüm gibi seçiliyor ama `Workspace` onu `view` durumuna hiç
 * yazmıyor: `TopBar.onViewChange` yakalayıp bir modal açıyor. Yani ana
 * alanda `view === "kitap"` diye bir dal YOK.
 *
 * Bunu bilmemek bir kapsam sızıntısı üretmişti: yalnız "kitap" paylaşan bir
 * bağlantıda açılış görünümü "kitap" seçiliyor, hiçbir dal eşleşmiyor ve
 * render zincirinin son `else`i devreye giriyordu — o da İSTATİSTİK paneli.
 * Ziyaretçinin ilk gördüğü şey, sahibin kapsam dışı bıraktığı görünümün
 * içeriğiydi.
 */
export const MODAL_SCOPES: readonly ShareScope[] = ["kitap"];

/** Kişi verisi İSTEYEN görünümler — geri kalanı kendi ucundan okuyor. */
export const PEOPLE_SCOPES: readonly ShareScope[] = [
  "agac", "cevre", "soy", "yelpaze", "liste", "zaman", "harita",
  "istatistik", "iliski", "takvim", "kitap",
];

/**
 * Bu paylaşımın kişi verisine ihtiyacı var mı?
 *
 * Sunucu bileşeninden istemciye geçen proplar RSC yüküne serileştiriliyor,
 * yani kişi listesini "çizme ama gönder" demek onu SAYFA KAYNAĞINDA
 * bırakmaktır. Taziye şeridi için bu kural zaten uygulanıyordu; kişi
 * listesi için uygulanmıyordu ve kapsam yalnız sekmeleri gizliyordu.
 *
 * Yani yalnız "tarifler" paylaşan bir bağlantı, ağacın bütün kişilerini
 * (maskeli de olsa) sayfa kaynağında taşıyordu — sahibin paylaşmamayı
 * SEÇTİĞİ veriyi.
 */
export function needsPeople(scope?: readonly string[] | null): boolean {
  return scopeOrAll(scope).some((k) => PEOPLE_SCOPES.includes(k));
}

/** Bu bağlantı o görünümü açıyor mu? */
export function allows(scope: readonly string[] | null | undefined, key: string): boolean {
  if (!scope || scope.length === 0) return true;
  return scope.includes(key);
}

/** Kaydedilen kapsamın ekranda gösterilecek hâli — yokluk "hepsi" demek. */
export function scopeOrAll(scope?: readonly string[] | null): ShareScope[] {
  if (!scope || scope.length === 0) return [...SHARE_SCOPES];
  return SHARE_SCOPES.filter((k) => scope.includes(k));
}

/**
 * Kısıtlı bir bağlantıda açılacak İLK görünüm — ya da hiçbiri.
 *
 * Varsayılan sekme "agac" ama paylaşım onu içermeyebilir; o durumda sayfa
 * kapsam dışı bir sekmeyle açılırdı.
 *
 * KİP olan kapsamlar (`MODAL_SCOPES`) buradan DÖNMÜYOR: onların ana alanda
 * bir dalı yok ve seçilirlerse render zinciri son `else`e düşüyor — sızıntı
 * tam buradan çıkmıştı. Kapsamda çizilebilir hiçbir görünüm yoksa `null`
 * dönüyor; çağıran o durumda ne göstereceğine kendisi karar veriyor
 * ("agac" varsaymak, paylaşılmamış ağacı açmak olurdu).
 */
export function firstAllowed(scope?: readonly string[] | null): ShareScope | null {
  return scopeOrAll(scope).find((k) => !MODAL_SCOPES.includes(k)) ?? null;
}
