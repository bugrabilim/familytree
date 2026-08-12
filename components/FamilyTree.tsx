"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import PersonNode, { type PersonNodeData } from "./PersonNode";
import { genderTone } from "./ui/Avatar";
import { buildUnions, layout } from "@/lib/tree-layout";
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

/** treeDepth (0-8, büyük değer=Tümü) + görünen kişi sayısı → temel ayrıntı düzeyi */
function detailFor(depth: number, count: number): Detail {
  const byDepth: Detail = depth <= 3 ? 3 : depth <= 5 ? 2 : depth <= 7 ? 1 : 0;
  const byCount: Detail = count > 220 ? 0 : count > 120 ? 1 : count > 60 ? 2 : 3;
  return Math.min(byDepth, byCount) as Detail;
}

/** Yakınlaştırma düzeyi de ayrıntıyı yükseltebilir — kullanıcı zoom yapınca
    kaybolan bilgiler geri gelir. */
function detailFromZoom(zoom: number): Detail {
  return zoom >= 1.15 ? 3 : zoom >= 0.8 ? 2 : zoom >= 0.5 ? 1 : 0;
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

/* Birlik (union) mantığı ve dagre yerleşimi test edilebilir olsun diye saf
   modülde: `lib/tree-layout.ts`. */

/* ---------------------------------------------------------------- */

interface Props {
  people: Person[];
  selectedId?: string;
  focusId?: string;
  /** treeDepth: 0-8 kuşak, büyük değer = Tümü — ayrıntı düzeyini belirler */
  depth?: number;
  highlightIds?: Set<string>;
  /** Tek tık: odak/merkez (panel açılmaz) */
  onSelect: (id: string) => void;
  /** Çift tık: detay panelini aç */
  onOpen?: (id: string) => void;
  onDeselect?: () => void;
  onQuickAdd: (relation: RelationType, targetId: string) => void;
}

function Canvas({ people, selectedId, focusId, depth = 3, highlightIds, onSelect, onOpen, onDeselect, onQuickAdd }: Props) {
  const { fitView, setCenter } = useReactFlow();
  const initialised = useRef(false);
  const prevDepth = useRef(depth);
  const [zoom, setZoom] = useState(1);

  // Temel ayrıntı kuşak/kalabalıktan; yakınlaştırma bunu yükseltebilir.
  const detail = useMemo(
    () => Math.max(detailFor(depth, people.length), detailFromZoom(zoom)) as Detail,
    [depth, people.length, zoom]
  );
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
        onOpen,
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
  }, [people, unions, positions, selectedId, focusId, highlightIds, detail, dim, onSelect, onOpen, onQuickAdd]);

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
  }, [nodeCount, depth, fitView]);

  // Seçili kişiyi görünür alanın ortasına getir.
  // Masaüstünde sağdaki 380px'lik detay paneli tuvalin üstüne biniyor;
  // kartı gerçek görünür alanın ortasına koymak için yatayda kaydırıyoruz.
  // `positions` bağımlılıkta: yeniden yerleşim olursa efekt tekrar çalışıp
  // doğru konuma ortalıyor (ilk çalışmada eski konum ölçülse bile).
  useEffect(() => {
    // Madde 3 — Kuşak derinliği değiştiğinde seçili kişiye ortalama; bunun
    // yerine tüm görünür kümeyi sığdır (yukarıdaki fitView efekti devrede).
    const depthChanged = prevDepth.current !== depth;
    prevDepth.current = depth;
    if (depthChanged) return;

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
  }, [selectedId, positions, depth, setCenter, dim.w, dim.h]);

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
      /* Madde 12 — Büyük ağaçta sanallaştırma: yalnızca görünür alandaki
         düğüm/kenarlar render edilir. Küçük ağaçlarda kapalı tutuyoruz (mount
         sonrası ölçüm ve fitView davranışı aynı kalsın, gereksiz risk yok). */
      onlyRenderVisibleElements={people.length > 150}
      nodesConnectable={false}
      /* Madde 4 — Fare tekerleği ile ZOOM: panOnScroll kaldırıldı; React Flow'un
         varsayılanı olan zoomOnScroll etkin. Panlama sürükleyerek yapılır. */
      selectionOnDrag={false}
      onPaneClick={onDeselect}
      onMoveEnd={(_, vp) => setZoom(vp.zoom)}
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
        className="no-print absolute top-4 right-4 z-10 h-9 px-3 rounded-xl bg-bg-elevated/90 backdrop-blur border border-border shadow-card text-xs font-medium text-text-muted hover:text-text transition-colors"
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
