"use client";

import { memo } from "react";
import { useInternalNode, type EdgeProps } from "@xyflow/react";
import { BOND_STYLES, rectBorderPoint, zigzagPoints } from "@/lib/bonds";
import type { BondType } from "@/types/bond";

/**
 * Genogram duygusal bağ kenarı.
 *
 * Soybağı çizgileri React Flow'un hazır `smoothstep`'i; bu katman ayrı bir
 * kenar türü çünkü genogram gösterimi hazır biçimlerin hiçbirine uymuyor:
 * çatışma ZİGZAG, iç içelik ÇİFT çizgi, kopukluk seyrek KESİK ile anlatılır.
 *
 * Renk yerine biçim: `BOND_STYLES`te renk yok. Türü yalnız renkle ayırsak
 * renk körü bir okur altı türü üç görürdü. Kalınlık + desen + çizgi sayısı
 * renkten bağımsız ayırt edici (bunu `tests/bonds.test.mts` doğruluyor).
 */

/** İki nokta arasında düz çizgi ya da zikzak — SVG yol dizesi. */
function pathOf(
  x1: number, y1: number, x2: number, y2: number,
  zigzag: boolean, offset: number
): string {
  // Dik yönde kaydırma — çift çizgide iki paralel yol için.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * offset;
  const oy = (dx / len) * offset;
  const [ax, ay, bx, by] = [x1 + ox, y1 + oy, x2 + ox, y2 + oy];

  if (!zigzag) return `M ${ax},${ay} L ${bx},${by}`;
  /*
   * Sık ve alçak salınım (varsayılandan dar): bitişik kardeşler arasında
   * yalnız kartların arasındaki ~30 px boşluk görünüyor. Geniş bir zikzak
   * orada tek bir köşe gibi görünür ve çatışma çizgisi düz çizgiden ayırt
   * edilemezdi.
   */
  const pts = zigzagPoints(ax, ay, bx, by, 5, 9);
  return pts.map(([x, y], i) => `${i ? "L" : "M"} ${x},${y}`).join(" ");
}

export interface BondEdgeData extends Record<string, unknown> {
  bondType: BondType;
  /** Vurgu dışında kalan kişilerin bağı soluk çizilir. */
  faded?: boolean;
  /** Erişilebilir başlık — ekran okuyucu ve fare üstü ipucu. */
  label?: string;
}

function BondEdgeInner({ id, source, target, data }: EdgeProps) {
  const d = (data ?? {}) as BondEdgeData;
  /*
   * "Yüzen" kenar: React Flow'un verdiği sourceX/sourceY tutamaç noktalarıdır
   * (kartın altı / üstü). Soybağı için doğru; duygusal bağ ise YANAL —
   * kardeşler yan yana durduğu için alt tutamaçtan üst tutamağa çekilen
   * çizgi kartların İÇİNDEN geçiyordu. Onun yerine iki kartın merkezini
   * birleştiren doğrunun kart kenarlarını kestiği noktaları kullanıyoruz.
   */
  const a = useInternalNode(source);
  const b = useInternalNode(target);
  const aw = a?.measured?.width ?? 0;
  const ah = a?.measured?.height ?? 0;
  const bw = b?.measured?.width ?? 0;
  const bh = b?.measured?.height ?? 0;
  // Düğümler henüz ölçülmediyse çizecek bir şey yok; ölçüm gelince yeniden
  // render olur. Sıfır boyutla çizmek merkeze çakışmış bir nokta bırakırdı.
  if (!a || !b || !aw || !bw) return null;

  const acx = a.internals.positionAbsolute.x + aw / 2;
  const acy = a.internals.positionAbsolute.y + ah / 2;
  const bcx = b.internals.positionAbsolute.x + bw / 2;
  const bcy = b.internals.positionAbsolute.y + bh / 2;
  const [sourceX, sourceY] = rectBorderPoint(acx, acy, aw, ah, bcx, bcy);
  const [targetX, targetY] = rectBorderPoint(bcx, bcy, bw, bh, acx, acy);

  const style = BOND_STYLES[d.bondType] ?? BOND_STYLES.yakin;
  // Çift çizgide iki yol, merkeze göre simetrik kaydırılır.
  const offsets = style.lines === 2 ? [-2.5, 2.5] : [0];

  return (
    <g
      className="bond-edge"
      aria-label={d.label}
      opacity={d.faded ? 0.18 : 0.85}
      pointerEvents="none"
    >
      {d.label ? <title>{d.label}</title> : null}
      {offsets.map((off, i) => (
        <path
          key={`${id}-${i}`}
          d={pathOf(sourceX, sourceY, targetX, targetY, style.zigzag, off)}
          fill="none"
          stroke="var(--bond-line, #ef4444)"
          strokeWidth={style.strokeWidth}
          strokeDasharray={style.dash || undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

export default memo(BondEdgeInner);
