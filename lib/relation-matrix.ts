/**
 * "Çapraz İlişki Rehberi" (Madde 14) için SAF yerleşim mantığı — postacı sokak
 * rehberi / mesafe cetveli mantığıyla: satır ve sütun başlıklarında aynı kişiler,
 * kesişimde ilişki. Bu modül yalnız SIRALAMA + KOORDİNAT İNDEKSİ üretir (ilişki
 * metni değil); böylece bağımlılıksız ve birim testine uygun kalır. İlişki
 * hücreleri çağıran bileşende `describeRelation` ile doldurulur.
 */

export interface MatrixEntry {
  id: string;
  name: string;
  gen: number;
  birthYear?: number;
}

export interface MatrixLayout {
  /** Matris satır/sütun sırası (kuşak → doğum yılı → ad). */
  order: MatrixEntry[];
  /** Alfabetik koordinat indeksi — her kişinin matristeki 1-tabanlı konumu. */
  index: Array<{ id: string; name: string; row: number; col: number }>;
  /** Sığdırma için kısaltıldı mı (total > limit). */
  truncated: boolean;
  /** Toplam kişi (kısaltmadan önce). */
  total: number;
}

const coll = new Intl.Collator("tr");

/**
 * Matris düzenini kur. `order`: kuşağa, sonra doğum yılına, sonra ada göre
 * sıralı ve `limit` ile kırpılmış kişiler (büyük ağaçlarda tablo taşmasın).
 * `index`: alfabetik liste; her kişi matristeki konumuna (satır=sütun) eşlenir.
 */
export function buildMatrixLayout(entries: MatrixEntry[], limit = 30): MatrixLayout {
  const sorted = [...entries].sort(
    (a, b) =>
      a.gen - b.gen ||
      (a.birthYear ?? 9999) - (b.birthYear ?? 9999) ||
      coll.compare(a.name, b.name)
  );
  const order = sorted.slice(0, Math.max(0, limit));

  // 1-tabanlı konum eşlemesi (matris sırasına göre)
  const posOf = new Map<string, number>();
  order.forEach((e, i) => posOf.set(e.id, i + 1));

  const index = [...order]
    .sort((a, b) => coll.compare(a.name, b.name))
    .map((e) => {
      const pos = posOf.get(e.id)!;
      return { id: e.id, name: e.name, row: pos, col: pos };
    });

  return { order, index, truncated: entries.length > order.length, total: entries.length };
}
