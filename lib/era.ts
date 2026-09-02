/**
 * Tarihsel bağlam indeksi — SAF, bağımlılıksız.
 *
 * Bir kayıttaki "1939" yalnız bir sayıdır. "1939 — Erzincan depremi, 9
 * yaşındaydı" bir hayattır. Bu dosya, kişinin ömrünü Türkiye tarihinin
 * içine oturtur.
 *
 * ## Kapsam kararı: yalnız ZAMAN ekseni
 *
 * Olaylar burada **yere bağlanmaz**. "Mübadele" ya da "Erzincan depremi"ni
 * kişinin doğum yerine bağlamak, Osmanlı ↔ modern yer adı sözlüğünü
 * (yapım sırası 41) gerektirir. Bu dosya onu beklemesin diye zaman ekseniyle
 * sınırlı tutuldu; yer eşlemesi sözlük geldiğinde ÜSTÜNE bir katman olarak
 * eklenir. Yani burada "o yıllarda yaşadı" denir, "bundan etkilendi" denmez.
 *
 * ## Seçim ölçütü
 *
 * Sıradan bir ailenin hayatına dokunan olaylar: savaş ve seferberlik, göç,
 * afet, salgın, kayıtları/adları değiştiren yasalar, geniş ekonomik sarsıntılar.
 * Anlatı değil, tarih ve ad. Yorum arayüzün değil, ailenin işi.
 *
 * Adlar `lib/i18n-dict.ts` içinde `era.<id>` anahtarıyla, TR ve EN olarak durur.
 */

export type EraKind =
  | "savas"     // savaş, seferberlik
  | "goc"       // göç, mübadele
  | "afet"      // deprem, sel
  | "salgin"    // salgın hastalık
  | "hukuk"     // kayıtları/adları değiştiren yasa
  | "ekonomi";  // geniş ekonomik sarsıntı

export interface Era {
  /** i18n anahtarı `era.<id>` olarak çözülür. */
  id: string;
  kind: EraKind;
  /** Başlangıç yılı (dâhil). */
  from: number;
  /** Bitiş yılı (dâhil). Tek yıllık olayda `from` ile aynı. */
  to: number;
}

/**
 * Türkiye tarihinde aile kayıtlarında iz bırakan olaylar, kronolojik.
 * Tek yıllık olaylarda `from === to`.
 */
export const ERAS: readonly Era[] = [
  { id: "harbi93", kind: "savas", from: 1877, to: 1878 },
  { id: "balkanSavaslari", kind: "savas", from: 1912, to: 1913 },
  { id: "seferberlik", kind: "savas", from: 1914, to: 1918 },
  { id: "ispanyolGribi", kind: "salgin", from: 1918, to: 1920 },
  { id: "kurtulusSavasi", kind: "savas", from: 1919, to: 1922 },
  { id: "cumhuriyet", kind: "hukuk", from: 1923, to: 1923 },
  { id: "mubadele", kind: "goc", from: 1923, to: 1924 },
  { id: "medeniKanun", kind: "hukuk", from: 1926, to: 1926 },
  { id: "ilkNufusSayimi", kind: "hukuk", from: 1927, to: 1927 },
  { id: "harfDevrimi", kind: "hukuk", from: 1928, to: 1928 },
  { id: "buyukBuhran", kind: "ekonomi", from: 1929, to: 1933 },
  { id: "soyadiKanunu", kind: "hukuk", from: 1934, to: 1934 },
  { id: "ikinciDunyaSavasi", kind: "savas", from: 1939, to: 1945 },
  { id: "erzincan1939", kind: "afet", from: 1939, to: 1939 },
  { id: "varlikVergisi", kind: "ekonomi", from: 1942, to: 1944 },
  { id: "cokPartiliHayat", kind: "hukuk", from: 1946, to: 1946 },
  { id: "koreSavasi", kind: "savas", from: 1950, to: 1953 },
  { id: "bulgaristanGocu1950", kind: "goc", from: 1950, to: 1951 },
  { id: "almanyaIsgucu", kind: "goc", from: 1961, to: 1973 },
  { id: "varto1966", kind: "afet", from: 1966, to: 1966 },
  { id: "gediz1970", kind: "afet", from: 1970, to: 1970 },
  { id: "kibris1974", kind: "savas", from: 1974, to: 1974 },
  { id: "lice1975", kind: "afet", from: 1975, to: 1975 },
  { id: "kararlar24Ocak", kind: "ekonomi", from: 1980, to: 1980 },
  { id: "erzurum1983", kind: "afet", from: 1983, to: 1983 },
  { id: "bulgaristanGocu1989", kind: "goc", from: 1989, to: 1989 },
  { id: "erzincan1992", kind: "afet", from: 1992, to: 1992 },
  { id: "kriz1994", kind: "ekonomi", from: 1994, to: 1994 },
  { id: "marmara1999", kind: "afet", from: 1999, to: 1999 },
  { id: "kriz2001", kind: "ekonomi", from: 2001, to: 2001 },
  { id: "van2011", kind: "afet", from: 2011, to: 2011 },
  { id: "elazigIzmir2020", kind: "afet", from: 2020, to: 2020 },
  { id: "covid19", kind: "salgin", from: 2020, to: 2023 },
  { id: "kahramanmaras2023", kind: "afet", from: 2023, to: 2023 },
] as const;

/** i18n anahtarı — `useT()` ile çözülür. */
export function eraKey(id: string): string {
  return `era.${id}`;
}

export function eraById(id: string): Era | undefined {
  return ERAS.find((e) => e.id === id);
}

/** "YYYY[-MM[-DD]]" → yıl. Kısmi tarihlerde de çalışır. */
function yearOf(stored?: string): number | null {
  const m = stored ? /^(\d{4})/.exec(stored) : null;
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

/** Verilen yıl aralığıyla KESİŞEN olaylar (kronolojik). */
export function erasInRange(fromYear: number, toYear: number): Era[] {
  const lo = Math.min(fromYear, toYear);
  const hi = Math.max(fromYear, toYear);
  return ERAS.filter((e) => e.from <= hi && e.to >= lo);
}

/** O yıl süren olaylar. */
export function erasAt(year: number): Era[] {
  return erasInRange(year, year);
}

export interface LivedEra {
  era: Era;
  /**
   * Olay BAŞLADIĞINDA kişinin yaşı. Kişi olay sürerken doğduysa `null`
   * (negatif yaş uydurmayız — "doğduğunda sürüyordu" ayrı bir durumdur).
   */
  ageAtStart: number | null;
  /** Kişi olayın tamamını görmedi (arada doğdu ya da bitmeden öldü). */
  partial: boolean;
  /** Kişi olay sürerken doğdu. */
  bornDuring: boolean;
}

export interface LifeEraOptions {
  /** Yaşayan kişilerde ömrün üst sınırı (varsayılan: bu yıl). */
  today?: Date;
  /**
   * Yalnız bu türler. **Boş dizi "hiçbiri" demektir**, "filtre yok" değil:
   * arayüzde tüm kutuları kaldıran kullanıcı her şeyi değil hiçbir şeyi
   * görmeli. Filtre istenmiyorsa alan hiç verilmez.
   */
  kinds?: EraKind[];
}

/**
 * Kişinin ömrüne denk gelen olaylar, yaşıyla birlikte.
 *
 * Doğum yılı bilinmiyorsa boş döner: yaş hesaplanamadan "bunu yaşadı" demek
 * tahmin olur. Ölüm yılı yoksa kişi yaşıyor sayılır ve ömür bugüne kadar uzar.
 */
export function erasForLife(
  birthDate?: string,
  deathDate?: string,
  opts: LifeEraOptions = {}
): LivedEra[] {
  const born = yearOf(birthDate);
  if (born === null) return [];
  const died = yearOf(deathDate) ?? (opts.today ?? new Date()).getFullYear();
  if (died < born) return [];

  const kinds = opts.kinds ? new Set(opts.kinds) : null;

  return erasInRange(born, died)
    .filter((e) => !kinds || kinds.has(e.kind))
    .map((e) => {
      const bornDuring = e.from < born;
      return {
        era: e,
        ageAtStart: bornDuring ? null : e.from - born,
        partial: bornDuring || e.to > died,
        bornDuring,
      };
    });
}
