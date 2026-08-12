"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Person } from "@/types/family";
import Avatar, { genderTone } from "./ui/Avatar";
import { lifeSpan } from "@/lib/date";
import { primaryName, secondaryName, fullName } from "@/lib/name";
import { ancestorDepths, descendantDepths, getChildren, getParents, indexPeople } from "@/lib/relations";
import type { PersonIndex } from "@/lib/relations";
import type { RelationType } from "@/lib/actions";
import { usePrivacy } from "./PrivacyContext";
import { isMasked } from "@/lib/privacy";
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  rootId?: string;
  selectedId?: string;
  onSelect: (id: string) => void;
  onSetRoot: (id: string) => void;
  onQuickAdd: (relation: RelationType, targetId: string) => void;
}

/* Sabit kart yüksekliği, yatay yerleşimde bağlantı çizgilerinin hesabını
   mümkün kılar (kartlar dikey yığılır, çizgi merkezleri sabit). */
const CARD_W = 176;
const CARD_H = 64;
const HALF_H = CARD_H / 2;
const GAP = 16;
const STUB = 24;

export default function PedigreeView({
  people,
  rootId,
  selectedId,
  onSelect,
  onSetRoot,
}: Props) {
  const [generations, setGenerations] = useState(4);
  const { view } = usePrivacy();
  const t = useT();
  const idx = useMemo(() => indexPeople(people), [people]);

  /** Kök seçilmemişse en uzun ata zincirine sahip kişiyi al. */
  const varsayilanKok = useMemo(() => {
    let best: Person | undefined;
    let bestDepth = -1;
    for (const p of people) {
      let d = 0;
      for (const v of ancestorDepths(p.id, idx).values()) if (v > d) d = v;
      if (d > bestDepth) {
        bestDepth = d;
        best = p;
      }
    }
    return best;
  }, [people, idx]);

  const root = (rootId ? idx.get(rootId) : undefined) ?? varsayilanKok;

  const siraliKisiler = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...people].sort(
      (a, b) => coll.compare(a.firstName, b.firstName) || coll.compare(a.lastName, b.lastName)
    );
  }, [people]);

  /** Kök etrafında kaç kuşak yukarı / aşağı gerçekten var? — bilgi rozeti için */
  const kapsam = useMemo(() => {
    if (!root) return { up: 0, down: 0 };
    let up = 0;
    for (const d of ancestorDepths(root.id, idx).values()) if (d > up) up = d;
    let down = 0;
    for (const d of descendantDepths(root.id, people).values()) if (d > down) down = d;
    return { up: Math.min(up, generations), down: Math.min(down, generations) };
  }, [root, idx, people, generations]);

  /**
   * Madde 3 — "Tümünü sığdır": kuşak derinliği arttıkça büyüyen kum saatini
   * viewport'a ölçekleyerek sığdırır (React Flow'daki fitView'e benzer). Kuşak,
   * kök veya kişi kümesi değişince ve pencere yeniden boyutlanınca hesaplanır.
   * Ölçek yalnızca küçültür (≤ 1). scrollWidth/Height CSS transform'dan
   * etkilenmediği için içeriğin doğal boyutunu verir.
   */
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    const box = boxRef.current;
    if (!vp || !content || !box) return;

    const fit = () => {
      const w = content.scrollWidth;
      const h = content.scrollHeight;
      if (!w || !h) return;
      const availW = Math.max(vp.clientWidth - 48, 0);
      const availH = Math.max(vp.clientHeight - 48, 0);
      const s = Math.min(1, availW / w, availH / h);
      content.style.transform = `scale(${s})`;
      box.style.width = `${w * s}px`;
      box.style.height = `${h * s}px`;
    };

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [generations, root?.id, people]);

  if (!root) {
    return (
      <div className="h-full grid place-items-center text-text-subtle text-sm">
        Görüntülenecek kişi yok
      </div>
    );
  }

  const cardProps = { idx, people, selectedId, onSelect, onSetRoot };

  return (
    <div className="h-full flex flex-col">
      {/* Kontrol çubuğu */}
      <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border bg-bg-elevated/60">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar person={root} size="sm" />
          <div className="min-w-0">
            <label className="text-xs text-text-subtle leading-tight block" htmlFor="kok-secici">
              {t("pedigree.centerLabel", { up: kapsam.up, down: kapsam.down })}
            </label>
            <select
              id="kok-secici"
              value={root.id}
              onChange={(e) => onSetRoot(e.target.value)}
              className="max-w-[16rem] sm:max-w-xs h-7 -ml-1 px-1 rounded-lg bg-transparent hover:bg-surface-2 border border-transparent hover:border-border text-sm font-medium text-text cursor-pointer focus:outline-none focus:border-primary transition-colors"
            >
              {siraliKisiler.map((p) => {
                const mp = view(p);
                return (
                  <option key={p.id} value={p.id}>
                    {fullName(p)}
                    {mp.birthDate ? ` · ${mp.birthDate.slice(0, 4)}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="hidden sm:flex items-center gap-2 text-xs text-text-muted">
            {t("pedigree.generation")}
            <input
              type="range"
              min={1}
              max={6}
              value={generations}
              onChange={(e) => setGenerations(Number(e.target.value))}
              className="w-24 accent-[var(--primary)]"
            />
            <span className="tabular-nums w-3 text-text font-medium">{generations}</span>
          </label>
        </div>
      </div>

      {/* Kum saati (yatay): atalar solda, merkez ortada, soy sağda.
          Kuşak derinliği arttıkça içerik büyür; görünür kümeyi ekrana sığdırmak
          için ölçüp ölçekliyoruz (boxRef ölçekli boyutu ayırır, contentRef
          absolute olarak onu doldurur). */}
      <div ref={viewportRef} className="flex-1 overflow-auto p-8 sm:p-12">
        <div className="min-w-full min-h-full flex items-center justify-center">
          <div ref={boxRef} className="relative">
            <div ref={contentRef} className="absolute top-0 left-0 origin-top-left">
              <div className="flex items-center">
                <AncestorFan person={root} depth={generations} {...cardProps} />
                <PedigreeCard person={root} isRoot {...cardProps} />
                <DescendantFan person={root} depth={generations} {...cardProps} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Özyinelemeli kum saati                                            */
/* ---------------------------------------------------------------- */

interface BranchProps {
  idx: PersonIndex;
  people: Person[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onSetRoot: (id: string) => void;
}

/** Baba önce, anne sonra — tutarlı sıralama */
function ataSirasi(parents: Person[]): Person[] {
  const father = parents.find((p) => p.gender === "male") ?? parents.find((p) => p.gender === "unknown");
  const mother = parents.find((p) => p.gender === "female") ?? parents.find((p) => p !== father);
  return [father, mother].filter((p): p is Person => !!p);
}

/** Bir kişinin atalarını (solda) çizen fan — kişinin kendi kartı hariç */
function AncestorFan({ person, depth, ...props }: { person: Person; depth: number } & BranchProps) {
  if (depth <= 0) return null;
  const parents = ataSirasi(getParents(person, props.idx));
  if (parents.length === 0) return null;

  return (
    <div className="flex items-center">
      <div className="flex flex-col justify-center" style={{ gap: GAP }}>
        {parents.map((par) => (
          <div key={par.id} className="flex items-center">
            <AncestorFan person={par} depth={depth - 1} {...props} />
            <PedigreeCard person={par} {...props} />
          </div>
        ))}
      </div>
      <Connector count={parents.length} side="left" />
    </div>
  );
}

/** Bir kişinin soyunu (sağda) çizen fan — kişinin kendi kartı hariç */
function DescendantFan({ person, depth, ...props }: { person: Person; depth: number } & BranchProps) {
  if (depth <= 0) return null;
  const kids = getChildren(person, props.people).sort((a, b) =>
    (a.birthDate ?? "9999").localeCompare(b.birthDate ?? "9999")
  );
  if (kids.length === 0) return null;

  return (
    <div className="flex items-center">
      <Connector count={kids.length} side="right" />
      <div className="flex flex-col justify-center" style={{ gap: GAP }}>
        {kids.map((c) => (
          <div key={c.id} className="flex items-center">
            <PedigreeCard person={c} {...props} />
            <DescendantFan person={c} depth={depth - 1} {...props} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Bağlantı bölgesi (yatay): bir kart ile onun ebeveyn/çocuk sütunu arasındaki
 * çizgiler. `side="left"` → soldaki atalar sütununu sağdaki karta bağlar;
 * `side="right"` → soldaki kartı sağdaki soy sütununa bağlar. Kart yüksekliği
 * sabit olduğundan dikey bar, sütunun uçlarındaki kart merkezleri arasına
 * (HALF_H içeriden) yerleştirilir.
 */
function Connector({ count, side }: { count: number; side: "left" | "right" }) {
  const barPos = side === "left" ? { right: 0 } : { left: 0 };
  return (
    <div className="relative self-stretch" style={{ width: STUB }} aria-hidden>
      {count > 1 && (
        <span
          className="absolute w-px"
          style={{ top: HALF_H, bottom: HALF_H, background: "var(--tree-edge)", ...barPos }}
        />
      )}
      <span
        className="absolute top-1/2 -translate-y-1/2"
        style={{ height: 1, width: STUB, left: 0, background: "var(--tree-edge)" }}
      />
    </div>
  );
}

function PedigreeCard({
  person: rawPerson,
  isRoot,
  selectedId,
  onSelect,
  onSetRoot,
}: { person: Person; isRoot?: boolean } & BranchProps) {
  const { view, hideLiving } = usePrivacy();
  const t = useT();
  const person = view(rawPerson);
  const masked = isMasked(rawPerson, hideLiving);
  const selected = person.id === selectedId;
  const alt = secondaryName(person);
  const tone = genderTone(person.gender);

  return (
    <div className="group relative shrink-0" style={{ width: CARD_W }}>
      <button
        onClick={() => onSelect(person.id)}
        className={`
          w-full h-[64px] flex items-center gap-2.5 px-2.5 rounded-xl text-left
          ${tone.bg} transition-all duration-150
          ${selected
            ? "shadow-float ring-2 ring-primary/40"
            : isRoot
            ? "shadow-card ring-2 ring-primary/50"
            : "shadow-soft hover:shadow-card"}
        `}
      >
        <Avatar person={person} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-text truncate leading-tight">
            {primaryName(person)}
          </p>
          {alt ? (
            <p className="text-[11px] text-text-muted truncate leading-tight">{alt}</p>
          ) : person.code ? (
            <p className="text-[10px] font-mono text-text-subtle/70 leading-tight">#{person.code}</p>
          ) : null}
          {masked ? (
            <p className="text-[10px] text-text-subtle leading-tight">{t("common.living")}</p>
          ) : (
            lifeSpan(person.birthDate, person.deathDate) && (
              <p className="text-[10px] text-text-subtle tabular-nums leading-tight">
                {lifeSpan(person.birthDate, person.deathDate)}
              </p>
            )
          )}
        </div>
      </button>

      {!isRoot && (
        <button
          onClick={() => onSetRoot(person.id)}
          title={t("pedigree.setRoot")}
          className="
            absolute -right-2 -top-2 w-6 h-6 rounded-full bg-bg-elevated border border-border shadow-card
            grid place-items-center text-text-subtle hover:text-primary hover:border-primary
            opacity-0 group-hover:opacity-100 transition-all
          "
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" transform="rotate(45 12 12)" />
          </svg>
        </button>
      )}
    </div>
  );
}
