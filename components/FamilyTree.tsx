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

const NODE_W = 188;
const NODE_H = 76;
const GEN_GAP = 118;

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

function layout(people: Person[], unions: Union[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: GEN_GAP / 2, nodesep: 34, marginx: 60, marginy: 60 });

  for (const p of people) g.setNode(p.id, { width: NODE_W, height: NODE_H });
  for (const u of unions) g.setNode(u.id, { width: 8, height: 8 });

  for (const u of unions) {
    for (const pid of u.parentIds) g.setEdge(pid, u.id, { weight: 3 });
    for (const cid of u.childIds) g.setEdge(u.id, cid, { weight: 2 });
  }

  dagre.layout(g);

  const pos = new Map<string, { x: number; y: number }>();
  for (const p of people) {
    const n = g.node(p.id);
    if (n) pos.set(p.id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 });
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
  highlightIds?: Set<string>;
  onSelect: (id: string) => void;
  onQuickAdd: (relation: RelationType, targetId: string) => void;
}

function Canvas({ people, selectedId, highlightIds, onSelect, onQuickAdd }: Props) {
  const { fitView, setCenter } = useReactFlow();
  const initialised = useRef(false);

  const ids = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const unions = useMemo(() => buildUnions(people, ids), [people, ids]);
  const positions = useMemo(() => layout(people, unions), [people, unions]);

  const nodes = useMemo<Node[]>(() => {
    const personNodes: Node[] = people.map((p) => {
      const data: PersonNodeData = {
        person: p,
        selected: p.id === selectedId,
        dimmed: !!highlightIds && !highlightIds.has(p.id),
        canAddParent: p.parentIds.length < 2,
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
  }, [people, unions, positions, selectedId, highlightIds, onSelect, onQuickAdd]);

  const edges = useMemo<Edge[]>(() => {
    const out: Edge[] = [];
    const dim = (a: string, b: string) =>
      highlightIds ? !highlightIds.has(a) || !highlightIds.has(b) : false;

    for (const u of unions) {
      for (const pid of u.parentIds) {
        const faded = highlightIds ? !highlightIds.has(pid) : false;
        out.push({
          id: `${pid}->${u.id}`,
          source: pid,
          target: u.id,
          type: "smoothstep",
          style: {
            stroke: "var(--border-strong)",
            strokeWidth: 1.6,
            opacity: faded ? 0.2 : 1,
          },
        });
      }
      for (const cid of u.childIds) {
        const faded = highlightIds ? !highlightIds.has(cid) : false;
        out.push({
          id: `${u.id}->${cid}`,
          source: u.id,
          target: cid,
          type: "smoothstep",
          style: {
            stroke: "var(--primary)",
            strokeWidth: 1.8,
            opacity: faded ? 0.2 : 0.85,
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
          stroke: bosanmis ? "var(--text-subtle)" : "var(--female)",
          strokeWidth: 1.4,
          strokeDasharray: bosanmis ? "2 5" : "4 4",
          opacity: dim(a, b) ? 0.2 : bosanmis ? 0.45 : 0.7,
        },
      });
    };

    for (const p of people) {
      for (const sid of p.spouseIds) esKenari(p.id, sid, false);
      for (const sid of p.formerSpouseIds ?? []) esKenari(p.id, sid, true);
    }

    return out;
  }, [people, unions, ids, highlightIds]);

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

  // Seçili kişiyi görünür alana getir
  useEffect(() => {
    if (!selectedId) return;
    const pos = positions.get(selectedId);
    if (!pos) return;
    const t = setTimeout(
      () => setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, { zoom: 0.9, duration: 420 }),
      120
    );
    return () => clearTimeout(t);
  }, [selectedId, positions, setCenter]);

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
