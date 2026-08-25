// Ego (kişi merkezli) çevre grafiği için saf yerleşim geometrisi.
//
// "Çevre" görünümü seçili bir kişiyi merkeze koyar; onunla doğrudan bağı olan
// herkesi (anne-baba, eş, çocuk, kardeş ve aile-dışı yakınlar) merkez etrafına
// kategori bazlı yelpazelerle yerleştirir. Bu dosya SADECE geometridir —
// çerçeveden, React'ten ve veri modelinden bağımsız, bu yüzden birim testlenir.

/** Bağ kategorileri. Anne-baba üstte, çocuk altta, eş sağda, kardeş solda,
 *  aile-dışı yakınlar (çevre) sol-altta konumlanır. */
export type EgoCategory = "parent" | "partner" | "child" | "sibling" | "associate";

export interface EgoAlter {
  id: string;
  category: EgoCategory;
}

export interface EgoPoint {
  id: string;
  category: EgoCategory;
  /** Yerleşim merkezine göre mutlak koordinat (px). */
  x: number;
  y: number;
  /** Radyan cinsinden açı (0 = sağ, saat yönünde artar; y aşağı büyür). */
  angle: number;
}

export interface EgoLayout {
  points: EgoPoint[];
  /** Merkez düğümün konumu. */
  cx: number;
  cy: number;
  /** Alterların yerleştiği yarıçap (px). */
  radius: number;
  /** İçeriği saran kutu (px) — SVG viewBox için. */
  width: number;
  height: number;
}

export interface EgoLayoutOptions {
  /** Düğüm merkezleri arası hedef yay uzunluğu (px) — çakışmayı önler. */
  arcSpacing?: number;
  /** Taban yarıçap (px). Kalabalıkta otomatik büyür. */
  baseRadius?: number;
  /** Bir düğümün kapladığı yaklaşık kutu (px) — kenar boşluğu hesabı için. */
  nodeSize?: number;
  /** Kategori başına çapa açısı (radyan). Verilmezse varsayılan kullanılır. */
  anchors?: Partial<Record<EgoCategory, number>>;
}

const DEG = Math.PI / 180;

// Çapa açıları: y AŞAĞI büyüdüğü için "üst" = -90°, "alt" = +90°.
const DEFAULT_ANCHORS: Record<EgoCategory, number> = {
  parent: -90 * DEG, // üst
  partner: 0, // sağ
  child: 90 * DEG, // alt
  sibling: 180 * DEG, // sol
  associate: 160 * DEG, // sol
};

// Aile-dışı yakınlar kan/evlilik bağı olmadığından dış halkaya alınır — hem
// anlamca (çevre = dışta) hem de çocuk/kardeş yelpazeleriyle çakışmasın diye.
const RING_MULTIPLIER: Record<EgoCategory, number> = {
  parent: 1,
  partner: 1,
  child: 1,
  sibling: 1,
  associate: 1.42,
};

// Yelpaze sırası: her kategori çapasının etrafında düğümler bu sırayla açılır.
const CATEGORY_ORDER: EgoCategory[] = ["parent", "partner", "child", "sibling", "associate"];

/**
 * Alterları merkez etrafına yerleştirir. Her kategori kendi çapa açısında,
 * düğümleri çapayı ortalayan bir yelpazeyle dağıtılır. Yelpaze belli bir açıyı
 * (maxSpan) aşacaksa iç içe alt-halkalara sarılır; böylece çok çocuklu/kardeşli
 * kişilerde bile düğümler çakışmaz. Yarıçap, en kalabalık halkadaki düğümlerin
 * yay aralığı hedefe ulaşacak kadar büyütülür.
 */
export function layoutEgo(alters: EgoAlter[], opts: EgoLayoutOptions = {}): EgoLayout {
  const arcSpacing = opts.arcSpacing ?? 116;
  const baseRadius = opts.baseRadius ?? 210;
  const nodeSize = opts.nodeSize ?? 104;
  const anchors = { ...DEFAULT_ANCHORS, ...(opts.anchors ?? {}) };

  // Kategoriye göre grupla (sabit sıra).
  const groups = new Map<EgoCategory, string[]>();
  for (const cat of CATEGORY_ORDER) groups.set(cat, []);
  for (const a of alters) {
    if (!groups.has(a.category)) groups.set(a.category, []);
    groups.get(a.category)!.push(a.id);
  }

  // Bir yelpazedeki komşu düğümler arası açısal adım — sabit; çakışmayı
  // yarıçapı büyüterek önleriz (yay uzunluğu = yarıçap × açı).
  const step = 26 * DEG;
  // Bir alt-halkanın kaplayabileceği en geniş açı; aşılırsa dış halkaya sar.
  const maxSpan = 150 * DEG;
  const perRing = Math.max(1, Math.floor(maxSpan / step) + 1);
  const ringGap = nodeSize * 1.15;

  // En kalabalık alt-halkaya göre gerekli taban yarıçapı: yay uzunluğu ≥ arcSpacing.
  let maxRingCount = 0;
  for (const ids of groups.values()) {
    const c = Math.min(ids.length, perRing);
    if (c > maxRingCount) maxRingCount = c;
  }
  const neededByArc = maxRingCount > 1 ? arcSpacing / step : 0;
  const radius = Math.max(baseRadius, neededByArc);

  const points: EgoPoint[] = [];
  for (const cat of groups.keys()) {
    const ids = groups.get(cat)!;
    if (ids.length === 0) continue;
    const anchor = anchors[cat] ?? 0;
    const catBaseR = radius * (RING_MULTIPLIER[cat] ?? 1);
    ids.forEach((id, i) => {
      const ring = Math.floor(i / perRing);
      const idxInRing = i % perRing;
      // Bu alt-halkadaki toplam düğüm sayısı (son halka eksik olabilir).
      const inThisRing = Math.min(perRing, ids.length - ring * perRing);
      const span = (inThisRing - 1) * step;
      const start = anchor - span / 2;
      const angle = inThisRing === 1 ? anchor : start + idxInRing * step;
      const r = catBaseR + ring * ringGap;
      points.push({
        id,
        category: cat,
        angle,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
      });
    });
  }

  // Saran kutu: en uçtaki düğüm merkezleri + yarım düğüm + kenar payı.
  const pad = nodeSize / 2 + 24;
  let maxX = 0;
  let maxY = 0;
  for (const p of points) {
    if (Math.abs(p.x) + pad > maxX) maxX = Math.abs(p.x) + pad;
    if (Math.abs(p.y) + pad > maxY) maxY = Math.abs(p.y) + pad;
  }
  // Merkez düğüm de sığsın (alter yoksa bile).
  maxX = Math.max(maxX, pad);
  maxY = Math.max(maxY, pad);

  const width = maxX * 2;
  const height = maxY * 2;
  const cx = maxX;
  const cy = maxY;

  return {
    points: points.map((p) => ({ ...p, x: p.x + cx, y: p.y + cy })),
    cx,
    cy,
    radius,
    width,
    height,
  };
}
