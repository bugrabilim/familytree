import { GAZETTEER, type LatLng } from "./places.ts";
import { HISTORIC_TO_MODERN, historicNamesOf, normalizeHistoric } from "./historic-places.ts";

/**
 * YERLEŞİM ARAMA — modern ve tarihî adlar birlikte (madde 38).
 *
 * Madde 37 eski adı haritaya oturtuyor ama SESSİZCE: kullanıcı "Elaziz"
 * yazdığında pin doğru yere düşüyor, ancak neden düştüğünü göremiyor —
 * ve daha kötüsü, "Elaziz"in tanındığını bilmediği için yazmaktan
 * vazgeçebiliyor. Bu dosya o bilgiyi görünür kılıyor.
 *
 * ## Yazılan ad DEĞİŞTİRİLMİYOR
 *
 * Arama bir öneri katmanı, bir düzeltici değil. Dedenin nüfus kâğıdında
 * "Elaziz" yazıyorsa kayıtta da öyle kalabilmeli: ailenin belgesinde duran
 * adı bugünkü adla değiştirmek, kaydı "temizlemek" adına tarihî bilgiyi
 * silmek olur. Bu yüzden arayüz yalnız KARŞILIĞINI söylüyor
 * ("Elaziz → Elazığ"), yerine geçmiyor.
 *
 * ## Sıralama neden önemli
 *
 * Kullanıcı yazarken listenin başındakine bakıyor. Rastgele bir sıra, doğru
 * adı listenin altına atıp yanlış olanı öne çıkarabilir — öneri listesinin
 * en kötü hâli, yanlış olanı kolaylaştırmasıdır.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

export interface PlaceHit {
  /** Kaydedilecek/haritalanacak MODERN ad. */
  name: string;
  coords: LatLng;
  /**
   * Eşleşme tarihî bir addan geldiyse o ad. Boşsa modern adın kendisinden
   * eşleşti. Arayüz "Elaziz → Elazığ" derken bunu kullanıyor.
   */
  matchedAs?: string;
  /** Bu yerin bilinen öbür eski adları (gösterim için). */
  historic?: string[];
}

/** Eşleşmenin gücü — sıralama bunun üstüne kuruluyor. */
type Rank = 0 | 1 | 2; // 0 = tam, 1 = önek, 2 = içerik

function rank(aday: string, sorgu: string): Rank | null {
  const a = normalizeHistoric(aday);
  const q = normalizeHistoric(sorgu);
  if (!q) return null;
  if (a === q) return 0;
  if (a.startsWith(q)) return 1;
  if (a.includes(q)) return 2;
  return null;
}

/**
 * Modern ve tarihî adlarda arar.
 *
 * Aynı yer iki yoldan da eşleşebilir ("izmir" hem modern adla hem de
 * "Smyrna"nın hedefi olarak): TEK kayıt dönüyor ve modern eşleşme
 * kazanıyor. İki satır göstermek, kullanıcıya aynı yeri iki farklı şeymiş
 * gibi sunmak olurdu.
 */
export function searchPlaces(query: string, limit = 8): PlaceHit[] {
  const q = query.trim();
  if (q.length < 2) return [];

  /** modern ad → en iyi eşleşme */
  const enIyi = new Map<string, { r: Rank; matchedAs?: string }>();

  /**
   * Daha GÜÇLÜ eşleşme kazanıyor. Eşitlikte ilk yazan kalıyor — ve
   * eşitlikte MODERN adın kazanmasını sağlayan şey, aşağıdaki iki geçişin
   * SIRASI: modern adlar önce taranıyor.
   *
   * Burada eskiden fazladan bir "eşitlikte modern kazansın" koşulu vardı ve
   * ÖLÜ KODDU: modern geçiş zaten önce koştuğu için hiçbir zaman
   * tetiklenemiyordu. Mutasyon testi onu silmeye rağmen hiçbir iddia
   * düşmediği için fark edildi. Yük taşıyormuş gibi duran ölü bir koşul,
   * hiç olmamasından kötü: bir gün geçiş sırasını değiştiren kişi ona
   * güvenir. Garanti artık tek yerde — sırada — ve testle kilitli.
   */
  const koy = (modern: string, r: Rank, matchedAs?: string) => {
    const onceki = enIyi.get(modern);
    if (!onceki || r < onceki.r) enIyi.set(modern, { r, matchedAs });
  };

  // MODERN geçiş ÖNCE — eşit güçteki eşleşmede modern adın kazanmasının
  // tek sebebi bu sıra (bkz. `koy`).
  for (const ad of Object.keys(GAZETTEER)) {
    const r = rank(ad, q);
    if (r !== null) koy(ad, r);
  }

  for (const [eski, modern] of Object.entries(HISTORIC_TO_MODERN)) {
    const r = rank(eski, q);
    if (r !== null) koy(modern, r, eski);
  }

  return [...enIyi.entries()]
    .map(([name, m]) => ({ name, r: m.r, matchedAs: m.matchedAs }))
    .sort((a, b) => {
      if (a.r !== b.r) return a.r - b.r;
      // Eşit güçte: kısa ad önce (daha genel/daha olası), sonra alfabetik.
      const uzunluk = a.name.length - b.name.length;
      if (uzunluk !== 0) return uzunluk;
      return a.name.localeCompare(b.name, "tr");
    })
    .slice(0, limit)
    .map(({ name, matchedAs }) => {
      const digerleri = historicNamesOf(name).filter((h) => h !== matchedAs);
      return {
        name,
        coords: GAZETTEER[name],
        ...(matchedAs ? { matchedAs } : {}),
        ...(digerleri.length ? { historic: digerleri } : {}),
      };
    });
}

/**
 * Kullanıcının yazdığı metnin tarihî bir ad olup olmadığını söyler —
 * arayüzdeki "Elaziz → Elazığ" ipucu için.
 *
 * TAM eşleşme arıyor, önek değil: "Elaz" yazarken "Elaziz → Elazığ" demek,
 * kullanıcı henüz o adı yazmamışken onun adına varsayımda bulunmak olurdu.
 */
export function historicHint(text: string): { typed: string; modern: string } | null {
  const t = text.trim();
  if (!t) return null;
  const anahtar = Object.keys(HISTORIC_TO_MODERN).find(
    (eski) => normalizeHistoric(eski) === normalizeHistoric(t)
  );
  if (!anahtar) return null;
  return { typed: anahtar, modern: HISTORIC_TO_MODERN[anahtar] };
}
