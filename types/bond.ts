/**
 * Duygusal bağ — genogram katmanı.
 *
 * Soy ağacı "kim kimden doğdu"yu anlatır; genogram "kim kiminle nasıl
 * geçiniyor"u. İkisi ayrı sorulardır ve ayrı veri gerektirir: kardeşlik
 * `Person`'dan hesaplanır, ama iki kardeşin arasının kopuk olduğu hiçbir
 * doğum kaydından çıkarılamaz — yalnız biri anlatırsa bilinir.
 *
 * Bu yüzden ayrı bir koleksiyon (`bonds-<treeId>.json`) ve İKİ UÇLU bir
 * kayıt: bağ bir kişinin özelliği değil, iki kişi ARASINDAki şeydir. Bir
 * `Person` alanı olsaydı aynı bağı iki kez (her iki kişide) tutmak ve
 * senkron kalmasını ummak gerekirdi.
 *
 * Bağ YÖNSÜZDÜR: (a,b) ile (b,a) aynı bağdır. `lib/bonds.ts` uçları
 * sıralayarak bunu tek biçime indirger.
 */

/**
 * Genogram'ın standart duygusal ilişki çizgileri. Klinik genogram
 * gösteriminden alındı; serbest metin DEĞİL, çünkü çizim her tür için farklı
 * bir çizgi biçimi kullanır ve süzgeç bunlara göre çalışır.
 */
export type BondType =
  /** Yakın — güvenli, sıcak ilişki. */
  | "yakin"
  /** İç içe — sınırların kaybolduğu aşırı yakınlık (fused/enmeshed). */
  | "icice"
  /** Mesafeli — bağ var ama uzak, seyrek. */
  | "mesafeli"
  /** Çatışmalı — sürekli gerginlik, tartışma. */
  | "catismali"
  /** İç içe ve çatışmalı — hem ayrılamayan hem geçinemeyen (fused-hostile). */
  | "icice-catismali"
  /** Kopuk — ilişki tamamen kesilmiş (cutoff). */
  | "kopuk";

export const BOND_TYPES: readonly BondType[] = [
  "yakin",
  "icice",
  "mesafeli",
  "catismali",
  "icice-catismali",
  "kopuk",
];

export interface Bond {
  id: string;
  /**
   * Bağın iki ucu — `Person.id`. Depoda HER ZAMAN sıralı tutulur (`a < b`),
   * böylece aynı çift için tek bir kanonik biçim olur ve kopya bağ
   * eklenemez. Sıra bir anlam taşımaz; bağ yönsüzdür.
   */
  a: string;
  b: string;
  type: BondType;
  /** "2012'den beri konuşmuyorlar" gibi serbest not. */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** Bir ağacın duygusal bağ listesi — `bonds-<treeId>.json`. */
export interface BondBox {
  bonds: Bond[];
  updatedAt: string;
}
