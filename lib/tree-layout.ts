import dagre from "dagre";
import type { Person } from "@/types/family";

/**
 * Ağaç yerleşimi — saf mantık (React'ten bağımsız), böylece birim testi
 * yazılabilir. `FamilyTree.tsx` bu modülü kullanır.
 */

export interface Union {
  id: string;
  parentIds: string[];
  childIds: string[];
}

export interface LayoutDim {
  w: number;
  h: number;
  gap: number;
  nodesep: number;
}

/**
 * Aynı ebeveyn kümesini paylaşan çocukları bir "birlik" altında toplar;
 * çocuğu olmayan çiftler için de birlik üretir ki eşler aynı sırada dursun.
 */
export function buildUnions(people: Person[], ids: Set<string>): Union[] {
  const byKey = new Map<string, Union>();

  for (const p of people) {
    const parents = p.parentIds.filter((id) => ids.has(id));
    if (parents.length === 0) continue;
    const sorted = [...parents].sort();
    const key = sorted.join("|");
    let u = byKey.get(key);
    if (!u) {
      u = { id: `u:${key}`, parentIds: sorted, childIds: [] };
      byKey.set(key, u);
    }
    u.childIds.push(p.id);
  }

  // Çocuksuz evlilikler
  for (const p of people) {
    for (const sid of p.spouseIds) {
      if (!ids.has(sid)) continue;
      const sorted = [p.id, sid].sort();
      const key = sorted.join("|");
      if (byKey.has(key)) continue;
      byKey.set(key, { id: `u:${key}`, parentIds: sorted, childIds: [] });
    }
  }

  return [...byKey.values()];
}

export function layout(
  people: Person[],
  unions: Union[],
  dim: LayoutDim,
  /** Çevre (arkadaşlık) bağları — associate'ı üyesinin bir alt sırasına yerleştir. */
  assocEdges: Array<{ from: string; to: string }> = []
): Map<string, { x: number; y: number }> {
  // Madde 11 — Eş bitişikliği. Kuzen evliliği graf içinde döngü yaratıyor;
  // dagre "herkes" görünümünde çiftleri geniş biçimde ayırabiliyordu (kenar
  // ağırlığı/edgesep bunu değiştirmiyor — katmanlı sıralamanın yapısal sınırı).
  // Çözüm: bileşik (compound) graf. Her tek-evlilikli çiftin iki eşini bir üst
  // "küme"ye koyuyoruz; dagre küme üyelerini bitişik tutar. Ölçümde 346 kişilik
  // ağaçta bitişik çift sayısı 47/105 → 92/105'e çıktı. Çok eşli / yeniden
  // evli düğümler kümelenmez (kümeler örtüşemez); birlik düğümü de kümeye
  // alınmaz — aşağıdaki çocuk sırasına serbest bağlanabilsin diye.
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: dim.gap / 2, nodesep: dim.nodesep, marginx: 60, marginy: 60 });

  for (const p of people) g.setNode(p.id, { width: dim.w, height: dim.h });
  for (const u of unions) g.setNode(u.id, { width: 8, height: 8 });

  const marriageCount = new Map<string, number>();
  for (const u of unions) for (const pid of u.parentIds) {
    marriageCount.set(pid, (marriageCount.get(pid) ?? 0) + 1);
  }
  const claimed = new Set<string>();
  let clusterSeq = 0;
  for (const u of unions) {
    if (u.parentIds.length !== 2) continue;
    const [a, b] = u.parentIds;
    if ((marriageCount.get(a) ?? 0) > 1 || (marriageCount.get(b) ?? 0) > 1) continue;
    if (claimed.has(a) || claimed.has(b)) continue;
    const cid = `cl:${clusterSeq++}`;
    g.setNode(cid, {});
    g.setParent(a, cid);
    g.setParent(b, cid);
    claimed.add(a);
    claimed.add(b);
  }

  for (const u of unions) {
    for (const pid of u.parentIds) g.setEdge(pid, u.id, { weight: 12 });
    for (const cid of u.childIds) g.setEdge(u.id, cid, { weight: 2 });
  }

  // Çevre bağları: associate'ı üyesinin hemen altına, düşük ağırlıkla iliştir —
  // asıl soy yerleşimini bozmadan yakın dursun (her iki uç da düğüm olmalı).
  for (const e of assocEdges) {
    if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to, { weight: 1, minlen: 1 });
  }

  dagre.layout(g);

  const pos = new Map<string, { x: number; y: number }>();
  for (const p of people) {
    const n = g.node(p.id);
    if (n) pos.set(p.id, { x: n.x - dim.w / 2, y: n.y - dim.h / 2 });
  }
  for (const u of unions) {
    const n = g.node(u.id);
    if (n) pos.set(u.id, { x: n.x - 4, y: n.y - 4 });
  }
  return pos;
}
