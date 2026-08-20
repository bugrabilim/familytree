import type { aggregatePlaces } from "@/lib/places";
import { projectEquirectangular } from "@/lib/places";
import { COUNTRIES, WORLD_VIEWBOX } from "@/lib/world-map";

/**
 * Kitap içi statik doğum-yeri haritası (Madde 8/11). Etkileşimsiz; noktaları
 * çevreleyen kırpma kutusuyla ilgili bölgeye odaklanır. Gömülü Natural Earth
 * sınırları (lib/world-map) — dış istek yok. Hem ekran kitabı (BookView) hem
 * yazdırılan kitap (PrintView, tam sayfa yatay) aynı bileşeni kullanır.
 */
export default function BookMap({
  located,
  maxCount,
}: {
  located: ReturnType<typeof aggregatePlaces>;
  maxCount: number;
}) {
  const VW = WORLD_VIEWBOX.w;
  const VH = WORLD_VIEWBOX.h;
  const dots = located
    .filter((a) => a.coords)
    .map((a) => {
      const { x, y } = projectEquirectangular(a.coords!.lat, a.coords!.lng, VW, VH);
      return { a, x, y };
    });

  // En büyük 8 yer etiketlenir (kalabalık olmasın).
  const labelSet = new Set(
    [...located].sort((a, b) => b.count - a.count).slice(0, 8).map((a) => a.place)
  );

  // Noktaları çevreleyen kırpma kutusu — kenar payıyla bölgeye odaklan.
  let minX: number = VW, minY: number = VH, maxX = 0, maxY = 0;
  for (const d of dots) {
    minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x); maxY = Math.max(maxY, d.y);
  }
  if (dots.length === 0) { minX = 0; minY = 0; maxX = VW; maxY = VH; }
  const padX = Math.max(70, (maxX - minX) * 0.3);
  const padY = Math.max(50, (maxY - minY) * 0.4);
  const bx = Math.max(0, minX - padX);
  const by = Math.max(0, minY - padY);
  const bw = Math.min(VW - bx, maxX - minX + padX * 2);
  const bh = Math.min(VH - by, maxY - minY + padY * 2);
  const scale = bw / VW; // etiket/çizgi ölçeğini kutuyla orantıla
  const rOf = (c: number) => (3 + 7 * Math.sqrt(c / maxCount)) * Math.max(0.5, scale);

  return (
    <div
      className="flex-1 min-h-0 rounded-lg overflow-hidden border border-black/15"
      style={{ background: "rgba(120,150,170,0.14)" }}
    >
      <svg viewBox={`${bx} ${by} ${bw} ${bh}`} className="w-full h-full block" role="img">
        <g fill="rgba(120,95,60,0.30)" stroke="rgba(90,70,45,0.55)" strokeWidth={0.6 * scale} strokeLinejoin="round">
          {COUNTRIES.map((c, i) => (
            <path key={i} d={c.d} />
          ))}
        </g>
        {dots.map(({ a, x, y }) => {
          const r = rOf(a.count);
          return (
            <g key={a.place}>
              <circle cx={x} cy={y} r={r} fill="rgba(150,40,30,0.5)" stroke="rgba(120,30,20,0.9)" strokeWidth={0.5 * scale} />
              <circle cx={x} cy={y} r={Math.max(0.6, 1.4 * scale)} fill="rgba(90,20,15,0.95)" />
              {labelSet.has(a.place) && (
                <text
                  x={x}
                  y={y - r - 3 * scale}
                  textAnchor="middle"
                  fontSize={9 * scale}
                  fontWeight={600}
                  fill="rgba(74,58,40,0.95)"
                >
                  {a.place.split(",")[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
