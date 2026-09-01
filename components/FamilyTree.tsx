"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useT } from "@/lib/i18n";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
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
import { isAssociate, isMember } from "@/lib/associates";
import { compareSiblings } from "@/lib/siblings";
import type { Person } from "@/types/family";
import type { RelationType } from "@/lib/actions";

/**
 * Kuşak sayısı arttıkça kartlar okunmaz hâle geliyordu. "Ayrıntı düzeyi"
 * (detail) yükseldikçe kart büyür ve daha çok bilgi gösterir; kalabalıkta
 * küçülüp sadeleşir. Sıra: önce yaş, sonra şehir, sonra kutu/çizgi yüksekliği.
 */
type Detail = 0 | 1 | 2 | 3;

// Dikey (portre) kartlar — üstte avatar, altında ad, altında doğum yılı.
const DIMS: Record<Detail, { w: number; h: number; gap: number; nodesep: number }> = {
  3: { w: 140, h: 126, gap: 116, nodesep: 30 },
  2: { w: 132, h: 114, gap: 100, nodesep: 28 },
  1: { w: 118, h: 98, gap: 78, nodesep: 24 },
  0: { w: 102, h: 82, gap: 60, nodesep: 20 },
};

/** treeDepth (0-8, büyük değer=Tümü) + görünen kişi sayısı → temel ayrıntı düzeyi */
function detailFor(depth: number, count: number): Detail {
  const byDepth: Detail = depth <= 3 ? 3 : depth <= 5 ? 2 : depth <= 7 ? 1 : 0;
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
  /** Tek seferlik "Odakla" isteği: seq her istekte artar, kamera o kişiye gider. */
  locateReq?: { id: string; seq: number };
}

function Canvas({ people, selectedId, focusId, depth = 3, highlightIds, onSelect, onOpen, onDeselect, onQuickAdd, locateReq }: Props) {
  const t = useT();
  const { fitView, setCenter, getZoom, zoomIn, zoomOut } = useReactFlow();

  // Ayrıntı düzeyi YALNIZ kuşak/kalabalıktan belirlenir — yakınlaştırmadan
  // BAĞIMSIZ. Böylece zoom yaparken `dim` (dolayısıyla `positions` düzeni)
  // değişmez; düğümler yer değiştirmez, ekran savrulmaz. Zoom sadece ölçekler.
  const detail = useMemo(() => detailFor(depth, people.length) as Detail, [depth, people.length]);
  const dim = DIMS[detail];

  const ids = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const byIdAll = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const unions = useMemo(() => {
    const u = buildUnions(people, ids);
    // Manuel kardeş sırasını uygula: her birliğin çocuklarını sırala.
    for (const un of u) {
      un.childIds.sort((a, b) => compareSiblings(byIdAll.get(a), byIdAll.get(b)));
    }
    return u;
  }, [people, ids, byIdAll]);
  // Çevre (arkadaşlık) bağları — her iki uç da görünürse, üye→çevre yönünde
  // (dedupe). Yerleşimde associate'ı üyesinin altına iliştirmek + kesikli çizgi.
  const assocEdges = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ from: string; to: string }> = [];
    for (const p of people) {
      for (const a of p.associations ?? []) {
        if (!ids.has(p.id) || !ids.has(a.personId) || p.id === a.personId) continue;
        const other = byIdAll.get(a.personId);
        // Üye→çevre yönü: üye kaynak olsun (associate alt sırada dursun).
        const from = isMember(p) || !other || isAssociate(other) ? p.id : a.personId;
        const to = from === p.id ? a.personId : p.id;
        const key = [from, to].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ from, to });
      }
    }
    return out;
  }, [people, ids, byIdAll]);

  const positions = useMemo(() => layout(people, unions, dim, assocEdges), [people, unions, dim, assocEdges]);

  // Serbest sürükleme (oturum içi): kullanıcı çektiği kartların kimliğini
  // saklarız; render (seçim/zoom) ağacı yeniden kurduğunda bu kartların o anki
  // konumu korunur — kart yerinde kalır. Kalıcı DEĞİL: yerleşim rejimi (ayrıntı
  // düzeyi / kişi sayısı) değişince ya da sayfa yenilenince otomatik düzene döner.
  const draggedIds = useRef<Set<string>>(new Set());
  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (node.type === "person") draggedIds.current.add(node.id);
  }, []);

  const nodes = useMemo<Node[]>(() => {
    const personNodes: Node[] = people.map((p) => {
      const data: PersonNodeData = {
        person: p,
        selected: p.id === selectedId,
        focused: p.id === focusId,
        dimmed: !!highlightIds && !highlightIds.has(p.id),
        canAddParent: p.parentIds.length < 2,
        associate: isAssociate(p),
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
        // Serbest sürükleme açık — bırakılan yerde kalır (oturum içi).
        draggable: true,
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

    // Çevre (arkadaşlık) çizgileri — kesikli, ayırt edici mor ton.
    for (const e of assocEdges) {
      out.push({
        id: `a:${e.from}|${e.to}`,
        source: e.from,
        target: e.to,
        type: "straight",
        style: {
          stroke: "var(--accent, #a855f7)",
          strokeWidth: 1.4,
          strokeDasharray: "2 5",
          opacity: soluk(e.from, e.to) ? 0.2 : 0.7,
        },
      });
    }

    return out;
  }, [people, unions, ids, byId, highlightIds, assocEdges]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);

  // Yerleşim rejimi (ayrıntı düzeyi / kişi sayısı) değişince serbest-sürükleme
  // kilitlerini bırak — yeni otomatik düzen uygulansın. Bu effect, aşağıdaki
  // düğüm-eşitleme effect'inden ÖNCE tanımlı; aynı commit'te önce çalışır.
  useEffect(() => {
    draggedIds.current.clear();
  }, [detail, people.length]);

  // Düğümleri eşitle; kullanıcının sürüklediği kartların KONUMUNU koru (seçim/
  // zoom gibi render'larda yerlerinden oynamasınlar).
  useEffect(() => {
    setRfNodes((prev) => {
      if (draggedIds.current.size === 0) return nodes;
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return nodes.map((n) => {
        if (n.type === "person" && draggedIds.current.has(n.id)) {
          const old = prevById.get(n.id);
          if (old) return { ...n, position: old.position };
        }
        return n;
      });
    });
  }, [nodes, setRfNodes]);
  useEffect(() => setRfEdges(edges), [edges, setRfEdges]);

  const onInit = useCallback((rf: ReactFlowInstance) => {
    requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 0 }));
  }, []);

  /* Görünür kişi kümesi değiştiğinde yeniden sığdır.
     onInit tek başına yetmiyor: düğümler mount'tan sonra bir effect ile
     yerleşiyor, dolayısıyla ilk fitView eksik bir kümeyi ölçüyordu. */
  const nodeCount = people.length;
  const fitKey = useRef("");
  useEffect(() => {
    // Yalnız görünür küme (kişi sayısı) ya da kuşak derinliği GERÇEKTEN
    // değişince yeniden sığdır. Seçim/zoom gibi başka render'larda çalışmaz —
    // böylece kamera kendiliğinden oynamaz.
    const key = `${nodeCount}:${depth}`;
    if (fitKey.current === key) return;
    const first = fitKey.current === "";
    fitKey.current = key;
    const t = setTimeout(() => fitView({ padding: 0.15, duration: first ? 0 : 300 }), 60);
    return () => clearTimeout(t);
  }, [nodeCount, depth, fitView]);

  // Kamera OTOMATİK oynamaz. Yalnız kullanıcı profilde "Odakla"ya basınca
  // (locateReq.seq artar) bir kereliğine o kişiye gider. Seçmek ya da zoom
  // yapmak ekranı savurmaz (3A: tüm otomatik odaklama/merkezleme kaldırıldı).
  const lastLocateSeq = useRef(0);
  useEffect(() => {
    if (!locateReq || locateReq.seq === lastLocateSeq.current) return;
    lastLocateSeq.current = locateReq.seq;
    const pos = positions.get(locateReq.id);
    if (!pos) return;
    const zoom = Math.max(getZoom(), 0.7);
    const drawerAcik =
      typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
    const kaydir = drawerAcik ? 190 / zoom : 0; // panelin yarısı kadar dünya birimi
    const t = setTimeout(
      () => setCenter(pos.x + dim.w / 2 + kaydir, pos.y + dim.h / 2, { zoom, duration: 500 }),
      120
    );
    return () => clearTimeout(t);
  }, [locateReq, positions, setCenter, getZoom, dim.w, dim.h]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
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
      className="bg-bg"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--border)" />
      <Controls
        showInteractive={false}
        showZoom={false}
        showFitView={false}
        position="bottom-right"
        className="!bottom-24 lg:!bottom-6 !right-4"
      >
        {/* Yakınlaştır / Uzaklaştır — React Flow'un varsayılan düğmeleri kapatıldı
           (İngilizce ipucu veriyorlardı); yerine i18n başlıklı düğmeler (#5). */}
        <ControlButton onClick={() => zoomIn({ duration: 200 })} title={t("tree.zoomIn")} aria-label={t("tree.zoomIn")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </ControlButton>
        <ControlButton onClick={() => zoomOut({ duration: 200 })} title={t("tree.zoomOut")} aria-label={t("tree.zoomOut")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </ControlButton>
        {/* Ortala — seçili kişiyi ekranın ortasına getir; seçim yoksa tüm ağacı
           sığdır. (#4) Profil kartındaki "Ortala" da aynı işi yapar. */}
        <ControlButton
          onClick={() => {
            const id = selectedId ?? focusId;
            const pos = id ? positions.get(id) : null;
            if (pos) {
              setCenter(pos.x + dim.w / 2, pos.y + dim.h / 2, { zoom: Math.max(getZoom(), 0.7), duration: 400 });
            } else {
              fitView({ padding: 0.18, duration: 400 });
            }
          }}
          title={t("tree.center")}
          aria-label={t("tree.center")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </ControlButton>
        {/* Tümünü sığdır — tüm ağacı ekrana sığdır (seçimden bağımsız). */}
        <ControlButton
          onClick={() => fitView({ padding: 0.15, duration: 400 })}
          title={t("tree.fitAll")}
          aria-label={t("tree.fitAll")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </ControlButton>
      </Controls>
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
