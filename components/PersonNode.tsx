"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Person } from "@/types/family";
import Avatar, { genderTone } from "./ui/Avatar";
import { primaryName, secondaryName } from "@/lib/name";
import { isRainbow } from "@/lib/identity";
import type { RelationType } from "@/lib/actions";
import { usePrivacy } from "./PrivacyContext";
import { useReadOnly } from "./ReadOnlyContext";
import { useT } from "@/lib/i18n";

export interface PersonNodeData extends Record<string, unknown> {
  person: Person;
  selected: boolean;
  /** Ağacın odaklandığı kişi — kalabalıkta başlangıç noktası */
  focused?: boolean;
  dimmed: boolean;
  canAddParent: boolean;
  /** 3 = en büyük kart, 0 = en sade (kalabalık) */
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
  position: "top" | "bottom" | "right" | "left";
  onClick: (e: React.MouseEvent) => void;
}) {
  const pos = {
    top: "left-1/2 -translate-x-1/2 -top-3",
    bottom: "left-1/2 -translate-x-1/2 -bottom-3",
    right: "-right-3 top-1/2 -translate-y-1/2",
    left: "-left-3 top-1/2 -translate-y-1/2",
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
  const { person: rawPerson, selected, focused, dimmed, canAddParent, detail = 3, width = 140, height = 124, onSelect, onOpen, onQuickAdd } =
    data as unknown as PersonNodeData;

  const { view } = usePrivacy();
  const { readOnly } = useReadOnly();
  const person = view(rawPerson);

  const tone = genderTone(person.gender);
  const rainbow = isRainbow(person);

  // Dikey kart (Madde 14): üstte fotoğraf/avatar, altında ad-soyad, altında
  // doğum yılı. Ölçeğe göre yalnız avatar boyutu ve yazı boyu değişir; içerik
  // sabit kalır (Madde 13 — başka hiçbir bilgi gösterilmez).
  const avatarSize = detail >= 3 ? "md" : detail >= 1 ? "sm" : "xs";
  const nameCls =
    detail >= 3 ? "text-[13px]" : detail >= 1 ? "text-[12px]" : "text-[11px]";
  const birthYear = person.birthDate?.slice(0, 4);
  const showYear = detail >= 1 && !!birthYear;

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };

  const t = useT();
  const surname = secondaryName(person);
  // Başlangıç iskeleti kartı: adı henüz girilmemiş, rol etiketi gösterilir.
  const isPlaceholder = !!person.placeholder && !person.firstName?.trim();

  return (
    <div className="group relative" data-sel={selected}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />

      <button
        onClick={() => onSelect(person.id)}
        onDoubleClick={() => onOpen?.(person.id)}
        title="Tıkla: profili aç ve merkeze al"
        style={{ width, height }}
        className={`
          relative overflow-hidden
          flex flex-col items-center justify-center text-center gap-1.5 px-2 py-2.5
          ${rainbow ? "card-rainbow" : tone.bg} rounded-2xl
          transition-all duration-200
          ${selected
            ? "shadow-float -translate-y-1 scale-[1.06] ring-4 ring-primary/30 z-10"
            : "shadow-card hover:shadow-float hover:-translate-y-0.5"}
          ${dimmed ? "opacity-30" : "opacity-100"}
        `}
      >
        {/* Odak rozeti — ağaçta nereden başladığını gösterir */}
        {focused && !selected && (
          <span
            className="absolute top-1 left-1 px-1.5 py-px rounded-full bg-accent text-[9px] font-semibold text-white shadow-soft z-10"
            title="Ağacın odak noktası"
          >
            odak
          </span>
        )}

        <Avatar person={person} size={avatarSize} />

        <div className="min-w-0 w-full leading-tight">
          <p className={`font-semibold ${nameCls} ${
            isPlaceholder ? "text-text-subtle italic font-medium" : "text-text"
          } line-clamp-2 break-words`}>
            {isPlaceholder ? t(`starter.role.${person.placeholder}`) : primaryName(person)}
            {!isPlaceholder && surname ? ` ${surname}` : ""}
          </p>
          {showYear && (
            <p className="text-[11px] text-text-subtle mt-0.5 tabular-nums">{birthYear}</p>
          )}
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
          <AddNub label="Kardeş ekle" position="left" onClick={stop(() => onQuickAdd("sibling", person.id))} />
        </>
      )}
    </div>
  );
}

export default memo(PersonNode);
