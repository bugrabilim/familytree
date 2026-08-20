import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import { buildUnions, layout, type LayoutDim } from "@/lib/tree-layout";

/**
 * Aile kitabı için tek sayfaya sığan statik "ağaç şeması" (Madde 11). Etkileşim
 * yok: dagre yerleşimiyle kişiler kutu, ebeveyn→çocuk bağları dik köşeli
 * çizgilerle çizilir; SVG viewBox tüm ağacı kapsayacak biçimde ölçeklenir, böylece
 * yazdırıldığında (yatay/manzara sayfa) bir yaprağa oturur. Gizlilik: çağıran
 * taraf maskeli kopya (`view`) geçer.
 */

const DIM: LayoutDim = { w: 96, h: 42, gap: 92, nodesep: 18 };

export default function TreeSchema({ people }: { people: Person[] }) {
  const ids = new Set(people.map((p) => p.id));
  const unions = buildUnions(people, ids);
  const pos = layout(people, unions, DIM);

  // Sınır kutusu — tüm kişi kutularını (ve kenar payını) kapsar.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of people) {
    const pt = pos.get(p.id);
    if (!pt) continue;
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x + DIM.w);
    maxY = Math.max(maxY, pt.y + DIM.h);
  }
  if (!Number.isFinite(minX)) {
    return null;
  }
  const pad = 28;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = maxX - minX + pad * 2;
  const vbH = maxY - minY + pad * 2;

  const centerX = (p: Person) => (pos.get(p.id)?.x ?? 0) + DIM.w / 2;
  const topY = (p: Person) => pos.get(p.id)?.y ?? 0;
  const bottomY = (p: Person) => (pos.get(p.id)?.y ?? 0) + DIM.h;

  // Ebeveyn→birlik→çocuk bağlantıları (dik köşeli). Birlik düğümü küçük bir
  // kavşak; onun y'si ebeveyn ile çocuk sırasının arasındadır.
  const edges: string[] = [];
  for (const u of unions) {
    const up = pos.get(u.id);
    if (!up) continue;
    const juncY = up.y + 4;
    const parents = u.parentIds.map((id) => people.find((p) => p.id === id)).filter((x): x is Person => !!x);
    const children = u.childIds.map((id) => people.find((p) => p.id === id)).filter((x): x is Person => !!x);
    const jx = parents.length
      ? parents.reduce((s, p) => s + centerX(p), 0) / parents.length
      : up.x + 4;
    // Ebeveynlerden kavşağa
    for (const p of parents) {
      edges.push(`M ${centerX(p)} ${bottomY(p)} V ${juncY} H ${jx}`);
    }
    // Kavşaktan çocuklara
    for (const c of children) {
      edges.push(`M ${jx} ${juncY} V ${juncY} H ${centerX(c)} V ${topY(c)}`);
    }
  }

  const genderFill = (g: Person["gender"]) =>
    g === "female" ? "rgba(200,120,150,0.16)" : g === "male" ? "rgba(90,130,180,0.16)" : "rgba(120,120,120,0.12)";
  const genderStroke = (g: Person["gender"]) =>
    g === "female" ? "rgba(170,80,120,0.7)" : g === "male" ? "rgba(60,100,150,0.7)" : "rgba(100,100,100,0.6)";

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className="w-full h-full block"
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      <g fill="none" stroke="rgba(90,70,45,0.5)" strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round">
        {edges.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {people.map((p) => {
        const pt = pos.get(p.id);
        if (!pt) return null;
        const by = p.birthDate?.slice(0, 4);
        const dy = p.deathDate?.slice(0, 4);
        const years = by || dy ? `${by ?? ""}${dy ? `–${dy}` : ""}` : "";
        return (
          <g key={p.id}>
            <rect
              x={pt.x}
              y={pt.y}
              width={DIM.w}
              height={DIM.h}
              rx={6}
              fill={genderFill(p.gender)}
              stroke={genderStroke(p.gender)}
              strokeWidth={0.9}
            />
            <text
              x={pt.x + DIM.w / 2}
              y={pt.y + (years ? 17 : 24)}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="rgba(50,38,26,0.95)"
            >
              {truncate(fullName(p), 15)}
            </text>
            {years && (
              <text
                x={pt.x + DIM.w / 2}
                y={pt.y + 30}
                textAnchor="middle"
                fontSize={9}
                fill="rgba(90,72,50,0.85)"
              >
                {years}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
