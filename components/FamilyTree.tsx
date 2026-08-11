"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import PersonNode, { type PersonNodeData } from "./PersonNode";
import { genderTone } from "./ui/Avatar";
import type { Person } from "@/types/family";
import type { RelationType } from "@/lib/actions";

/**
 * Kuşak sayısı arttıkça kartlar okunmaz hâle geliyordu. "Ayrıntı düzeyi"
 * (detail) yükseldikçe kart büyür ve daha çok bilgi gösterir; kalabalıkta
 * küçülüp sadeleşir. Sıra: önce yaş, sonra şehir, sonra kutu/çizgi yüksekliği.
 */
type Detail = 0 | 1 | 2 | 3;

const DIMS: Record<Detail, { w: number; h: number; gap: number; nodesep: number }> = {
  3: { w: 190, h: 98, gap: 130, nodesep: 34 },
  2: { w: 190, h: 82, gap: 108, nodesep: 32 },
  1: { w: 176, h: 66, gap: 84, nodesep: 28 },
  0: { w: 150, h: 50, gap: 60, nodesep: 22 },
};

/** treeDepth (2-8, -1=tümü, 0=herkes) + görünen kişi sayısı → ayrıntı düzeyi */
function detailFor(depth: number, count: number): Detail {
  const byDepth: Detail = depth === 2 || depth === 3 ? 3 : depth === 4 || depth === 5 ? 2 : depth === 6 || depth === 7 ? 1 : 0;
  const byCount: Detail = count > 220 ? 0 : count > 120 ? 1 : count > 60 ? 2 : 3;
  return Math.min(byDepth, byCount) as Detail;
}

/* ---------------------------------------------------------------- */
/* Birlik (union) düğümü — çiftleri yan yana tutar                   */
/* ---------------------------------------------------------------- */

function UnionNode() {
  return (
    <div className="w-1.5 h-1.5 rounded-full bg-border-strong">
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { person: PersonNode, union: UnionNode as unknown as React.FC<NodeProps> };

interface Union {
  id: string;
  parentIds: string[];
  childIds: string[];
}

/**
 * Aynı ebeveyn kümesini paylaşan çocukları bir "birlik" altında toplar;
 * çocuğu olmayan çiftler için de birlik üretir ki eşler aynı sırada dursun.
 */
function buildUnions(people: Person[], ids: Set<string>): Union[] {
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

function layout(people: Person[], unions: Union[], dim: { w: number; h: number; gap: number; nodesep: number }) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: dim.gap / 2, nodesep: dim.nodesep, marginx: 60, marginy: 60 });

  for (const p of people) g.setNode(p.id, { width: dim.w, height: dim.h });
  for (const u of unions) g.setNode(u.id, { width: 8, height: 8 });

  for (const u of unions) {
    for (const pid of u.parentIds) g.setEdge(pid, u.id, { weight: 12 });
    for (const cid of u.childIds) g.setEdge(u.id, cid, { weight: 2 });
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

/* ---------------------------------------------------------------- */

interface Props {
  people: Person[];
  selectedId?: string;
  focusId?: string;
  /** treeDepth: 2-8 kuşak, -1 = tümü, 0 = herkes — ayrıntı düzeyini belirler */
  depth?: number;
  highlightIds?: Set<string>;
  onSelect: (id: string) => void;
  onDeselect?: () => void;
  onQuickAdd: (relation: RelationType, targetId: string) => void;
}

function Canvas({ people, selectedId, focusId, depth = 3, highlightIds, onSelect, onDeselect, onQuickAdd }: Props) {
  const { fitView, setCenter } = useReactFlow();
  const initialised = useRef(false);

  const detail = useMemo(() => detailFor(depth, people.length), [depth, people.length]);
  const dim = DIMS[detail];

  const ids = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const unions = useMemo(() => buildUnions(people, ids), [people, ids]);
  const positions = useMemo(() => layout(people, unions, dim), [people, unions, dim]);

  const nodes = useMemo<Node[]>(() => {
    const personNodes: Node[] = people.map((p) => {
      const data: PersonNodeData = {
        person: p,
        selected: p.id === selectedId,
        focused: p.id === focusId,
        dimmed: !!highlightIds && !highlightIds.has(p.id),
        canAddParent: p.parentIds.length < 2,
        detail,
        width: dim.w,
        height: dim.h,
        onSelect,
        onQuickAdd,
      };
      return {
        id: p.id,
        type: "person",
        position: positions.get(p.id) ?? { x: 0, y: 0 },
        data: data as unknown as Record<string, unknown>,
        draggable: false,
      } as Node;
    });

    const unionNodes: Node[] = unions.map((u) => ({
      id: u.id,
      type: "union",
      position: positions.get(u.id) ?? { x: 0, y: 0 },
      data: {},
      draggable: false,
      selectable: false,
    })) as Node[];

    return [...unionNodes, ...personNodes];
  }, [people, unions, positions, selectedId, focusId, highlightIds, detail, dim, onSelect, onQuickAdd]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    const soluk = (a: string, b: string) =>
      highlightIds ? !highlightIds.has(a) || !highlightIds.has(b) : false;

    // Soybağı çizgileri tek ve nötr bir renkte (ebeveyn→birlik→çocuk kesintisiz
    // okunur); evlilik çizgileri ayrı, sıcak bir tonda. İki temada da net.
    for (const u of unions) {
      for (const pid of u.parentIds) {
        const faded = highlightIds ? !highlightIds.has(pid) : false;
        out.push({
          id: `${pid}->${u.id}`,
          source: pid,
          target: u.id,
          type: "smoothstep",
          style: {
            stroke: "var(--tree-edge)",
            strokeWidth: 1.8,
            opacity: faded ? 0.25 : 1,
          },
        });
      }
      for (const cid of u.childIds) {
        const faded = highlightIds ? !highlightIds.has(cid) : false;
        const child = byId.get(cid);
        const links = u.parentIds.map((pid) => child?.parentLinks?.[pid]);
        // Bu birliğe bağlı tüm bağlar kan bağı dışıysa kesikli çiz
        const evlatlik =
          links.length > 0 &&
          links.every((l) => l?.kind && l.kind !== "biological");
        const kopuk = links.some((l) => !!l?.estranged);

        out.push({
          id: `${u.id}->${cid}`,
          source: u.id,
          target: cid,
          type: "smoothstep",
          style: {
            stroke: kopuk ? "var(--text-subtle)" : "var(--tree-edge)",
            strokeWidth: 1.8,
            strokeDasharray: evlatlik ? "6 4" : kopuk ? "2 6" : undefined,
            opacity: faded ? 0.25 : kopuk ? 0.45 : 1,
          },
        });
      }
    }

    // Eş bağlarını, ortak birliği olmayan çiftler için göster
    const covered = new Set(unions.map((u) => u.parentIds.join("|")));
    const esKenari = (a: string, b: string, bosanmis: boolean) => {
      if (!ids.has(b)) return;
      const key = [a, b].sort().join("|");
      if (covered.has(key)) return;
      covered.add(key);
      out.push({
        id: `s:${key}`,
        source: a,
        target: b,
        type: "straight",
        style: {
          stroke: "var(--tree-edge-spouse)",
          strokeWidth: 1.6,
          strokeDasharray: bosanmis ? "1 5" : "5 4",
          opacity: soluk(a, b) ? 0.2 : bosanmis ? 0.5 : 0.9,
        },
      });
    };

    for (const p of people) {
      for (const sid of p.spouseIds) esKenari(p.id, sid, false);
      for (const sid of p.formerSpouseIds ?? []) esKenari(p.id, sid, true);
    }

    return out;
  }, [people, unions, ids, byId, highlightIds]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);

  useEffect(() => setRfNodes(nodes), [nodes, setRfNodes]);
  useEffect(() => setRfEdges(edges), [edges, setRfEdges]);

  const onInit = useCallback((rf: ReactFlowInstance) => {
    requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 0 }));
  }, []);

  /* Görünür kişi kümesi değiştiğinde yeniden sığdır.
     onInit tek başına yetmiyor: düğümler mount'tan sonra bir effect ile
     yerleşiyor, dolayısıyla ilk fitView eksik bir kümeyi ölçüyordu. */
  const nodeCount = people.length;
  useEffect(() => {
    const t = setTimeout(() => {
      fitView({ padding: 0.15, duration: initialised.current ? 300 : 0 });
      initialised.current = true;
    }, 60);
    return () => clearTimeout(t);
  }, [nodeCount, fitView]);

  // Seçili kişiyi görünür alanın ortasına getir.
  // Masaüstünde sağdaki 380px'lik detay paneli tuvalin üstüne biniyor;
  // kartı gerçek görünür alanın ortasına koymak için yatayda kaydırıyoruz.
  // `positions` bağımlılıkta: yeniden yerleşim olursa efekt tekrar çalışıp
  // doğru konuma ortalıyor (ilk çalışmada eski konum ölçülse bile).
  useEffect(() => {
    if (!selectedId) return;
    const pos = positions.get(selectedId);
    if (!pos) return;
    const zoom = 0.9;
    const drawerAcik =
      typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
    const kaydir = drawerAcik ? 190 / zoom : 0; // panelin yarısı kadar dünya birimi
    const t = setTimeout(
      () => setCenter(pos.x + dim.w / 2 + kaydir, pos.y + dim.h / 2, { zoom, duration: 420 }),
      140
    );
    return () => clearTimeout(t);
  }, [selectedId, positions, setCenter, dim.w, dim.h]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onInit={onInit}
      minZoom={0.15}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      panOnScroll
      selectionOnDrag={false}
      onPaneClick={onDeselect}
      className="bg-bg"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--border)" />
      <Controls
        showInteractive={false}
        position="bottom-right"
        className="!bottom-24 lg:!bottom-6 !right-4"
      />
      <MiniMap
        pannable
        zoomable
        position="bottom-left"
        className="!hidden lg:!block !bottom-6 !left-4"
        bgColor="var(--surface)"
        maskColor="color-mix(in srgb, var(--bg) 78%, transparent)"
        maskStrokeColor="var(--border-strong)"
        nodeColor={(n) => {
          if (n.type === "union") return "transparent";
          const p = (n.data as unknown as PersonNodeData)?.person;
          return p ? genderTone(p.gender).css : "var(--neutral)";
        }}
      />
      <button
        onClick={() => fitView({ padding: 0.18, duration: 400 })}
        className="absolute top-4 right-4 z-10 h-9 px-3 rounded-xl bg-bg-elevated/90 backdrop-blur border border-border shadow-card text-xs font-medium text-text-muted hover:text-text transition-colors"
      >
        Tümünü sığdır
      </button>
    </ReactFlow>
  );
}

export default function FamilyTree(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
