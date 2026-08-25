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
  /** Çevre (aile-dışı yakın) kartı — arkadaşlık rozeti, hızlı-ekle yok. */
  associate?: boolean;
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
  tone = "primary",
  icon = "plus",
}: {
  label: string;
  position: "top" | "bottom" | "right" | "left" | "corner";
  onClick: (e: React.MouseEvent) => void;
  /** Renk: aile bağları primary, yakın çevre accent (mor). */
  tone?: "primary" | "accent";
  /** İçerik: "+" ya da 🤝 (çevre) */
  icon?: "plus" | "friend";
}) {
  const pos = {
    top: "left-1/2 -translate-x-1/2 -top-3",
    bottom: "left-1/2 -translate-x-1/2 -bottom-3",
    right: "-right-3 top-1/2 -translate-y-1/2",
    left: "-left-3 top-1/2 -translate-y-1/2",
    corner: "-right-3 -bottom-3",
  }[position];
  const toneCls = tone === "accent" ? "bg-accent text-white" : "bg-primary text-primary-text";

  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`
        nodrag absolute ${pos} z-20
        w-6 h-6 rounded-full grid place-items-center
        ${toneCls} shadow-float
        opacity-0 scale-75 pointer-events-none
        group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
        group-data-[sel=true]:opacity-100 group-data-[sel=true]:scale-100 group-data-[sel=true]:pointer-events-auto
        hover:brightness-110 hover:scale-110
        transition-all duration-150
      `}
    >
      {icon === "friend" ? (
        <span className="text-[11px] leading-none" aria-hidden>🤝</span>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function PersonNode({ data }: NodeProps) {
  const { person: rawPerson, selected, focused, dimmed, canAddParent, associate, detail = 3, width = 140, height = 124, onSelect, onOpen, onQuickAdd } =
    data as unknown as PersonNodeData;

  const { view } = usePrivacy();
  const { readOnly } = useReadOnly();
  const person = view(rawPerson);

  const tone = genderTone(person.gender);
  const rainbow = isRainbow(person);
  // Kart rengi (Madde 8): yakın çevre (arkadaş) mor tonda; LGBT+ gökkuşağı;
  // aksi hâlde cinsiyet tonu (kadın/erkek/diğer). Böylece ağaçta dört grup
  // (kadın/erkek/lgbt/arkadaş) renkten ayırt edilir.
  const bgCls = associate ? "bg-accent-soft" : rainbow ? "card-rainbow" : tone.bg;

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

  // Yakın çevre (arkadaş) kartı: YUVARLAK ve sade — gerçek fotoğraf varsa
  // yalnız fotoğraf, yoksa yalnız isim. Üye kartındaki avatar+soyad+doğum yılı
  // düzeni KULLANILMAZ (kullanıcı isteği).
  if (associate) {
    const circle = Math.min(width, height);
    const hasPhoto = !!person.photo;
    const first = primaryName(person);
    return (
      <div className="group relative" data-sel={selected}>
        <Handle type="target" position={Position.Top} />
        <Handle type="source" position={Position.Bottom} />
        <div style={{ width, height }} className="flex items-center justify-center">
          <div className="relative" style={{ width: circle, height: circle }}>
            <button
              onClick={() => onSelect(person.id)}
              onDoubleClick={() => onOpen?.(person.id)}
              title={first}
              className={`
                absolute inset-0 rounded-full overflow-hidden
                grid place-items-center text-center
                bg-accent-soft ring-2 ring-accent/50
                transition-all duration-200
                ${selected
                  ? "shadow-float -translate-y-1 scale-105 ring-4 ring-primary/40 z-10"
                  : "shadow-card hover:shadow-float hover:-translate-y-0.5"}
                ${dimmed ? "opacity-30" : "opacity-100"}
              `}
            >
              {hasPhoto ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={person.photo} alt={first} className="w-full h-full object-cover" />
              ) : (
                <span className={`px-2.5 font-semibold text-accent leading-tight line-clamp-3 break-words ${nameCls}`}>
                  {first || t("node.friend")}
                </span>
              )}
            </button>
            <span
              className="absolute -top-1 -left-1 z-10 w-5 h-5 grid place-items-center rounded-full bg-accent text-white text-[10px] shadow-soft"
              title="Çevre"
              aria-hidden
            >
              🤝
            </span>
          </div>
        </div>
      </div>
    );
  }

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
          ${bgCls} rounded-2xl
          ${associate ? "ring-1 ring-accent/40" : ""}
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

      {/* Çevre (arkadaş) rozeti */}
      {associate && (
        <span
          className="absolute -top-1.5 -left-1.5 z-10 w-5 h-5 grid place-items-center rounded-full bg-accent text-white text-[10px] shadow-soft"
          title="Çevre"
          aria-hidden
        >
          🤝
        </span>
      )}

      {/* Hızlı ekleme düğmeleri — görüntüleme modunda + çevre kartında gizli */}
      {!readOnly && !associate && (
        <>
          {canAddParent && (
            <AddNub label="Ebeveyn ekle" position="top" onClick={stop(() => onQuickAdd("parent", person.id))} />
          )}
          <AddNub label="Çocuk ekle" position="bottom" onClick={stop(() => onQuickAdd("child", person.id))} />
          <AddNub label="Eş ekle" position="right" onClick={stop(() => onQuickAdd("spouse", person.id))} />
          <AddNub label="Kardeş ekle" position="left" onClick={stop(() => onQuickAdd("sibling", person.id))} />
          {/* Yakın çevre (arkadaş) ekle — mor, köşede, 🤝 */}
          <AddNub label="Yakın çevre ekle" position="corner" tone="accent" icon="friend" onClick={stop(() => onQuickAdd("associate", person.id))} />
        </>
      )}
    </div>
  );
}

export default memo(PersonNode);
