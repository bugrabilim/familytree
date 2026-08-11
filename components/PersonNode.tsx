"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Person } from "@/types/family";
import Avatar, { genderTone } from "./ui/Avatar";
import { calcAge, lifeSpan } from "@/lib/date";
import { primaryName, secondaryName } from "@/lib/name";
import type { RelationType } from "@/lib/actions";
import { usePrivacy } from "./PrivacyContext";
import { useReadOnly } from "./ReadOnlyContext";
import { isMasked } from "@/lib/privacy";

export interface PersonNodeData extends Record<string, unknown> {
  person: Person;
  selected: boolean;
  /** Ağacın odaklandığı kişi — kalabalıkta başlangıç noktası */
  focused?: boolean;
  dimmed: boolean;
  canAddParent: boolean;
  /** 3 = en ayrıntılı (yaş+şehir), 0 = en sade (kalabalık) */
  detail?: 0 | 1 | 2 | 3;
  width?: number;
  height?: number;
  onSelect: (id: string) => void;
  /** Çift tık: detay panelini aç */
  onOpen?: (id: string) => void;
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
  const { person: rawPerson, selected, focused, dimmed, canAddParent, detail = 3, width = 190, height = 98, onSelect, onOpen, onQuickAdd } =
    data as unknown as PersonNodeData;

  const { view, hideLiving } = usePrivacy();
  const { readOnly } = useReadOnly();
  const person = view(rawPerson);
  const masked = isMasked(rawPerson, hideLiving);

  const tone = genderTone(person.gender);
  const years = lifeSpan(person.birthDate, person.deathDate);
  const age = calcAge(person.birthDate, person.deathDate);
  const deceased = !!person.deathDate;

  // Ayrıntı düzeyine göre kademeli sadeleşme:
  //   3 → yaş + şehir + yıllar,  2 → şehir + yıllar,  1 → yıllar,  0 → yalnız ad
  const showYears = detail >= 1;
  const showCity = detail >= 2 && !!person.birthPlace;
  const showAge = detail >= 3 && age !== null;
  const avatarSize = detail >= 2 ? "md" : "sm";
  const pad = detail >= 2 ? "px-3 py-2.5" : detail === 1 ? "px-2.5 py-2" : "px-2 py-1.5";

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };

  const alt = secondaryName(person);

  return (
    <div className="group relative" data-sel={selected}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />

      <button
        onClick={() => onSelect(person.id)}
        onDoubleClick={() => onOpen?.(person.id)}
        title="Tık: merkeze al · Çift tık: detay"
        style={{ width, height }}
        className={`
          relative text-left overflow-hidden
          bg-surface rounded-2xl ${pad}
          border-2 transition-all duration-200
          ${selected
            ? "border-primary shadow-float -translate-y-1 scale-[1.06] ring-4 ring-primary/25 z-10"
            : `${tone.border} shadow-card hover:shadow-float hover:-translate-y-0.5`}
          ${dimmed ? "opacity-30" : "opacity-100"}
        `}
      >
        {/* Odak rozeti — ağaçta nereden başladığını gösterir */}
        {focused && !selected && (
          <span
            className="absolute -top-2 -left-2 px-1.5 py-px rounded-full bg-accent text-[9px] font-semibold text-white shadow-soft z-10"
            title="Ağacın odak noktası"
          >
            odak
          </span>
        )}

        {/* Cinsiyet şeridi */}
        <span
          className="absolute left-0 top-2 bottom-2 w-[5px] rounded-r-full"
          style={{ background: tone.css }}
          aria-hidden
        />

        {/* Benzersiz kod */}
        {detail >= 2 && person.code && (
          <span className="absolute right-1.5 top-1 text-[9px] font-mono text-text-subtle/70 tabular-nums">
            {person.code}
          </span>
        )}

        <div className={`flex items-center h-full ${detail >= 2 ? "gap-2.5" : "gap-2"} pl-1.5`}>
          <div className="relative shrink-0">
            <Avatar person={person} size={avatarSize} />
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
            <p className={`font-semibold leading-tight text-text truncate ${detail === 0 ? "text-[12px]" : "text-[13px]"}`}>
              {primaryName(person)}
            </p>
            {alt && (
              <p className="text-[12px] leading-tight text-text-muted truncate">
                {alt}
              </p>
            )}
            {masked ? (
              detail >= 1 && (
                <p className="text-[11px] leading-tight text-text-subtle mt-0.5 truncate">
                  🔒 Yaşayan
                </p>
              )
            ) : (
              <>
                {showYears && years && (
                  <p className="text-[11px] leading-tight text-text-subtle mt-0.5 tabular-nums truncate">
                    {years}
                    {showAge && <span> · {person.deathDate ? `${age} yaşında` : `${age} yaş`}</span>}
                  </p>
                )}
                {showCity && (
                  <p className="text-[10px] leading-tight text-text-subtle truncate">
                    {person.birthPlace}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </button>

      {/* Hızlı ekleme düğmeleri — görüntüleme modunda gizli */}
      {!readOnly && (
        <>
          {canAddParent && (
            <AddNub label="Ebeveyn ekle" position="top" onClick={stop(() => onQuickAdd("parent", person.id))} />
          )}
          <AddNub label="Çocuk ekle" position="bottom" onClick={stop(() => onQuickAdd("child", person.id))} />
          <AddNub label="Eş ekle" position="right" onClick={stop(() => onQuickAdd("spouse", person.id))} />
        </>
      )}
    </div>
  );
}

export default memo(PersonNode);
