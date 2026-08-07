"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Person } from "@/types/family";
import Avatar, { genderTone } from "./ui/Avatar";
import { lifeSpan } from "@/lib/date";
import type { RelationType } from "@/lib/actions";

export interface PersonNodeData extends Record<string, unknown> {
  person: Person;
  selected: boolean;
  dimmed: boolean;
  canAddParent: boolean;
  onSelect: (id: string) => void;
  onQuickAdd: (relation: RelationType, targetId: string) => void;
}

/** Kartın kenarındaki "+" düğmesi */
function AddNub({
  label,
  position,
  onClick,
}: {
  label: string;
  position: "top" | "bottom" | "right";
  onClick: (e: React.MouseEvent) => void;
}) {
  const pos = {
    top: "left-1/2 -translate-x-1/2 -top-3",
    bottom: "left-1/2 -translate-x-1/2 -bottom-3",
    right: "-right-3 top-1/2 -translate-y-1/2",
  }[position];

  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`
        nodrag absolute ${pos} z-20
        w-6 h-6 rounded-full grid place-items-center
        bg-primary text-primary-text shadow-float
        opacity-0 scale-75 pointer-events-none
        group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
        group-data-[sel=true]:opacity-100 group-data-[sel=true]:scale-100 group-data-[sel=true]:pointer-events-auto
        hover:brightness-110 hover:scale-110
        transition-all duration-150
      `}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function PersonNode({ data }: NodeProps) {
  const { person, selected, dimmed, canAddParent, onSelect, onQuickAdd } =
    data as unknown as PersonNodeData;

  const tone = genderTone(person.gender);
  const years = lifeSpan(person.birthDate, person.deathDate);
  const deceased = !!person.deathDate;

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };

  return (
    <div className="group relative" data-sel={selected}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />

      <button
        onClick={() => onSelect(person.id)}
        className={`
          relative w-[188px] text-left
          bg-surface rounded-2xl px-3 py-2.5
          border-2 transition-all duration-200
          ${selected
            ? "border-primary shadow-float -translate-y-0.5"
            : `${tone.border} shadow-card hover:shadow-float hover:-translate-y-0.5`}
          ${dimmed ? "opacity-30" : "opacity-100"}
        `}
      >
        {/* Cinsiyet şeridi */}
        <span
          className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
          style={{ background: tone.css }}
          aria-hidden
        />

        <div className="flex items-center gap-2.5 pl-1.5">
          <div className="relative shrink-0">
            <Avatar person={person} size="md" />
            {deceased && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-surface border border-border grid place-items-center text-[9px] leading-none text-text-subtle"
                title="Vefat etti"
              >
                ✝
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[13px] leading-tight text-text truncate">
              {person.firstName || "İsimsiz"}
            </p>
            <p className="text-[12px] leading-tight text-text-muted truncate">
              {person.lastName}
            </p>
            {years && (
              <p className="text-[11px] leading-tight text-text-subtle mt-0.5 tabular-nums">
                {years}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Hızlı ekleme düğmeleri */}
      {canAddParent && (
        <AddNub label="Ebeveyn ekle" position="top" onClick={stop(() => onQuickAdd("parent", person.id))} />
      )}
      <AddNub label="Çocuk ekle" position="bottom" onClick={stop(() => onQuickAdd("child", person.id))} />
      <AddNub label="Eş ekle" position="right" onClick={stop(() => onQuickAdd("spouse", person.id))} />
    </div>
  );
}

export default memo(PersonNode);
