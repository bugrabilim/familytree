"use client";

import { useMemo, useState } from "react";
import {
  EDUCATION_LEVELS,
  LIFE_EVENT_TYPES,
  SOURCE_KINDS,
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
import { deletePerson, reorderSiblings, type RelationType } from "@/lib/actions";
import { moveInList, siblingGroup } from "@/lib/siblings";
import { useRouter } from "next/navigation";
import { fullName } from "@/lib/name";
import useEscapeKey from "@/lib/useEscapeKey";
import { usePrivacy } from "./PrivacyContext";
import { useReadOnly } from "./ReadOnlyContext";
import { isMasked } from "@/lib/privacy";
import { useT } from "@/lib/i18n";

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
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { view, hideLiving } = usePrivacy();
  const { readOnly } = useReadOnly();
  const t = useT();
  const router = useRouter();
  const [reordering, setReordering] = useState(false);

  // Kardeş grubu HAM veriden (siblingOrder maskede taşınmaz) — sıralama doğru olsun.
  const orderGroup = useMemo(() => siblingGroup(rawPerson, people), [rawPerson, people]);
  const orderIndex = orderGroup.findIndex((p) => p.id === rawPerson.id);

  const moveSibling = async (dir: -1 | 1) => {
    const cur = orderGroup.map((p) => p.id);
    const newIds = moveInList(cur, rawPerson.id, dir);
    if (newIds === cur) return; // sınırda: değişiklik yok
    setReordering(true);
    try {
      await reorderSiblings(newIds);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReordering(false);
    }
  };
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

  // Zaman çizelgesi: doğum + yaşam olayları + vefat tek bir dikey akışta.
  // Maskeli (yaşayan) kişide `events`/`birthDate` taşınmadığı için doğal olarak boş kalır.
  const timeline = useMemo(() => {
    type Item = { key: string; date?: string; icon: string; label: string; sub?: string };
    const items: Item[] = [];
    if (person.birthDate) {
      items.push({
        key: "birth",
        date: person.birthDate,
        icon: "🎂",
        label: t("drawer.birth"),
        sub: person.birthPlace,
      });
    }
    for (const ev of person.events ?? []) {
      const meta = LIFE_EVENT_TYPES[ev.type];
      items.push({
        key: ev.id,
        date: ev.date,
        icon: meta?.icon ?? "✨",
        label: ev.title || t(`event.${ev.type}`),
        sub: ev.place,
      });
    }
    if (person.deathDate) {
      items.push({
        key: "death",
        date: person.deathDate,
        icon: "🕯️",
        label: t("drawer.death"),
        sub: person.deathCause,
      });
    }
    const dated = items
      .filter((it) => it.date)
      .sort((a, b) => a.date!.localeCompare(b.date!));
    const undated = items.filter((it) => !it.date);
    return { dated, undated, hasEvents: (person.events ?? []).length > 0 };
  }, [person.birthDate, person.birthPlace, person.deathDate, person.deathCause, person.events, t]);

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
        aria-label={t("drawer.aria")}
      >
        {/* Mobil tutamaç */}
        <div className="lg:hidden pt-2.5 pb-1 grid place-items-center shrink-0">
          <div className="w-9 h-1 rounded-full bg-border-strong" />
        </div>

        {/* Başlık */}
        <div className="relative shrink-0 px-5 pt-4 lg:pt-5 pb-4 border-b border-border">
          <button
            onClick={onClose}
            aria-label={t("drawer.close")}
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
                  {t("drawer.livingMasked")}
                </p>
              )}
              {years && (
                <p className="text-sm text-text-muted mt-0.5 tabular-nums">
                  {years}
                  {age !== null && (
                    <span className="text-text-subtle">
                      {" "}· {person.deathDate ? t("drawer.agePast", { age }) : t("drawer.ageNow", { age })}
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

          {/* Hızlı aksiyonlar — görüntüleme modunda yalnızca "Merkeze al" kalır */}
          <div className="flex flex-wrap gap-1.5 mt-4">
            {!readOnly && (
              <Button size="sm" variant="secondary" onClick={() => onEdit(person.id)}>
                {t("drawer.edit")}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => onFocus(person.id)}>
              {t("drawer.focus")}
            </Button>
            {!readOnly && (
              <div className="ml-auto">
                {confirmDelete ? (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="danger" onClick={handleDelete} disabled={deleting}>
                      {deleting ? t("drawer.deleting") : t("drawer.confirmDelete")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      {t("drawer.cancelDelete")}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                    {t("drawer.delete")}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Kardeş sırası — aynı ebeveynli ≥2 kardeş varken (düzenleme modunda) */}
          {!readOnly && orderGroup.length >= 2 && orderIndex >= 0 && (
            <div className="flex items-center gap-2 mt-3 text-xs text-text-muted">
              <span>{t("drawer.siblingOrder", { pos: orderIndex + 1, total: orderGroup.length })}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveSibling(-1)}
                  disabled={reordering || orderIndex === 0}
                  aria-label={t("drawer.siblingUp")}
                  title={t("drawer.siblingUp")}
                  className="w-7 h-7 grid place-items-center rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={() => moveSibling(1)}
                  disabled={reordering || orderIndex === orderGroup.length - 1}
                  aria-label={t("drawer.siblingDown")}
                  title={t("drawer.siblingDown")}
                  className="w-7 h-7 grid place-items-center rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-[11px] text-danger mt-2">{error}</p>}
        </div>

        {/* Gövde */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 overscroll-contain">
          {(person.birthDate || person.birthPlace || person.deathDate) && (
            <section className="space-y-2">
              {person.birthDate && (
                <Fact icon="🎂" label={t("drawer.birth")} value={formatLong(person.birthDate)} />
              )}
              {person.birthPlace && <Fact icon="📍" label={t("drawer.birthPlace")} value={person.birthPlace} />}
              {person.deathDate && <Fact icon="🕯️" label={t("drawer.death")} value={formatLong(person.deathDate)} />}
              {person.deathCause && <Fact icon="🩶" label={t("drawer.deathCause")} value={person.deathCause} />}
            </section>
          )}

          {(person.language || person.religion || person.denomination ||
            person.ethnicity || person.nationality || person.orientation ||
            person.occupation || person.education) && (
            <section>
              <SectionTitle>{t("drawer.identity")}</SectionTitle>
              <dl className="space-y-1.5">
                {([
                  [t("drawer.occupation"), person.occupation],
                  [t("drawer.education"), person.education
                    ? ((EDUCATION_LEVELS as readonly string[]).includes(person.education)
                        ? t(`education.${person.education}`)
                        : person.education)
                    : undefined],
                  [t("drawer.language"), person.language],
                  [t("drawer.religion"), person.religion],
                  [t("drawer.denomination"), person.denomination],
                  [t("drawer.ethnicity"), person.ethnicity],
                  [t("drawer.nationality"), person.nationality],
                  [t("drawer.orientation"), person.orientation],
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
              <SectionTitle>{t("drawer.health")}</SectionTitle>
              {person.congenitalCondition && (
                <div>
                  <p className="text-[11px] font-medium text-text-subtle">{t("drawer.congenital")}</p>
                  <p className="text-sm text-text-muted leading-relaxed">{person.congenitalCondition}</p>
                </div>
              )}
              {person.healthCondition && (
                <div>
                  <p className="text-[11px] font-medium text-text-subtle">{t("drawer.acquired")}</p>
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
              <SectionTitle>{t("drawer.story")}</SectionTitle>
              <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                {person.bio}
              </p>
            </section>
          )}

          {/* Galeri — maskeli (yaşayan) kişide `photos` taşınmadığı için boş kalır */}
          {person.photos && person.photos.length > 0 && (
            <section>
              <SectionTitle>{t("drawer.gallery")}</SectionTitle>
              <div className="grid grid-cols-3 gap-1.5">
                {person.photos.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setLightbox(src)}
                    aria-label={t("drawer.enlargePhoto")}
                    className="aspect-square rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Kaynaklar — maskeli (yaşayan) kişide `sources` taşınmadığı için boş kalır */}
          {person.sources && person.sources.length > 0 && (
            <section>
              <SectionTitle>{t("drawer.sources")}</SectionTitle>
              <ul className="space-y-2.5">
                {person.sources.map((s) => {
                  const meta = SOURCE_KINDS[s.kind ?? ""];
                  return (
                    <li key={s.id} className="flex gap-2.5">
                      <span className="text-sm w-5 text-center shrink-0" aria-hidden>
                        {meta?.icon ?? "✨"}
                      </span>
                      <div className="min-w-0">
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline leading-tight break-words"
                          >
                            {s.title}
                          </a>
                        ) : (
                          <p className="text-sm text-text leading-tight break-words">{s.title}</p>
                        )}
                        {s.note && (
                          <p className="text-[11px] text-text-subtle leading-snug mt-0.5 whitespace-pre-wrap">
                            {s.note}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {person.memories && person.memories.length > 0 && (
            <section>
              <SectionTitle>{t("drawer.memories")}</SectionTitle>
              <ul className="space-y-3">
                {person.memories.map((m) => (
                  <li key={m.id} className="rounded-xl bg-surface-2 p-3">
                    {m.prompt && (
                      <p className="text-xs font-medium text-text-muted mb-1 leading-snug">{m.prompt}</p>
                    )}
                    {m.text && (
                      <p className="text-sm text-text leading-snug whitespace-pre-wrap">{m.text}</p>
                    )}
                    {m.audio && (
                      <audio controls src={m.audio} className="mt-2 h-9 w-full" preload="none" />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {timeline.hasEvents && (timeline.dated.length > 0 || timeline.undated.length > 0) && (
            <section>
              <SectionTitle>{t("drawer.timeline")}</SectionTitle>
              {timeline.dated.length > 0 && (
                <ol>
                  {timeline.dated.map((it, i) => (
                    <TimelineRow
                      key={it.key}
                      year={it.date!.slice(0, 4)}
                      icon={it.icon}
                      label={it.label}
                      sub={it.sub}
                      last={i === timeline.dated.length - 1 && timeline.undated.length === 0}
                    />
                  ))}
                </ol>
              )}
              {timeline.undated.length > 0 && (
                <div className="mt-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-text-subtle mb-1 pl-[3.25rem]">
                    {t("drawer.undated")}
                  </p>
                  <ol>
                    {timeline.undated.map((it, i) => (
                      <TimelineRow
                        key={it.key}
                        icon={it.icon}
                        label={it.label}
                        sub={it.sub}
                        last={i === timeline.undated.length - 1}
                      />
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}

          <RelationGroup
            title={t("drawer.parents")}
            people={parents}
            onSelect={onSelect}
            badgeOf={(par) => {
              const l = parentLinkOf(person, par.id);
              if (!l) return undefined;
              const parts: string[] = [];
              if (l.kind && l.kind !== "biological") parts.push(t(`parentKind.${l.kind}`));
              if (l.estranged) parts.push(t(`estrangement.${l.estranged}.child`));
              return parts.length ? { text: parts.join(" · "), note: l.note } : undefined;
            }}
            emptyAction={
              !readOnly && parents.length < 2
                ? { label: t("drawer.addParent"), onClick: () => onQuickAdd("parent", person.id) }
                : undefined
            }
          />
          <RelationGroup
            title={t("drawer.spouse")}
            people={spouses}
            onSelect={onSelect}
            emptyAction={
              readOnly
                ? undefined
                : { label: t("drawer.addSpouse"), onClick: () => onQuickAdd("spouse", person.id) }
            }
          />
          <RelationGroup title={t("drawer.formerSpouse")} people={formerSpouses} onSelect={onSelect} />
          <RelationGroup
            title={t("drawer.children")}
            people={children}
            onSelect={onSelect}
            badgeOf={(ch) => {
              const l = parentLinkOf(ch, person.id);
              if (!l) return undefined;
              const parts: string[] = [];
              if (l.kind && l.kind !== "biological") parts.push(t(`parentKind.${l.kind}`));
              if (l.estranged) parts.push(t(`estrangement.${l.estranged}.parent`));
              return parts.length ? { text: parts.join(" · "), note: l.note } : undefined;
            }}
            emptyAction={
              readOnly
                ? undefined
                : { label: t("drawer.addChild"), onClick: () => onQuickAdd("child", person.id) }
            }
          />
          <RelationGroup
            title={t("drawer.siblings")}
            people={siblings}
            onSelect={onSelect}
            emptyAction={
              !readOnly && parents.length > 0
                ? { label: t("drawer.addSibling"), onClick: () => onQuickAdd("sibling", person.id) }
                : undefined
            }
          />
        </div>
      </aside>

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

/**
 * Basit ışık kutusu. Yalnızca açıkken monte edilir; böylece kendi
 * `useEscapeKey` kaydı yığının en üstünde olur ve ESC önce ışık kutusunu,
 * kapandığında ise drawer'ı kapatır.
 */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEscapeKey(onClose);
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("drawer.photoDialog")}
    >
      <button
        onClick={onClose}
        aria-label={t("drawer.close")}
        className="absolute right-3 top-3 w-9 h-9 grid place-items-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-lg shadow-modal"
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle mb-2">
      {children}
    </h3>
  );
}

function TimelineRow({
  year,
  icon,
  label,
  sub,
  last,
}: {
  year?: string;
  icon: string;
  label: string;
  sub?: string;
  last?: boolean;
}) {
  return (
    <li className="flex gap-2.5 items-stretch">
      {/* Yıl — solda belirgin */}
      <div className="w-9 shrink-0 pt-0.5 text-right">
        <span className="text-sm font-semibold text-text tabular-nums">{year ?? "—"}</span>
      </div>
      {/* İşaret + dikey çizgi */}
      <div className="flex flex-col items-center shrink-0">
        <span className="text-sm leading-none grid place-items-center w-5 h-5" aria-hidden>{icon}</span>
        {!last && <span className="w-px flex-1 bg-border mt-0.5" />}
      </div>
      {/* İçerik — sağda */}
      <div className={`min-w-0 pt-0.5 ${last ? "pb-0.5" : "pb-3"}`}>
        <p className="text-sm text-text leading-tight">{label}</p>
        {sub && <p className="text-[11px] text-text-subtle leading-tight mt-0.5">{sub}</p>}
      </div>
    </li>
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
