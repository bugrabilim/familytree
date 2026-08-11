"use client";

import { useMemo, useState } from "react";
import {
  ESTRANGEMENT_LABELS,
  PARENT_KIND_LABELS,
  type Person,
} from "@/types/family";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import { calcAge, formatLong, lifeSpan } from "@/lib/date";
import {
  describeRelation,
  genitive,
  possessive,
  getChildren,
  getParents,
  getFormerSpouses,
  parentLinkOf,
  getSiblings,
  getSpouses,
  indexPeople,
} from "@/lib/relations";
import { deletePerson, type RelationType } from "@/lib/actions";
import { fullName } from "@/lib/name";
import useEscapeKey from "@/lib/useEscapeKey";
import { usePrivacy } from "./PrivacyContext";
import { isMasked } from "@/lib/privacy";

interface Props {
  person: Person;
  people: Person[];
  /** Akrabalık hesabı için referans kişi (genelde kök/odak) */
  referenceId?: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onQuickAdd: (relation: RelationType, targetId: string) => void;
  onFocus: (id: string) => void;
  onDeleted: () => void;
}

export default function PersonDrawer({
  person: rawPerson,
  people,
  referenceId,
  onClose,
  onSelect,
  onEdit,
  onQuickAdd,
  onFocus,
  onDeleted,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const { view, hideLiving } = usePrivacy();
  // Maskeleme yalnızca gösterimi etkiler; ilişki dizileri korunduğu için
  // akrabalık hesapları maskeli kişiyle de doğru çalışır.
  const person = view(rawPerson);
  const masked = isMasked(rawPerson, hideLiving);

  const idx = useMemo(() => indexPeople(people), [people]);
  // İlişkili kişiler ham veriden hesaplanır, gösterimden hemen önce maskelenir.
  const parents = useMemo(() => getParents(person, idx).map(view), [person, idx, view]);
  const spouses = useMemo(() => getSpouses(person, idx).map(view), [person, idx, view]);
  const formerSpouses = useMemo(() => getFormerSpouses(person, idx).map(view), [person, idx, view]);
  const children = useMemo(() => getChildren(person, people).map(view), [person, people, view]);
  const siblings = useMemo(() => getSiblings(person, people).map(view), [person, people, view]);

  const kinship = useMemo(() => {
    if (!referenceId || referenceId === person.id) return null;
    return describeRelation(referenceId, person.id, people, idx);
  }, [referenceId, person.id, people, idx]);

  const referencePerson = referenceId ? idx.get(referenceId) : undefined;
  const age = calcAge(person.birthDate, person.deathDate);
  const years = lifeSpan(person.birthDate, person.deathDate);

  useEscapeKey(onClose);

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await deletePerson(person.id);
      onDeleted();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Mobil arka plan */}
      <div
        className="fixed inset-0 z-30 bg-black/35 lg:hidden animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      <aside
        className="
          fixed z-40 bg-bg-elevated border-border shadow-modal flex flex-col
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl border-t animate-slide-up
          lg:top-14 lg:bottom-0 lg:right-0 lg:left-auto lg:w-[380px] lg:max-h-none lg:rounded-none lg:border-t-0 lg:border-l lg:animate-slide-left
        "
        aria-label="Kişi ayrıntıları"
      >
        {/* Mobil tutamaç */}
        <div className="lg:hidden pt-2.5 pb-1 grid place-items-center shrink-0">
          <div className="w-9 h-1 rounded-full bg-border-strong" />
        </div>

        {/* Başlık */}
        <div className="relative shrink-0 px-5 pt-4 lg:pt-5 pb-4 border-b border-border">
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="absolute right-3 top-3 lg:top-4 w-8 h-8 grid place-items-center rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex items-start gap-3.5 pr-9">
            <Avatar person={person} size="xl" ring />
            <div className="min-w-0 pt-1">
              <h2 className="font-serif text-xl font-semibold text-text leading-tight">
                {fullName(person)}
              </h2>
              {person.code && (
                <p className="text-[11px] text-text-subtle tabular-nums font-mono mt-0.5">#{person.code}</p>
              )}
              {masked && (
                <p className="inline-flex items-center gap-1 mt-1 text-[11px] text-text-subtle">
                  🔒 Yaşayan — özel bilgiler gizli
                </p>
              )}
              {years && (
                <p className="text-sm text-text-muted mt-0.5 tabular-nums">
                  {years}
                  {age !== null && (
                    <span className="text-text-subtle">
                      {" "}· {person.deathDate ? `${age} yaşında` : `${age} yaş`}
                    </span>
                  )}
                </p>
              )}
              {kinship && referencePerson && (
                <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-lg bg-accent-soft text-accent text-[11px] font-medium">
                  {genitive(referencePerson.firstName)} {possessive(kinship.toLocaleLowerCase("tr"))}
                </span>
              )}
            </div>
          </div>

          {/* Hızlı aksiyonlar */}
          <div className="flex flex-wrap gap-1.5 mt-4">
            <Button size="sm" variant="secondary" onClick={() => onEdit(person.id)}>
              Düzenle
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onFocus(person.id)}>
              Merkeze al
            </Button>
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Siliniyor…" : "Eminim, sil"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Vazgeç
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                  Sil
                </Button>
              )}
            </div>
          </div>
          {error && <p className="text-[11px] text-danger mt-2">{error}</p>}
        </div>

        {/* Gövde */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 overscroll-contain">
          {(person.birthDate || person.birthPlace || person.deathDate) && (
            <section className="space-y-2">
              {person.birthDate && (
                <Fact icon="🎂" label="Doğum" value={formatLong(person.birthDate)} />
              )}
              {person.birthPlace && <Fact icon="📍" label="Doğum yeri" value={person.birthPlace} />}
              {person.deathDate && <Fact icon="🕯️" label="Vefat" value={formatLong(person.deathDate)} />}
              {person.deathCause && <Fact icon="🩶" label="Ölüm nedeni" value={person.deathCause} />}
            </section>
          )}

          {(person.language || person.religion || person.denomination ||
            person.ethnicity || person.nationality || person.orientation) && (
            <section>
              <SectionTitle>Kimlik ve köken</SectionTitle>
              <dl className="space-y-1.5">
                {([
                  ["Ana dil", person.language],
                  ["Din", person.religion],
                  ["Mezhep", person.denomination],
                  ["Etnik köken", person.ethnicity],
                  ["Uyruk", person.nationality],
                  ["Cinsel yönelim", person.orientation],
                ] as const)
                  .filter(([, v]) => !!v)
                  .map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-2">
                      <dt className="text-[11px] text-text-subtle w-24 shrink-0">{k}</dt>
                      <dd className="text-sm text-text leading-snug">{v}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          )}

          {(person.congenitalCondition || person.healthCondition || person.healthNote) && (
            <section className="space-y-2">
              <SectionTitle>Sağlık</SectionTitle>
              {person.congenitalCondition && (
                <div>
                  <p className="text-[11px] font-medium text-text-subtle">Doğuştan</p>
                  <p className="text-sm text-text-muted leading-relaxed">{person.congenitalCondition}</p>
                </div>
              )}
              {person.healthCondition && (
                <div>
                  <p className="text-[11px] font-medium text-text-subtle">Yaşarken</p>
                  <p className="text-sm text-text-muted leading-relaxed">{person.healthCondition}</p>
                </div>
              )}
              {/* Eski, ayrışmamış kayıtlar için */}
              {!person.congenitalCondition && !person.healthCondition && person.healthNote && (
                <p className="text-sm text-text-muted leading-relaxed">{person.healthNote}</p>
              )}
            </section>
          )}

          {person.bio && (
            <section>
              <SectionTitle>Hikâyesi</SectionTitle>
              <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                {person.bio}
              </p>
            </section>
          )}

          <RelationGroup
            title="Ebeveynler"
            people={parents}
            onSelect={onSelect}
            badgeOf={(par) => {
              const l = parentLinkOf(person, par.id);
              if (!l) return undefined;
              const parts: string[] = [];
              if (l.kind && l.kind !== "biological") parts.push(PARENT_KIND_LABELS[l.kind]);
              if (l.estranged) parts.push(ESTRANGEMENT_LABELS[l.estranged].child);
              return parts.length ? { text: parts.join(" · "), note: l.note } : undefined;
            }}
            emptyAction={
              parents.length < 2
                ? { label: "Ebeveyn ekle", onClick: () => onQuickAdd("parent", person.id) }
                : undefined
            }
          />
          <RelationGroup
            title="Eş"
            people={spouses}
            onSelect={onSelect}
            emptyAction={{ label: "Eş ekle", onClick: () => onQuickAdd("spouse", person.id) }}
          />
          <RelationGroup title="Eski eş" people={formerSpouses} onSelect={onSelect} />
          <RelationGroup
            title="Çocuklar"
            people={children}
            onSelect={onSelect}
            badgeOf={(ch) => {
              const l = parentLinkOf(ch, person.id);
              if (!l) return undefined;
              const parts: string[] = [];
              if (l.kind && l.kind !== "biological") parts.push(PARENT_KIND_LABELS[l.kind]);
              if (l.estranged) parts.push(ESTRANGEMENT_LABELS[l.estranged].parent);
              return parts.length ? { text: parts.join(" · "), note: l.note } : undefined;
            }}
            emptyAction={{ label: "Çocuk ekle", onClick: () => onQuickAdd("child", person.id) }}
          />
          <RelationGroup
            title="Kardeşler"
            people={siblings}
            onSelect={onSelect}
            emptyAction={
              parents.length > 0
                ? { label: "Kardeş ekle", onClick: () => onQuickAdd("sibling", person.id) }
                : undefined
            }
          />
        </div>
      </aside>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle mb-2">
      {children}
    </h3>
  );
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-sm w-5 text-center shrink-0" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <span className="text-[11px] text-text-subtle">{label}</span>
        <p className="text-sm text-text leading-tight">{value}</p>
      </div>
    </div>
  );
}

function RelationGroup({
  title,
  people,
  onSelect,
  emptyAction,
  badgeOf,
}: {
  title: string;
  people: Person[];
  onSelect: (id: string) => void;
  emptyAction?: { label: string; onClick: () => void };
  badgeOf?: (p: Person) => { text: string; note?: string } | undefined;
}) {
  if (people.length === 0 && !emptyAction) return null;

  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {people.length > 0 ? (
        <ul className="space-y-0.5">
          {people.map((p) => {
            const badge = badgeOf?.(p);
            return (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                title={badge?.note}
                className="w-full flex items-center gap-2.5 px-2 py-1.5 -mx-2 rounded-lg hover:bg-surface-2 transition-colors text-left"
              >
                <Avatar person={p} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text truncate leading-tight">
                    {fullName(p)}
                  </p>
                  {badge && (
                    <span className="inline-block mt-0.5 px-1.5 py-px rounded bg-accent-soft text-accent text-[10px] font-medium">
                      {badge.text}
                    </span>
                  )}
                  {!badge && lifeSpan(p.birthDate, p.deathDate) && (
                    <p className="text-[11px] text-text-subtle tabular-nums leading-tight">
                      {lifeSpan(p.birthDate, p.deathDate)}
                    </p>
                  )}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="text-text-subtle shrink-0">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </li>
            );
          })}
        </ul>
      ) : null}

      {emptyAction && (
        <button
          onClick={emptyAction.onClick}
          className="mt-1 flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {emptyAction.label}
        </button>
      )}
    </section>
  );
}
