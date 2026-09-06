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
import RecordHints from "./RecordHints";
import AiAssist from "./AiAssist";
import { enhancedUrl, isCloudinaryImage } from "@/lib/photo";
import { googleMapsUrl, projectEquirectangular } from "@/lib/places";
import { COUNTRIES, WORLD_VIEWBOX } from "@/lib/world-map";
import { calcAge, formatLong, lifeSpan } from "@/lib/date";
import { zodiacSign, zodiacKey, elementKey, traitsOf, traitKey } from "@/lib/zodiac";
import { ascendant } from "@/lib/ascendant";
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
import { useAuthority } from "./AuthorityContext";
import { moveInList, siblingGroup } from "@/lib/siblings";
import { useRouter } from "next/navigation";
import { fullName } from "@/lib/name";
import { entrySourceLabel } from "@/lib/entry-source";
import CalendarAdd from "./CalendarAdd";
import { resolveAssociations } from "@/lib/associates";
import { ASSOCIATION_TYPES } from "@/types/family";
import useEscapeKey from "@/lib/useEscapeKey";
import { usePrivacy } from "./PrivacyContext";
import { useReadOnly } from "./ReadOnlyContext";
import BondSection from "./BondSection";
import type { UseBonds } from "@/lib/useBonds";
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
  onLocate: (id: string) => void;
  /** Kişi merkezli "Çevre" grafiğini aç. */
  onEgo: (id: string) => void;
  onDeleted: () => void;
  /**
   * Duygusal bağ katmanı. Panel açıkken yüklenir (katman kapalı olsa bile):
   * bağı EKLEMEK için katmanı açmak zorunda kalmak tuhaf olurdu.
   */
  bonds: UseBonds;
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
  onLocate,
  onEgo,
  onDeleted,
  bonds,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { view, hideLiving } = usePrivacy();
  const { readOnly } = useReadOnly();
  const authority = useAuthority();
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

  // Yakın çevre (aile-dışı yakınlar) — iki yönlü. Gizli kişide gösterilmez.
  const closeCircle = useMemo(() => (masked ? [] : resolveAssociations(rawPerson, people)), [masked, rawPerson, people]);

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
  /*
   * Burç, MASKELENMİŞ `person` üzerinden hesaplanır (satır ~104: view()).
   * Bu bilinçli: burç doğum tarihinin ~1 aylık aralığını ele verir, yani
   * gizlenmiş bir doğum tarihinden burç göstermek gizliliği delerdi. Maskeli
   * kişide `birthDate` taşınmadığından burç kendiliğinden boş kalır.
   */
  const zodiac = zodiacSign(person.birthDate);
  /*
   * Yükselen, güneş burcundan farklı olarak TAM tarih + saat + koordinat
   * ister; üçünden biri eksikse `null` döner ve hiç çizilmez. Maskeli
   * kişide `birthTime` ve `birthCoords` zaten taşınmadığı için (beyaz
   * liste) kendiliğinden boş kalıyor — burcun kendisi gibi.
   */
  const yukselen = ascendant(person.birthDate, person.birthTime, person.birthCoords);
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
        className="fixed inset-0 z-30 bg-black/35 sm:hidden animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      <aside
        className="
          fixed z-40 bg-bg-elevated border-border shadow-modal flex flex-col
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl border-t animate-slide-up
          sm:top-[var(--app-header-h,56px)] sm:bottom-0 sm:right-0 sm:left-auto sm:w-[340px] sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l sm:animate-slide-left
        "
        aria-label={t("drawer.aria")}
      >
        {/* Mobil tutamaç */}
        <div className="sm:hidden pt-2.5 pb-1 grid place-items-center shrink-0">
          <div className="w-9 h-1 rounded-full bg-border-strong" />
        </div>

        {/* Başlık */}
        <div className="relative shrink-0 px-5 pt-4 sm:pt-5 pb-4 border-b border-border">
          <button
            onClick={onClose}
            aria-label={t("drawer.close")}
            className="absolute right-3 top-3 sm:top-4 w-8 h-8 grid place-items-center rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors"
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
                {/*
                  Katkı vericinin düzenleyemediği kayıtta düğme "değişiklik
                  öner" diyor. "Düzenle" deseydi, formu doldurup kaydedene
                  kadar değişikliğin doğrudan geçmeyeceğini bilmezdi.
                */}
                {authority.canEditPerson(person) ? t("drawer.edit") : t("proposal.submit")}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => onFocus(person.id)}>
              {t("drawer.focus")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onLocate(person.id)}>
              {t("drawer.locate")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onEgo(person.id)}>
              {t("drawer.ego")}
            </Button>
            {/*
              SİLME katkı vericiye kapalı — kendi eklediği kayıt için bile.
              Sunucu da reddediyor (`canEdit`); burada gizlenmeseydi düğme
              görünür, basılır ve 403 dönerdi. Sebebi anlaşılmayan bir ret,
              görünmeyen bir düğmeden kötüdür.
            */}
            {!readOnly && authority.canEditAll && (
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
          {(person.birthDate || person.officialBirthDate || person.birthPlace || person.deathDate) && (
            <section className="space-y-2">
              {person.birthDate && (
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <Fact icon="🎂" label={t("drawer.birth")} value={formatLong(person.birthDate)} />
                  </div>
                  {person.birthDate.split("-").length >= 3 && (
                    <CalendarAdd
                      event={{ title: t("cal.birthdayTitle", { name: fullName(person) }), date: person.birthDate, yearly: true }}
                    />
                  )}
                </div>
              )}
              {zodiac && (
                <div className="flex items-start gap-2.5">
                  <span className="text-sm w-5 text-center shrink-0" aria-hidden>✨</span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] text-text-subtle">{t("zodiac.label")}</span>
                    <p className="text-sm text-text leading-tight">
                      {t(zodiacKey(zodiac.sign))}
                      <span className="text-text-subtle"> · {t(elementKey(zodiac.element))}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {traitsOf(zodiac.sign).map((tr) => (
                        <span
                          key={tr}
                          className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[10px] text-text-subtle"
                        >
                          {t(traitKey(tr))}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-text-subtle">{t("zodiac.traitsNote")}</p>
                  </div>
                </div>
              )}
              {/*
                YÜKSELEN. Kesin değilse burç YAZILMIYOR: kaydedilen saatin
                hangi dilime ait olduğunu bilmiyoruz ve 1 saatlik fark yarım
                burca varabiliyor. Adayları gösterip "kesin değil" demek,
                ikisinden birini seçip kesinmiş gibi sunmaktan dürüst.
              */}
              {yukselen && (
                <div className="flex items-start gap-2.5">
                  <span className="text-sm w-5 text-center shrink-0" aria-hidden>🌅</span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] text-text-subtle">{t("asc.label")}</span>
                    {yukselen.certain && yukselen.sign ? (
                      <p className="text-sm text-text leading-tight">
                        {t(zodiacKey(yukselen.sign))}
                        <span className="text-text-subtle">
                          {" "}· {t("asc.degree", { deg: Math.floor(yukselen.candidates[0].degreeInSign) })}
                        </span>
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-text leading-tight">
                          {yukselen.candidates.map((c) => t(zodiacKey(c.sign))).join(" / ")}
                        </p>
                        <p className="mt-1 text-[10px] text-text-subtle leading-snug">
                          {t("asc.uncertain")}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
              {/*
                Doğum saati maskeli kişide zaten görünmez: `maskPerson` beyaz
                liste ile çalışıyor ve bu alanı taşımıyor.
              */}
              {person.birthTime && (
                <Fact icon="🕰️" label={t("drawer.birthTime")} value={person.birthTime} />
              )}
              {person.officialBirthDate && (
                <Fact icon="🪪" label={t("drawer.officialBirth")} value={formatLong(person.officialBirthDate)} />
              )}
              {person.birthPlace && <Fact icon="📍" label={t("drawer.birthPlace")} value={person.birthPlace} gmapsQuery={person.birthPlace} />}
              {person.deathDate && <Fact icon="🕯️" label={t("drawer.death")} value={formatLong(person.deathDate)} />}
              {person.deathCause && <Fact icon="🩶" label={t("drawer.deathCause")} value={person.deathCause} />}
              {(person.burialPlace || person.burialCoords) && (
                <Fact
                  icon="🪦"
                  label={t("burial.label")}
                  value={
                    person.burialPlace ||
                    (person.burialCoords
                      ? `${person.burialCoords.lat.toFixed(4)}, ${person.burialCoords.lng.toFixed(4)}`
                      : "")
                  }
                  gmapsQuery={
                    person.burialCoords
                      ? `${person.burialCoords.lat},${person.burialCoords.lng}`
                      : person.burialPlace || undefined
                  }
                />
              )}
              {person.burialCoords && <BurialMiniMap coords={person.burialCoords} />}
            </section>
          )}

          {(person.language || person.religion || person.denomination ||
            person.ethnicity || person.nationality || person.orientation ||
            person.occupation || person.education || person.lineage) && (
            <section>
              <SectionTitle>{t("drawer.identity")}</SectionTitle>
              <dl className="space-y-1.5">
                {([
                  // Sülale kimlik satırlarının BAŞINDA: ailenin kendi
                  // kullandığı ad, meslekten önce gelir.
                  [t("drawer.lineage"), person.lineage],
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

          {/* Videolar */}
          {person.videos && person.videos.length > 0 && (
            <section>
              <SectionTitle>{t("drawer.videos")}</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {person.videos.map((src) => (
                  <video
                    key={src}
                    src={src}
                    controls
                    preload="metadata"
                    className="w-full aspect-video rounded-lg border border-border bg-black"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Belgeler / el yazısı */}
          {person.documents && person.documents.length > 0 && (
            <section>
              <SectionTitle>{t("drawer.documents")}</SectionTitle>
              <div className="grid grid-cols-3 gap-1.5">
                {person.documents.map((src) => {
                  const isImg = /\.(jpe?g|png|gif|webp|bmp|tiff?)(?:$|[?#])/i.test(src);
                  return isImg ? (
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
                  ) : (
                    <a
                      key={src}
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-lg border border-border grid place-items-center text-[10px] text-text-muted hover:border-primary transition-colors"
                    >
                      📄
                    </a>
                  );
                })}
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

          {/* Yakın çevre — aile-dışı yakınlar (arkadaş, komşu, vasi…) */}
          {(closeCircle.length > 0 || (!readOnly && !masked)) && (
            <section>
              <SectionTitle>{t("drawer.associations")}</SectionTitle>
              <ul className="space-y-1">
                {closeCircle.map(({ person: other, type, note }) => {
                  const op = view(other);
                  return (
                    <li key={other.id}>
                      <button
                        onClick={() => onSelect(other.id)}
                        className="w-full flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors text-left"
                      >
                        <Avatar person={op} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-text truncate leading-tight">{fullName(op)}</p>
                          {note && <p className="text-[11px] text-text-subtle truncate leading-tight">{note}</p>}
                        </div>
                        <span className="text-[11px] font-medium text-accent shrink-0">
                          {ASSOCIATION_TYPES[type]?.icon ?? "•"} {ASSOCIATION_TYPES[type]?.label ?? type}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!readOnly && !masked && (
                <button
                  onClick={() => onQuickAdd("associate", person.id)}
                  className="mt-1.5 flex items-center gap-1.5 text-xs text-accent hover:underline font-medium"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {t("drawer.addAssociate")}
                </button>
              )}
            </section>
          )}

          {/* Genogram duygusal bağlar — maskeli kişide gizli: maske "bu kişinin
              ayrıntısını gösterme" demek, ilişkileri en ayrıntılı kısmı. */}
          {!masked && (
            <section>
              <SectionTitle>{t("bond.layer")}</SectionTitle>
              <BondSection
                person={rawPerson}
                people={people}
                bonds={bonds}
                readOnly={readOnly}
                onSelect={onSelect}
              />
            </section>
          )}

          {/* Kayıt/arama ipuçları — yaşayanlar dâhil gizli olmayan herkes için
              (Madde 3). Wikidata + Google araması RecordHints içinde. */}
          {!person.confidential && (
            <section>
              <SectionTitle>{t("drawer.records")}</SectionTitle>
              <RecordHints person={person} />
            </section>
          )}

          {!readOnly && !person.confidential && (
            <section>
              <SectionTitle>{t("drawer.aiStory")}</SectionTitle>
              <AiAssist person={person} />
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

          {/* #6 — Köken/iz: bu kart nasıl/hangi yöntemle eklendi? */}
          {person.entrySource && (
            <p className="pt-1 text-[11px] text-text-subtle">
              {t("drawer.entrySource")}: {entrySourceLabel(person.entrySource, t)}
            </p>
          )}
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
  const [enhanced, setEnhanced] = useState(false);
  const canEnhance = isCloudinaryImage(src);
  const shown = enhanced ? enhancedUrl(src) : src;
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
      {/* İyileştir — Cloudinary dönüşümüyle görüntü-anı iyileştirme (yalnız gösterim) */}
      {canEnhance && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEnhanced((v) => !v);
          }}
          aria-pressed={enhanced}
          className={`absolute left-3 top-3 flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-medium transition-colors ${
            enhanced ? "bg-primary text-primary-text" : "bg-white/10 text-white/90 hover:bg-white/20"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {enhanced ? t("photo.original") : t("photo.enhance")}
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shown}
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

function Fact({
  icon,
  label,
  value,
  gmapsQuery,
}: {
  icon: string;
  label: string;
  value: string;
  /** Verilirse "Google Maps'te aç" bağlantısı gösterilir (koordinat ya da yer adı). */
  gmapsQuery?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-sm w-5 text-center shrink-0" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-[11px] text-text-subtle">{label}</span>
        <p className="text-sm text-text leading-tight">{value}</p>
      </div>
      {gmapsQuery && <GMapsLink query={gmapsQuery} />}
    </div>
  );
}

/** Küçük "Google Maps'te aç" bağlantısı — yeni sekmede açar (anahtarsız). */
function GMapsLink({ query }: { query: string }) {
  return (
    <a
      href={googleMapsUrl(query)}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-border bg-surface hover:bg-surface-2 text-[11px] font-medium text-primary transition-colors"
      title="Google Maps"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 21s6-5.6 6-10.4A6 6 0 006 10.6C6 15.4 12 21 12 21z M12 8.4a2.1 2.1 0 100 4.2 2.1 2.1 0 000-4.2z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      </svg>
      Google Maps
    </a>
  );
}

/** Defin yeri için küçük, etkileşimsiz harita — iğneyi çevreleyen bölgeyi gösterir. */
function BurialMiniMap({ coords }: { coords: { lat: number; lng: number } }) {
  const VW = WORLD_VIEWBOX.w;
  const VH = WORLD_VIEWBOX.h;
  const { x, y } = projectEquirectangular(coords.lat, coords.lng, VW, VH);
  const w = VW / 14;
  const h = w * (VH / VW);
  const bx = Math.min(Math.max(0, x - w / 2), VW - w);
  const by = Math.min(Math.max(0, y - h / 2), VH - h);
  const scale = w / VW;
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-surface-2 ml-7">
      <svg viewBox={`${bx} ${by} ${w} ${h}`} className="w-full block" style={{ height: 130 }} role="img">
        <rect x={0} y={0} width={VW} height={VH} fill="var(--surface-2)" />
        <g fill="var(--surface-3)" stroke="var(--border-strong)" strokeWidth={0.6 * scale} strokeLinejoin="round">
          {COUNTRIES.map((c, i) => <path key={i} d={c.d} />)}
        </g>
        <circle cx={x} cy={y} r={9 * scale} fill="var(--primary)" fillOpacity={0.25} />
        <circle cx={x} cy={y} r={2.6 * scale} fill="var(--primary)" stroke="var(--primary-text)" strokeWidth={0.8 * scale} />
      </svg>
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
