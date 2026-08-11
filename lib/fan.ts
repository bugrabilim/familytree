import type { Person } from "@/types/family";

/**
 * Yelpaze (fan) grafiği için saf geometri + Sosa/Ahnentafel çekirdeği.
 *
 * Bu modül bilinçli olarak React'ten ve `@/` değer importlarından arındırıldı:
 * yalnızca tip importu (`@/types/family`) kullanır — çalışma zamanında silinir —
 * ve hiç göreli değer importu içermez. Böylece hem `tsc --noEmit` temiz kalır
 * (uzantı/alias sorunu yok) hem de `node --experimental-strip-types` ile
 * doğrudan test edilebilir. `indexPeople`/`getParents` mantığı burada, dışa
 * bağımlılık olmadan, küçük saf yardımcılar olarak yeniden yazıldı.
 */

/** Kişi kimliğinden kişiye eşleme. */
type PersonIndex = Map<string, Person>;

function indexPeople(people: Person[]): PersonIndex {
  return new Map(people.map((p) => [p.id, p]));
}

function getParents(person: Person, idx: PersonIndex): Person[] {
  return person.parentIds
    .map((id) => idx.get(id))
    .filter((p): p is Person => !!p);
}

/** Yelpaze yerleşim ayarları — açıklık ve halka kalınlıkları. */
export interface FanLayout {
  /** Yelpazenin toplam açısı (derece). 270 = üç çeyrek daire. */
  spanDeg: number;
  /** Merkez (kök) dairesinin yarıçapı. */
  centerRadius: number;
  /** Her ata halkasının kalınlığı. */
  ringThickness: number;
}

export const DEFAULT_LAYOUT: FanLayout = {
  spanDeg: 270,
  centerRadius: 52,
  ringThickness: 58,
};

/** Yerleştirilmiş bir yelpaze dilimi (dolu ya da boş ata yuvası). */
export interface FanNode {
  /** Sosa/Ahnentafel numarası: kök = 1, baba = 2, anne = 3, … */
  sosa: number;
  /** Kuşak: 0 = kök (merkez), 1 = ebeveynler, … */
  gen: number;
  /** Yuvadaki kişi; bilinmiyorsa (boş dilim) undefined. */
  person?: Person;
  /** Dilimin başlangıç açısı — derece, 0 = yukarı, saat yönü artı. */
  startAngle: number;
  /** Dilimin bitiş açısı. */
  endAngle: number;
  /** Dilimin orta açısı (etiket yerleşimi için). */
  midAngle: number;
  /** İç yarıçap. */
  innerRadius: number;
  /** Dış yarıçap. */
  outerRadius: number;
}

/** Kuşak sınırlarını makul aralığa (0–8) kıstırır. */
export function clampGenerations(g: number): number {
  if (!Number.isFinite(g)) return 0;
  return Math.max(0, Math.min(8, Math.floor(g)));
}

/** Baba önce, anne sonra — PedigreeView ile tutarlı sıralama. */
function orderedParents(
  person: Person,
  idx: ReturnType<typeof indexPeople>
): [Person | undefined, Person | undefined] {
  const parents = getParents(person, idx);
  const father =
    parents.find((p) => p.gender === "male") ??
    parents.find((p) => p.gender === "unknown" || p.gender === "other");
  const mother =
    parents.find((p) => p.gender === "female") ??
    parents.find((p) => p !== father);
  return [father, mother];
}

/**
 * Kutupsal koordinat → SVG (x, y). Açı 0 = yukarı (kuzey), saat yönünde artar.
 */
export function polarToXy(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}

/**
 * Bir halka dilimini (annular sector) çizen SVG path verisi.
 * gen 0 için (innerRadius = 0) tam bir daire/pasta dilimi üretir.
 */
export function wedgePath(cx: number, cy: number, node: FanNode): string {
  const { innerRadius: r0, outerRadius: r1, startAngle: a0, endAngle: a1 } = node;
  const large = a1 - a0 > 180 ? 1 : 0;

  const outerStart = polarToXy(cx, cy, r1, a0);
  const outerEnd = polarToXy(cx, cy, r1, a1);

  if (r0 <= 0.0001) {
    // Merkez pasta dilimi
    return [
      `M ${cx.toFixed(2)} ${cy.toFixed(2)}`,
      `L ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
      `A ${r1.toFixed(2)} ${r1.toFixed(2)} 0 ${large} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
      "Z",
    ].join(" ");
  }

  const innerStart = polarToXy(cx, cy, r0, a0);
  const innerEnd = polarToXy(cx, cy, r0, a1);
  return [
    `M ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    `L ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${r1.toFixed(2)} ${r1.toFixed(2)} 0 ${large} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${r0.toFixed(2)} ${r0.toFixed(2)} 0 ${large} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

/**
 * Kökten yukarı Sosa/Ahnentafel yürüyüşü + dilim geometrisi.
 *
 * - Kök: sosa 1, kuşak 0, merkez.
 * - sosa n'in babası = 2n, annesi = 2n+1.
 * - Dolu bir yuvanın eksik ebeveyni için tek bir soluk boş dilim çizilir;
 *   boş yuvaların ataları (tümüyle boş alt ağaçlar) çizilmez.
 */
export function buildFanNodes(
  people: Person[],
  rootId: string | undefined,
  generations: number,
  layout: FanLayout = DEFAULT_LAYOUT
): FanNode[] {
  const idx = indexPeople(people);
  const root = rootId ? idx.get(rootId) : undefined;
  if (!root) return [];

  const gens = clampGenerations(generations);
  const { spanDeg, centerRadius, ringThickness } = layout;
  const startDeg = -spanDeg / 2;

  // Sosa → kişi eşlemesi (boş yuvalar için undefined tutulur)
  const bySosa = new Map<number, Person | undefined>();
  bySosa.set(1, root);
  for (let g = 1; g <= gens; g++) {
    for (let s = 2 ** g; s < 2 ** (g + 1); s++) {
      const child = bySosa.get(s >> 1);
      if (!child) {
        bySosa.set(s, undefined);
        continue;
      }
      const [father, mother] = orderedParents(child, idx);
      bySosa.set(s, s % 2 === 0 ? father : mother);
    }
  }

  const nodes: FanNode[] = [];
  for (let g = 0; g <= gens; g++) {
    const slots = 2 ** g;
    const wedge = spanDeg / slots;
    const innerRadius = g === 0 ? 0 : centerRadius + (g - 1) * ringThickness;
    const outerRadius = g === 0 ? centerRadius : centerRadius + g * ringThickness;

    for (let i = 0; i < slots; i++) {
      const sosa = slots + i;
      const person = bySosa.get(sosa);
      const parentPerson = g === 0 ? root : bySosa.get(sosa >> 1);
      // Kök hep çizilir; diğer yuvalar yalnızca kendisi ya da çocuğu (köke
      // doğru olan) doluysa çizilir — böylece boş alt ağaçlar taşmaz.
      if (g > 0 && !person && !parentPerson) continue;

      const startAngle = startDeg + i * wedge;
      const endAngle = startAngle + wedge;
      nodes.push({
        sosa,
        gen: g,
        person,
        startAngle,
        endAngle,
        midAngle: (startAngle + endAngle) / 2,
        innerRadius,
        outerRadius,
      });
    }
  }
  return nodes;
}

/** Yelpazeyi saran kare viewBox'ın bir kenar uzunluğu. */
export function fanExtent(generations: number, layout: FanLayout = DEFAULT_LAYOUT): number {
  const gens = clampGenerations(generations);
  return layout.centerRadius + gens * layout.ringThickness;
}
