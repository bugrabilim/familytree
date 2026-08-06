"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import PersonNode from "./PersonNode";
import type { Person } from "@/types/family";

const NODE_WIDTH = 176;
const NODE_HEIGHT = 80;

const nodeTypes = { person: PersonNode };

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "TB", ranksep: 100, nodesep: 40 });

  nodes.forEach((n) => dagreGraph.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));

  // Only parent-child edges drive the layout (not spouse edges)
  edges
    .filter((e) => e.data?.type !== "spouse")
    .forEach((e) => dagreGraph.setEdge(e.source, e.target));

  dagre.layout(dagreGraph);

  return nodes.map((n) => {
    const pos = dagreGraph.node(n.id);
    return {
      ...n,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
    };
  });
}

function buildGraph(people: Person[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = people.map((p) => ({
    id: p.id,
    type: "person",
    data: { ...p },
    position: { x: 0, y: 0 },
  }));

  const edges: Edge[] = [];
  const spousePairs = new Set<string>();

  for (const person of people) {
    for (const parentId of person.parentIds) {
      edges.push({
        id: `parent-${parentId}-${person.id}`,
        source: parentId,
        target: person.id,
        type: "smoothstep",
        style: { stroke: "#15803d", strokeWidth: 2 },
        data: { type: "parent" },
      });
    }

    for (const spouseId of person.spouseIds) {
      const key = [person.id, spouseId].sort().join("-");
      if (!spousePairs.has(key)) {
        spousePairs.add(key);
        edges.push({
          id: `spouse-${key}`,
          source: person.id,
          target: spouseId,
          type: "straight",
          style: {
            stroke: "#ec4899",
            strokeWidth: 1.5,
            strokeDasharray: "5,4",
          },
          label: "♥",
          labelStyle: { fill: "#ec4899", fontSize: 12 },
          data: { type: "spouse" },
        });
      }
    }
  }

  return { nodes, edges };
}

export default function FamilyTree({ people }: { people: Person[] }) {
  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => buildGraph(people),
    [people]
  );

  const layoutedNodes = useMemo(
    () => getLayoutedElements(rawNodes, rawEdges),
    [rawNodes, rawEdges]
  );

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  const onInit = useCallback((rf: { fitView: () => void }) => {
    rf.fitView();
  }, []);

  if (people.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
        <div className="text-6xl">🌱</div>
        <p className="text-lg font-medium">Henüz kimse eklenmemiş</p>
        <a
          href="/person/new"
          className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors text-sm"
        >
          İlk kişiyi ekle
        </a>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onInit={onInit}
      fitView
      minZoom={0.2}
      maxZoom={2}
    >
      <Background color="#e5e7eb" gap={20} />
      <Controls />
      <MiniMap
        nodeColor={(n) => {
          const gender = (n.data as unknown as Person).gender;
          return gender === "female" ? "#fbcfe8" : gender === "male" ? "#bfdbfe" : "#e5e7eb";
        }}
      />
    </ReactFlow>
  );
}
