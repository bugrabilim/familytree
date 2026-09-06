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
 * Kısıtlı bir bağlantıda açılacak İLK görünüm.
 *
 * Varsayılan sekme "agac" ama paylaşım onu içermeyebilir; o durumda sayfa,
 * kapsam dışı bir sekmeyle açılır ve ziyaretçi boş bir ekran görürdü.
 */
export function firstAllowed(scope?: readonly string[] | null): ShareScope {
  return scopeOrAll(scope)[0] ?? "agac";
}
