"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import { lifeSpan } from "@/lib/date";
import { ancestorDepths, indexPeople } from "@/lib/relations";
import type { RelationType } from "@/lib/actions";

interface Props {
  people: Person[];
  rootId?: string;
  selectedId?: string;
  onSelect: (id: string) => void;
  onSetRoot: (id: string) => void;
  onQuickAdd: (relation: RelationType, targetId: string) => void;
}

interface Slot {
  person?: Person;
  /** Bu boşluğu dolduracak çocuk (ebeveyn eklemek için) */
  childId?: string;
  gen: number;
}

const GEN_LABELS = ["", "Ebeveynler", "Büyükanne / büyükbaba", "Büyük büyük kuşak", "4. kuşak", "5. kuşak"];

export default function PedigreeView({
  people,
  rootId,
  selectedId,
  onSelect,
  onSetRoot,
  onQuickAdd,
}: Props) {
  const [generations, setGenerations] = useState(4);
  const idx = useMemo(() => indexPeople(people), [people]);

  /** Kök seçilmemişse en uzun ata zincirine sahip kişiyi al — soy görünümü dolu olsun. */
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

  /** Kuşak kuşak ata dizisi (Sosa sırası: her kuşakta 2^n yer) */
  const columns = useMemo(() => {
    if (!root) return [];
    const cols: Slot[][] = [[{ person: root, gen: 0 }]];

    for (let gen = 1; gen < generations; gen++) {
      const prev = cols[gen - 1];
      const col: Slot[] = [];
      for (const slot of prev) {
        const parents = slot.person
          ? slot.person.parentIds.map((id) => idx.get(id)).filter((p): p is Person => !!p)
          : [];
        // Baba önce, anne sonra — tutarlı sıralama
        const father = parents.find((p) => p.gender === "male") ?? parents.find((p) => p.gender === "unknown");
        const mother = parents.find((p) => p.gender === "female") ?? parents.find((p) => p !== father);

        col.push({ person: father, childId: slot.person?.id, gen });
        col.push({ person: mother, childId: slot.person?.id, gen });
      }
      // Ebeveyn sütununu her zaman göster (boş yuvalar "Ebeveyn ekle" olur);
      // daha üst kuşaklarda tamamen boşsa dur.
      const bosKusak = col.every((s) => !s.person);
      if (bosKusak && gen > 1) break;
      cols.push(col);
      if (bosKusak) break;
    }
    return cols;
  }, [root, generations, idx]);

  if (!root) {
    return (
      <div className="h-full grid place-items-center text-text-subtle text-sm">
        Görüntülenecek kişi yok
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Kontrol çubuğu */}
      <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border bg-bg-elevated/60">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar person={root} size="sm" />
          <div className="min-w-0">
            <p className="text-xs text-text-subtle leading-tight">Kök kişi</p>
            <p className="text-sm font-medium text-text truncate leading-tight">
              {root.firstName} {root.lastName}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="hidden sm:flex items-center gap-2 text-xs text-text-muted">
            Kuşak
            <input
              type="range"
              min={2}
              max={6}
              value={generations}
              onChange={(e) => setGenerations(Number(e.target.value))}
              className="w-24 accent-[var(--primary)]"
            />
            <span className="tabular-nums w-3 text-text font-medium">{generations}</span>
          </label>
        </div>
      </div>

      {/* Soy tablosu — her sütunda 2^n yuva, ebeveynler çocuğa göre simetrik */}
      <div className="flex-1 overflow-auto p-6 sm:p-8">
        <div className="flex gap-8 min-w-max h-full min-h-[460px]">
          {columns.map((col, gi) => {
            // Her sütunda yuvalar ikili gruplanır: bir çocuğun anne–baba çifti
            const pairs: Slot[][] = [];
            for (let i = 0; i < col.length; i += 2) pairs.push(col.slice(i, i + 2));

            return (
              <div key={gi} className="flex flex-col w-[186px]">
                <p className="h-7 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
                  {gi === 0 ? "Kök" : GEN_LABELS[gi] ?? `${gi}. kuşak`}
                </p>
                <div className="flex-1 flex flex-col">
                  {pairs.map((pair, pi) => (
                    <div key={pi} className="flex-1 flex flex-col relative">
                      {gi > 0 && pair.some((sl) => sl.person || sl.childId) && (
                        <>
                          {/* Çifti birleştiren dikey çizgi */}
                          <span
                            className="absolute -left-4 top-1/4 bottom-1/4 w-px bg-border-strong"
                            aria-hidden
                          />
                          {/* Çocuğa uzanan yatay çizgi */}
                          <span
                            className="absolute -left-8 top-1/2 w-4 h-px bg-border-strong"
                            aria-hidden
                          />
                        </>
                      )}
                      {pair.map((slot, si) => (
                        <div
                          key={`${gi}-${pi}-${si}`}
                          className="flex-1 flex items-center min-h-[70px] relative"
                        >
                          {gi > 0 && (slot.person || slot.childId) && (
                            <span
                              className="absolute -left-4 top-1/2 w-4 h-px bg-border-strong"
                              aria-hidden
                            />
                          )}
                          <div className="w-full">
                            <PedigreeCard
                              slot={slot}
                              selected={slot.person?.id === selectedId}
                              onSelect={onSelect}
                              onSetRoot={onSetRoot}
                              onQuickAdd={onQuickAdd}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PedigreeCard({
  slot,
  selected,
  onSelect,
  onSetRoot,
  onQuickAdd,
}: {
  slot: Slot;
  selected: boolean;
  onSelect: (id: string) => void;
  onSetRoot: (id: string) => void;
  onQuickAdd: (relation: RelationType, targetId: string) => void;
}) {
  const p = slot.person;

  if (!p) {
    if (!slot.childId) return <div className="h-[62px] w-full" aria-hidden />;
    return (
      <button
        onClick={() => onQuickAdd("parent", slot.childId!)}
        className="
          group h-[62px] w-full rounded-xl border border-dashed border-border-strong
          flex items-center justify-center gap-1.5
          text-xs text-text-subtle hover:text-primary hover:border-primary hover:bg-primary-soft
          transition-colors
        "
      >
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Ebeveyn ekle
      </button>
    );
  }

  return (
    <div className="group relative">
      <button
        onClick={() => onSelect(p.id)}
        className={`
          w-full h-[62px] flex items-center gap-2.5 px-2.5 rounded-xl text-left
          bg-surface border-2 transition-all duration-150
          ${selected
            ? "border-primary shadow-float"
            : "border-border hover:border-border-strong shadow-soft hover:shadow-card"}
        `}
      >
        <Avatar person={p} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-text truncate leading-tight">
            {p.firstName}
          </p>
          <p className="text-[11px] text-text-muted truncate leading-tight">{p.lastName}</p>
          {lifeSpan(p.birthDate, p.deathDate) && (
            <p className="text-[10px] text-text-subtle tabular-nums leading-tight">
              {lifeSpan(p.birthDate, p.deathDate)}
            </p>
          )}
        </div>
      </button>

      <button
        onClick={() => onSetRoot(p.id)}
        title="Bu kişiyi kök yap"
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
    </div>
  );
}
