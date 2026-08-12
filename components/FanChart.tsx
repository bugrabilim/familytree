"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import { indexPeople } from "@/lib/relations";
import { primaryName } from "@/lib/name";
import { genderTone } from "./ui/Avatar";
import { usePrivacy } from "./PrivacyContext";
import { useT } from "@/lib/i18n";
import {
  buildFanNodes,
  fanExtent,
  polarToXy,
  wedgePath,
  type FanNode,
} from "@/lib/fan";

interface Props {
  people: Person[];
  rootId?: string;
  selectedId?: string;
  onSelect: (id: string) => void;
  onSetRoot: (id: string) => void;
}

/** Etiketi halka kalınlığına göre kabaca kısaltır (adlar-yalnız gösterim). */
function fitLabel(name: string, gen: number): string {
  const max = gen <= 1 ? 18 : gen <= 3 ? 12 : gen <= 5 ? 8 : 6;
  if (name.length <= max) return name;
  return name.slice(0, Math.max(1, max - 1)) + "…";
}

export default function FanChart({
  people,
  rootId,
  selectedId,
  onSelect,
  onSetRoot,
}: Props) {
  const [generations, setGenerations] = useState(6);
  const { view } = usePrivacy();
  const t = useT();
  const idx = useMemo(() => indexPeople(people), [people]);

  /** Kök seçilmemişse en uzun ata zincirine sahip kişiyi al (PedigreeView gibi). */
  const varsayilanKok = useMemo(() => {
    let best: Person | undefined;
    let bestDepth = -1;
    for (const p of people) {
      // Kaç kuşak atası var? — basit BFS derinliği
      const seen = new Set<string>([p.id]);
      let queue: string[] = [p.id];
      let depth = 0;
      while (queue.length) {
        const next: string[] = [];
        for (const id of queue) {
          const person = idx.get(id);
          for (const pid of person?.parentIds ?? []) {
            if (!seen.has(pid) && idx.has(pid)) {
              seen.add(pid);
              next.push(pid);
            }
          }
        }
        if (next.length) depth++;
        queue = next;
      }
      if (depth > bestDepth) {
        bestDepth = depth;
        best = p;
      }
    }
    return best;
  }, [people, idx]);

  const root = (rootId ? idx.get(rootId) : undefined) ?? varsayilanKok;

  const nodes = useMemo(
    () => buildFanNodes(people, root?.id, generations),
    [people, root?.id, generations]
  );

  if (!root) {
    return (
      <div className="h-full grid place-items-center text-text-subtle text-sm">
        Görüntülenecek kişi yok
      </div>
    );
  }

  const R = fanExtent(generations);
  const pad = 24;
  const size = 2 * (R + pad);
  const cx = R + pad;
  const cy = R + pad;

  const rootView = view(root);

  return (
    <div className="h-full flex flex-col">
      {/* Kontrol çubuğu — merkez kişi + kuşak sayısı */}
      <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border bg-bg-elevated/60">
        <div className="min-w-0">
          <p className="text-xs text-text-subtle leading-tight">{t("fan.header")}</p>
          <p className="text-sm font-medium text-text truncate max-w-[16rem] sm:max-w-xs">
            {primaryName(rootView)}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="hidden sm:flex items-center gap-2 text-xs text-text-muted">
            {t("fan.generation")}
            <input
              type="range"
              min={4}
              max={8}
              value={generations}
              onChange={(e) => setGenerations(Number(e.target.value))}
              className="w-24 accent-[var(--primary)]"
            />
            <span className="tabular-nums w-3 text-text font-medium">{generations}</span>
          </label>
        </div>
      </div>

      {/* Yelpaze */}
      <div className="flex-1 overflow-auto p-6 sm:p-10">
        <div className="min-h-full grid place-items-center">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-full h-auto max-w-[860px]"
            role="img"
            aria-label={t("fan.ariaLabel", { name: primaryName(rootView) })}
          >
            {nodes.map((node) => (
              <Wedge
                key={node.sosa}
                node={node}
                cx={cx}
                cy={cy}
                selectedId={selectedId}
                view={view}
                onSelect={onSelect}
                onSetRoot={onSetRoot}
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Wedge({
  node,
  cx,
  cy,
  selectedId,
  view,
  onSelect,
  onSetRoot,
}: {
  node: FanNode;
  cx: number;
  cy: number;
  selectedId?: string;
  view: (p: Person) => Person;
  onSelect: (id: string) => void;
  onSetRoot: (id: string) => void;
}) {
  const path = wedgePath(cx, cy, node);
  const raw = node.person;

  // Boş yuva — soluk dilim, etkileşimsiz
  if (!raw) {
    return (
      <path
        d={path}
        fill="var(--surface-2)"
        fillOpacity={0.35}
        stroke="var(--border)"
        strokeWidth={1}
      />
    );
  }

  const person = view(raw);
  const tone = genderTone(person.gender);
  const selected = person.id === selectedId;
  const isRoot = node.gen === 0;

  // Etiket konumu: merkez daire → yatay; halkalar → yarıçap boyunca döndürülmüş
  const labelR = isRoot ? 0 : (node.innerRadius + node.outerRadius) / 2;
  const { x, y } = polarToXy(cx, cy, labelR, node.midAngle);
  let rot = node.midAngle - 90; // yarıçap yönü
  if (rot > 90) rot -= 180;
  if (rot < -90) rot += 180;

  const label = fitLabel(primaryName(person), node.gen);
  const fontSize = isRoot ? 13 : node.gen <= 2 ? 11 : node.gen <= 4 ? 9 : 7.5;

  const title = `${primaryName(person)} — Sosa ${node.sosa}`;

  return (
    <g
      className="cursor-pointer"
      onClick={() => onSelect(person.id)}
      onDoubleClick={() => onSetRoot(person.id)}
    >
      <title>{title}</title>
      <path
        d={path}
        fill={tone.css}
        fillOpacity={selected ? 0.42 : isRoot ? 0.3 : 0.16}
        stroke={selected ? "var(--primary)" : "var(--border)"}
        strokeWidth={selected ? 2.5 : 1}
        className="transition-[fill-opacity] duration-150 hover:[fill-opacity:0.32]"
      />
      {isRoot ? (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={600}
          fill="var(--text)"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {label}
        </text>
      ) : (
        <text
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(${rot.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})`}
          fontSize={fontSize}
          fontWeight={selected ? 600 : 500}
          fill="var(--text)"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {label}
        </text>
      )}
    </g>
  );
}
