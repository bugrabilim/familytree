"use client";

import { useMemo, useState } from "react";
import type { Gender, Person } from "@/types/family";
import Avatar, { genderTone } from "./ui/Avatar";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import { calcAge, daysUntilAnniversary, daysUntilBirthday, humanizeDays, lifeSpan } from "@/lib/date";
import {
  ancestorDepths,
  bloodDegrees,
  computeStats,
  describeRelation,
  descendantDepths,
  findRelationPath,
  genitive,
  indexPeople,
  possessive,
  relativesByGeneration,
} from "@/lib/relations";
import { fullName } from "@/lib/name";
import { usePrivacy } from "./PrivacyContext";
import { useReadOnly } from "./ReadOnlyContext";
import { isMasked } from "@/lib/privacy";
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onImportExport: () => void;
}

export default function PanelView({ people, onSelect, onAdd, onImportExport }: Props) {
  const { view, hideLiving } = usePrivacy();
  const { readOnly } = useReadOnly();
  const t = useT();
  const stats = useMemo(() => computeStats(people), [people]);
  const idx = useMemo(() => indexPeople(people), [people]);

  // 🎂 Doğum günleri · 💍 evlilik yıldönümleri · 🕯️ anma günleri — tek liste.
  // Yıldönümleri, gizlilik için maskeli kopyadan türetilir: gizli yaşayan bir
  // kişinin evlilik tarihi (maskeli kopyada `events` yok) sızmaz.
  const upcoming = useMemo(() => {
    // Yaklaşan olaylar penceresi (gün). Etiket metniyle (i18n
    // "panel.card.upcomingHint") uyumlu tutulmalı.
    const WINDOW_DAYS = 30;
    type Ev = {
      key: string;
      kind: "birthday" | "anniversary" | "memorial";
      rawPerson: Person;
      days: number;
      icon: string;
      label: string;
    };
    const out: Ev[] = [];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const occYearOf = (days: number) => {
      const occ = new Date(startOfToday);
      occ.setDate(occ.getDate() + days);
      return occ.getFullYear();
    };

    for (const p of people) {
      // 🎂 Doğum günü — yalnızca yaşayanlar (mevcut davranış korunur)
      if (!p.deathDate && p.birthDate) {
        const days = daysUntilBirthday(p.birthDate);
        if (days !== null && days <= WINDOW_DAYS) {
          out.push({ key: `b-${p.id}`, kind: "birthday", rawPerson: p, days, icon: "🎂", label: "" });
        }
      }

      // 🕯️ Anma günü — vefat edenler. Gizli (confidential) kayıtlar hariç.
      if (p.deathDate && !isMasked(p, hideLiving)) {
        const days = daysUntilAnniversary(p.deathDate);
        if (days !== null && days <= WINDOW_DAYS) {
          const years = occYearOf(days) - Number(p.deathDate.slice(0, 4));
          out.push({
            key: `m-${p.id}`,
            kind: "memorial",
            rawPerson: p,
            days,
            icon: "🕯️",
            label: years >= 1 ? t("panel.memorial.year", { years }) : t("panel.memorial.generic"),
          });
        }
      }

      // 💍 Evlilik yıldönümü — maskeli kopyadan okunur (gizli tarih sızmaz).
      const events = view(p).events;
      if (events) {
        for (const ev of events) {
          if (ev.type !== "evlilik" || !ev.date) continue;
          const days = daysUntilAnniversary(ev.date);
          if (days === null || days > WINDOW_DAYS) continue;
          const years = occYearOf(days) - Number(ev.date.slice(0, 4));
          out.push({
            key: `a-${p.id}-${ev.id}`,
            kind: "anniversary",
            rawPerson: p,
            days,
            icon: "💍",
            label: years >= 1 ? t("panel.anniversary.year", { years }) : t("panel.anniversary.generic"),
          });
        }
      }
    }

    return out.sort((a, b) => a.days - b.days).slice(0, 8);
  }, [people, view, hideLiving, t]);

  const eldest = useMemo(() => {
    return [...people]
      .filter((p) => p.birthDate)
      .sort((a, b) => (a.birthDate ?? "").localeCompare(b.birthDate ?? ""))
      .slice(0, 5);
  }, [people]);

  const newest = useMemo(() => {
    return [...people]
      .filter((p) => p.birthDate)
      .sort((a, b) => (b.birthDate ?? "").localeCompare(a.birthDate ?? ""))
      .slice(0, 5);
  }, [people]);

  // Gizli alanlar sayım/gösterime sızmasın diye maskeli kopya üzerinde çalışırız
  // (panelin geri kalanıyla tutarlı). Kimlik (`id`) maskede korunur → seçim çalışır.
  const shown = useMemo(() => people.map(view), [people, view]);

  // Yaşa göre sıralı (yaşayan = bugüne, vefat = ölüme kadar). #6/#7 için ortak.
  const byAge = useMemo(
    () =>
      shown
        .filter((p) => p.birthDate)
        .map((p) => ({ p, age: calcAge(p.birthDate, p.deathDate), living: !p.deathDate }))
        .filter((x): x is { p: Person; age: number; living: boolean } => x.age !== null),
    [shown]
  );
  const livingOldest = useMemo(
    () => byAge.filter((x) => x.living).sort((a, b) => b.age - a.age).slice(0, 5),
    [byAge]
  );
  const youngest = useMemo(
    () => byAge.filter((x) => x.living).sort((a, b) => a.age - b.age).slice(0, 5),
    [byAge]
  );
  const longestLived = useMemo(
    () => [...byAge].sort((a, b) => b.age - a.age).slice(0, 5),
    [byAge]
  );

  // #8 — özet grupları (hepsi maskeli kopyadan; tıklanınca kişiler listelenir).
  const groups = useMemo(
    () => ({
      female: shown.filter((p) => p.gender === "female"),
      male: shown.filter((p) => p.gender === "male"),
      living: shown.filter((p) => !p.deathDate),
      deceased: shown.filter((p) => p.deathDate),
      congenital: shown.filter((p) => p.congenitalCondition?.trim()),
      acquired: shown.filter((p) => p.healthCondition?.trim()),
      deathCause: shown.filter((p) => p.deathCause?.trim()),
      orientation: shown.filter((p) => p.orientation?.trim()),
      polygamy: shown.filter((p) => (p.spouseIds?.length ?? 0) > 1),
      multiMarriage: shown.filter(
        (p) => (p.spouseIds?.length ?? 0) + (p.formerSpouseIds?.length ?? 0) > 1
      ),
    }),
    [shown]
  );

  const genderCounts = useMemo(() => {
    const c: Record<Gender, number> = { female: 0, male: 0, other: 0, unknown: 0 };
    for (const p of shown) c[p.gender] = (c[p.gender] ?? 0) + 1;
    return c;
  }, [shown]);

  // #1 — bir rakama basınca ilgili kişileri listeleyen alt pencere.
  const [drill, setDrill] = useState<{ title: string; list: Person[] } | null>(null);
  const openDrill = (title: string, list: Person[]) => {
    if (list.length) setDrill({ title, list });
  };

  if (people.length === 0) {
    return (
      <div className="h-full grid place-items-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-3">🌱</p>
          <h2 className="font-serif text-xl font-semibold text-text mb-1.5">{t("panel.empty.title")}</h2>
          <p className="text-sm text-text-muted mb-5">
            {t("panel.empty.body")}
          </p>
          {!readOnly && <Button onClick={onAdd}>{t("panel.empty.addFirst")}</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* İstatistikler — rakamlar tıklanabilir (ilgili kişileri listeler) */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value={stats.total} label={t("panel.stats.people")} tone="primary"
            onClick={() => openDrill(t("panel.stats.people"), shown)} />
          <Stat value={stats.generations} label={t("panel.stats.generations")} tone="accent" />
          <Stat value={stats.living} label={t("panel.stats.living")} tone="male"
            onClick={() => openDrill(t("panel.stats.living"), groups.living)} />
          <Stat value={stats.deceased} label={t("panel.stats.deceased")} tone="neutral"
            onClick={() => openDrill(t("panel.stats.deceased"), groups.deceased)} />
        </section>

        {/* #2 Cinsiyet dağılımı — pasta (donut) grafik + tıklanabilir açıklama */}
        <GenderPie
          counts={genderCounts}
          onPick={(g, label) => openDrill(label, shown.filter((p) => p.gender === g))}
        />


        {/* Rakamlarla aile — genişletilmiş istatistikler */}
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-serif text-base font-semibold text-text">{t("panel.numbers")}</h2>
            <span className="text-[11px] text-text-subtle shrink-0">{t("panel.summary")}</span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
            <MiniStat label={t("panel.mini.female")} value={stats.female}
              onClick={() => openDrill(t("panel.mini.female"), groups.female)} />
            <MiniStat label={t("panel.mini.male")} value={stats.male}
              onClick={() => openDrill(t("panel.mini.male"), groups.male)} />
            <MiniStat label={t("panel.mini.marriages")} value={stats.marriages} />
            <MiniStat label={t("panel.mini.divorces")} value={stats.divorces} />
            {stats.avgLifespan !== undefined && (
              <MiniStat label={t("panel.mini.avgLifespan")} value={t("panel.mini.avgLifespanValue", { years: stats.avgLifespan })} />
            )}
            {stats.oldestLivingAge !== undefined && (
              <MiniStat label={t("panel.mini.oldestLiving")} value={t("panel.mini.oldestLivingValue", { age: stats.oldestLivingAge })} />
            )}
            {stats.oldestBirthYear !== undefined && (
              <MiniStat label={t("panel.mini.oldestBirth")} value={stats.oldestBirthYear} />
            )}
            <MiniStat label={t("panel.mini.largestSibship")} value={stats.largestSibship} />
            {stats.topBirthPlace && (
              <MiniStat label={t("panel.mini.topBirthPlace")} value={`${stats.topBirthPlace.name} (${stats.topBirthPlace.count})`} wide />
            )}
            {stats.unlinked > 0 && <MiniStat label={t("panel.mini.unlinked")} value={stats.unlinked} />}
            {/* #8 — sağlık / yönelim / evlilik desenleri (yalnız veri varsa; tıklanır) */}
            {groups.congenital.length > 0 && (
              <MiniStat label="Doğuştan rahatsızlık" value={groups.congenital.length}
                onClick={() => openDrill("Doğuştan rahatsızlığı olanlar", groups.congenital)} />
            )}
            {groups.acquired.length > 0 && (
              <MiniStat label="Sonradan rahatsızlık" value={groups.acquired.length}
                onClick={() => openDrill("Sonradan rahatsızlanan/engelli olanlar", groups.acquired)} />
            )}
            {groups.deathCause.length > 0 && (
              <MiniStat label="Ölüm nedeni kayıtlı" value={groups.deathCause.length}
                onClick={() => openDrill("Ölüm nedeni kayıtlı olanlar", groups.deathCause)} />
            )}
            {groups.orientation.length > 0 && (
              <MiniStat label="Cinsel yönelim kayıtlı" value={groups.orientation.length}
                onClick={() => openDrill("Cinsel yönelim kaydı olanlar", groups.orientation)} />
            )}
            {groups.polygamy.length > 0 && (
              <MiniStat label="Çok eşli (aynı anda)" value={groups.polygamy.length}
                onClick={() => openDrill("Aynı anda birden çok eşi olanlar", groups.polygamy)} />
            )}
            {groups.multiMarriage.length > 0 && (
              <MiniStat label="Birden çok evlilik" value={groups.multiMarriage.length}
                onClick={() => openDrill("Birden çok evlilik yapanlar", groups.multiMarriage)} />
            )}
          </dl>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Kişinin akrabaları — "Hatice'nin halası kim?" */}
          <Card title={t("panel.card.relatives")} hint={t("panel.card.relativesHint")}>
            <RelativesFinder people={people} idx={idx} onSelect={onSelect} />
          </Card>

          {/* Kuşak görüntüleyici */}
          <Card title={t("panel.card.generation")} hint={t("panel.card.generationHint")}>
            <GenerationViewer people={people} idx={idx} onSelect={onSelect} />
          </Card>

          {/* Kuşaklara göre akrabalar — kuşak-uzaklığına göre ayrı sütunlar */}
          <Card title={t("panel.card.genSpread")} hint={t("panel.card.genSpreadHint")} className="lg:col-span-2">
            <GenerationSpread people={people} idx={idx} onSelect={onSelect} />
          </Card>

          {/* Yakınlık derecesi */}
          <Card title={t("panel.card.degree")} hint={t("panel.card.degreeHint")}>
            <DegreeViewer people={people} idx={idx} onSelect={onSelect} />
          </Card>

          {/* Yaklaşan olaylar — doğum günü 🎂 · evlilik yıldönümü 💍 · anma 🕯️ */}
          <Card
            title={t("panel.card.upcoming")}
            hint={t("panel.card.upcomingHint")}
            empty={upcoming.length === 0 ? t("panel.card.upcomingEmpty") : undefined}
          >
            <ul className="space-y-1">
              {upcoming.map((ev) => {
                const person = view(ev.rawPerson);
                const masked = isMasked(ev.rawPerson, hideLiving);
                let subtext: React.ReactNode = null;
                if (ev.kind === "birthday") {
                  const age = calcAge(ev.rawPerson.birthDate);
                  subtext = masked ? (
                    <p className="text-[11px] text-text-subtle leading-tight">{t("common.living")}</p>
                  ) : age !== null ? (
                    <p className="text-[11px] text-text-subtle leading-tight">
                      {t("panel.birthday.turning", { age: age + (ev.days === 0 ? 0 : 1) })}
                    </p>
                  ) : (
                    <p className="text-[11px] text-text-subtle leading-tight">{t("panel.birthday.generic")}</p>
                  );
                } else {
                  subtext = (
                    <p className="text-[11px] text-text-subtle leading-tight">
                      {ev.icon} {ev.label}
                    </p>
                  );
                }
                return (
                  <li key={ev.key}>
                    <button
                      onClick={() => onSelect(person.id)}
                      className="w-full flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors text-left"
                    >
                      <Avatar person={person} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text truncate leading-tight">
                          {fullName(person)}
                        </p>
                        {subtext}
                      </div>
                      <span
                        className={`text-[11px] font-medium px-2 py-1 rounded-lg shrink-0 ${
                          ev.days <= 1
                            ? "bg-accent-soft text-accent"
                            : "bg-surface-2 text-text-muted"
                        }`}
                      >
                        {humanizeDays(ev.days)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Akrabalık hesaplayıcı */}
          <Card title={t("panel.card.calculator")} hint={t("panel.card.calculatorHint")}>
            <RelationCalculator people={people} idx={idx} onSelect={onSelect} />
          </Card>

          {/* En eski kuşak */}
          <Card title={t("panel.card.oldest")} empty={eldest.length === 0 ? t("panel.card.noDated") : undefined}>
            <ul className="space-y-1">
              {eldest.map((rawP) => {
                const p = view(rawP);
                const masked = isMasked(rawP, hideLiving);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => onSelect(p.id)}
                      className="w-full flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors text-left"
                    >
                      <Avatar person={p} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text truncate leading-tight">
                          {fullName(p)}
                        </p>
                        {!masked && p.birthPlace && (
                          <p className="text-[11px] text-text-subtle truncate leading-tight">
                            {p.birthPlace}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-text-muted tabular-nums shrink-0">
                        {masked ? t("common.living") : lifeSpan(p.birthDate, p.deathDate)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* #6 Yaşayan en yaşlılar */}
          <Card title="Yaşayan en yaşlılar" empty={livingOldest.length === 0 ? t("panel.card.noDated") : undefined}>
            <AgeList rows={livingOldest} onSelect={onSelect} />
          </Card>

          {/* #6 En gençler (yaşayan) */}
          <Card title="En gençler" empty={youngest.length === 0 ? t("panel.card.noDated") : undefined}>
            <AgeList rows={youngest} onSelect={onSelect} />
          </Card>

          {/* #7 En uzun yaşamışlar (yaşayan + vefat) */}
          <Card title="En uzun yaşamışlar" hint="Yaşamış/yaşayan tüm kişiler arasında en yüksek yaş" empty={longestLived.length === 0 ? t("panel.card.noDated") : undefined}>
            <AgeList rows={longestLived} onSelect={onSelect} />
          </Card>

          {/* En yeni kayıtlar */}
          <Card title={t("panel.card.newest")} hint={t("panel.card.newestHint")} empty={newest.length === 0 ? t("panel.card.noDated") : undefined}>
            <ul className="space-y-1">
              {newest.map((rawP) => {
                const p = view(rawP);
                const masked = isMasked(rawP, hideLiving);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => onSelect(p.id)}
                      className="w-full flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors text-left"
                    >
                      <Avatar person={p} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text truncate leading-tight">
                          {fullName(p)}
                        </p>
                        {!masked && p.birthPlace && (
                          <p className="text-[11px] text-text-subtle truncate leading-tight">
                            {p.birthPlace}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-text-muted tabular-nums shrink-0">
                        {masked ? t("common.living") : lifeSpan(p.birthDate, p.deathDate)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Soyadları + uyarılar */}
          <Card title={t("panel.card.families")} hint={t("panel.card.familiesHint")}>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {stats.surnames.map((s) => (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 text-xs text-text"
                >
                  {s.name}
                  <span className="text-text-subtle tabular-nums">{s.count}</span>
                </span>
              ))}
            </div>

            {stats.unlinked > 0 && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-accent-soft border border-accent/15">
                <span className="text-sm" aria-hidden>💡</span>
                <p className="text-xs text-text leading-relaxed">
                  <span className="font-semibold">{t("panel.unlinkedTip.bold", { count: stats.unlinked })}</span>{" "}
                  {t("panel.unlinkedTip.mid")}{" "}
                  <span className="font-semibold">+</span> {t("panel.unlinkedTip.end")}
                </p>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="secondary" onClick={onImportExport}>
                {t("common.gedcom")}
              </Button>
              {!readOnly && (
                <Button size="sm" variant="secondary" onClick={onAdd}>
                  {t("common.addPerson")}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* #1 — rakama tıklayınca ilgili kişiler */}
      {drill && (
        <Modal title={drill.title} subtitle={t("common.peopleCount", { count: drill.list.length })} onClose={() => setDrill(null)}>
          <ul className="space-y-1">
            {drill.list.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    onSelect(p.id);
                    setDrill(null);
                  }}
                  className="w-full flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors text-left"
                >
                  <Avatar person={p} size="sm" />
                  <span className="text-sm text-text truncate flex-1 min-w-0 leading-tight">{fullName(p)}</span>
                  <span className="text-xs text-text-muted tabular-nums shrink-0">
                    {lifeSpan(p.birthDate, p.deathDate)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

const TONES = {
  primary: "text-primary bg-primary-soft",
  accent: "text-accent bg-accent-soft",
  male: "text-male bg-male-soft",
  neutral: "text-neutral bg-neutral-soft",
} as const;

function Stat({
  value,
  label,
  tone,
  onClick,
}: {
  value: number;
  label: string;
  tone: keyof typeof TONES;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
      <p className="text-xs mt-1.5 opacity-80">{label}</p>
    </>
  );
  const base = `rounded-2xl p-4 ${TONES[tone]}`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${base} text-left w-full transition-transform hover:scale-[1.02] cursor-pointer`}
    >
      {inner}
    </button>
  ) : (
    <div className={base}>{inner}</div>
  );
}

function MiniStat({
  label,
  value,
  wide,
  onClick,
}: {
  label: string;
  value: string | number;
  wide?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <dt className={`text-[11px] leading-tight ${onClick ? "text-primary/70 group-hover:text-primary" : "text-text-subtle"}`}>
        {label}
      </dt>
      <dd className="text-lg font-semibold text-text tabular-nums leading-tight truncate">{value}</dd>
    </>
  );
  const cls = wide ? "col-span-2" : "";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} group text-left rounded-lg -m-1 p-1 hover:bg-surface-2 transition-colors cursor-pointer`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Yaşa göre kişi listesi — #6/#7 kartlarında ortak. */
function AgeList({
  rows,
  onSelect,
}: {
  rows: Array<{ p: Person; age: number; living?: boolean }>;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {rows.map(({ p, age, living }) => (
        <li key={p.id}>
          <button
            onClick={() => onSelect(p.id)}
            className="w-full flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors text-left"
          >
            <Avatar person={p} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text truncate leading-tight">{fullName(p)}</p>
              <p className="text-[11px] text-text-subtle tabular-nums leading-tight">
                {lifeSpan(p.birthDate, p.deathDate)}
              </p>
            </div>
            <span className="text-xs font-medium text-text-muted tabular-nums shrink-0">
              {living === false ? `${age} yıl` : `${age} yaş`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** #2 — Cinsiyet dağılımı donut grafiği + tıklanabilir açıklama. */
function GenderPie({
  counts,
  onPick,
}: {
  counts: Record<Gender, number>;
  onPick: (g: Gender, label: string) => void;
}) {
  const LABELS: Record<Gender, string> = {
    female: "Kadın",
    male: "Erkek",
    other: "Diğer",
    unknown: "Bilinmiyor",
  };
  const data = (Object.keys(LABELS) as Gender[])
    .map((g) => ({ g, v: counts[g] ?? 0, label: LABELS[g] }))
    .filter((d) => d.v > 0);
  const total = data.reduce((s, d) => s + d.v, 0);
  if (total === 0) return null;

  const rMid = 34;
  const sw = 16;
  const C = 2 * Math.PI * rMid;
  let acc = 0;
  const arcs = data.map((d) => {
    const len = (d.v / total) * C;
    const arc = { ...d, dash: `${len} ${C - len}`, off: -acc, pct: Math.round((d.v / total) * 100) };
    acc += len;
    return arc;
  });

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="font-serif text-base font-semibold text-text mb-3">Cinsiyet dağılımı</h2>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0" role="img" aria-label="Cinsiyet dağılımı">
          <g transform="rotate(-90 50 50)">
            {arcs.length === 1 ? (
              <circle cx="50" cy="50" r={rMid} fill="none" stroke={genderTone(arcs[0].g).css} strokeWidth={sw} />
            ) : (
              arcs.map((a) => (
                <circle
                  key={a.g}
                  cx="50"
                  cy="50"
                  r={rMid}
                  fill="none"
                  stroke={genderTone(a.g).css}
                  strokeWidth={sw}
                  strokeDasharray={a.dash}
                  strokeDashoffset={a.off}
                  className="cursor-pointer transition-[stroke-width] hover:[stroke-width:18]"
                  onClick={() => onPick(a.g, a.label)}
                >
                  <title>{`${a.label}: ${a.v}`}</title>
                </circle>
              ))
            )}
          </g>
          <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight={700} fill="var(--text)">
            {total}
          </text>
        </svg>
        <ul className="flex-1 min-w-0 space-y-1.5">
          {arcs.map((a) => (
            <li key={a.g}>
              <button
                type="button"
                onClick={() => onPick(a.g, a.label)}
                className="w-full flex items-center gap-2.5 text-left rounded-lg px-1.5 py-1 hover:bg-surface-2 transition-colors"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: genderTone(a.g).css }} aria-hidden />
                <span className="text-sm text-text flex-1 min-w-0 truncate">{a.label}</span>
                <span className="text-xs text-text-muted tabular-nums shrink-0">
                  {a.v} · %{a.pct}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Bir kişiyi seç, herkesin ona göre akrabalığını Türkçe adıyla gör.
 * "Hatice'nin halası kim?" gibi soruları, üstteki kutuya "hala" yazıp
 * yanıtlamayı sağlar.
 */
function RelativesFinder({
  people,
  idx,
  onSelect,
}: {
  people: Person[];
  idx: ReturnType<typeof indexPeople>;
  onSelect: (id: string) => void;
}) {
  const [personId, setPersonId] = useState("");
  const [filter, setFilter] = useState("");
  const { view } = usePrivacy();
  const t = useT();

  const sorted = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...people].sort(
      (x, y) => coll.compare(x.firstName, y.firstName) || coll.compare(x.lastName, y.lastName)
    );
  }, [people]);

  const relatives = useMemo(() => {
    if (!personId) return [];
    const out: Array<{ person: Person; relation: string; dist: number }> = [];
    for (const other of people) {
      if (other.id === personId) continue;
      const path = findRelationPath(personId, other.id, people, idx);
      if (!path) continue;
      const rel = describeRelation(personId, other.id, people, idx);
      if (rel) out.push({ person: other, relation: rel, dist: path.length });
    }
    // En yakın (en kısa yol) en üstte; eşitlikte akrabalık adı, sonra isim
    const coll = new Intl.Collator("tr");
    return out.sort(
      (a, b) =>
        a.dist - b.dist ||
        coll.compare(a.relation, b.relation) ||
        coll.compare(a.person.firstName, b.person.firstName)
    );
  }, [personId, people, idx]);

  const shown = useMemo(() => {
    const q = filter.toLocaleLowerCase("tr").trim();
    const list = q
      ? relatives.filter(
          (r) =>
            r.relation.toLocaleLowerCase("tr").includes(q) ||
            fullName(r.person).toLocaleLowerCase("tr").includes(q)
        )
      : relatives;
    return list.slice(0, 60);
  }, [relatives, filter]);

  const selectCls =
    "w-full h-9 px-2.5 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary cursor-pointer";

  return (
    <div className="space-y-3">
      <select value={personId} onChange={(e) => setPersonId(e.target.value)} className={selectCls} aria-label={t("common.choosePersonAria")}>
        <option value="">{t("common.choosePerson")}</option>
        {sorted.map((p) => {
          const mp = view(p);
          return (
            <option key={p.id} value={p.id}>
              {fullName(p)}
              {mp.birthDate ? ` · ${mp.birthDate.slice(0, 4)}` : ""}
            </option>
          );
        })}
      </select>

      {personId && (
        <>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("panel.rf.filterPlaceholder")}
            className="w-full h-9 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-primary"
          />
          <p className="text-[11px] text-text-subtle">{t("panel.rf.found", { count: relatives.length })}</p>
          <ul className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5">
            {shown.map(({ person, relation }) => (
              <li key={person.id}>
                <button
                  onClick={() => onSelect(person.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 -mx-1 rounded-lg hover:bg-surface-2 transition-colors text-left"
                >
                  <Avatar person={person} size="xs" />
                  <span className="text-sm text-text truncate flex-1 min-w-0">{fullName(person)}</span>
                  <span className="text-[11px] font-medium text-primary shrink-0">{relation}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="text-sm text-text-subtle py-2 text-center">{t("panel.rf.noMatch")}</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

const pickerSelectCls =
  "w-full h-9 px-2.5 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary cursor-pointer";

function PersonPicker({
  people,
  value,
  onChange,
}: {
  people: Person[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { view } = usePrivacy();
  const t = useT();
  const sorted = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...people].sort(
      (x, y) => coll.compare(x.firstName, y.firstName) || coll.compare(x.lastName, y.lastName)
    );
  }, [people]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={pickerSelectCls} aria-label={t("common.choosePersonAria")}>
      <option value="">{t("common.choosePerson")}</option>
      {sorted.map((p) => {
        const mp = view(p);
        return (
          <option key={p.id} value={p.id}>
            {fullName(p)}
            {mp.birthDate ? ` · ${mp.birthDate.slice(0, 4)}` : ""}
          </option>
        );
      })}
    </select>
  );
}

function ResultRow({
  person,
  badge,
  onSelect,
}: {
  person: Person;
  badge: string;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        onClick={() => onSelect(person.id)}
        className="w-full flex items-center gap-2.5 px-2 py-1.5 -mx-1 rounded-lg hover:bg-surface-2 transition-colors text-left"
      >
        <Avatar person={person} size="xs" />
        <span className="text-sm text-text truncate flex-1 min-w-0">{fullName(person)}</span>
        <span className="text-[11px] font-medium text-primary shrink-0">{badge}</span>
      </button>
    </li>
  );
}

/**
 * Bir kişiyi ve bir kuşak numarasını seç, o kişiden tam N kuşak uzaktaki
 * herkesi (yukarı atalar ve aşağı torunlar) tek listede gör.
 */
function GenerationViewer({
  people,
  idx,
  onSelect,
}: {
  people: Person[];
  idx: ReturnType<typeof indexPeople>;
  onSelect: (id: string) => void;
}) {
  const [personId, setPersonId] = useState("");
  const [gen, setGen] = useState(1);
  const t = useT();

  const { up, down, gens, genCounts } = useMemo(() => {
    if (!personId) return { up: new Map<string, number>(), down: new Map<string, number>(), gens: [] as number[], genCounts: new Map<number, number>() };
    const up = ancestorDepths(personId, idx);
    const down = descendantDepths(personId, people);
    const set = new Set<number>([0]);
    // Her kuşaktaki kişi sayısı (0. kuşak = kişinin kendisi)
    const genCounts = new Map<number, number>([[0, 1]]);
    for (const d of up.values()) { set.add(d); genCounts.set(d, (genCounts.get(d) ?? 0) + 1); }
    for (const d of down.values()) { set.add(d); genCounts.set(d, (genCounts.get(d) ?? 0) + 1); }
    return { up, down, gens: [...set].sort((a, b) => a - b), genCounts };
  }, [personId, people, idx]);

  const results = useMemo(() => {
    if (!personId) return [];
    const out: Array<{ person: Person; badge: string }> = [];
    if (gen === 0) {
      const self = idx.get(personId);
      if (self) out.push({ person: self, badge: t("panel.gv.self") });
      return out;
    }
    for (const [id, d] of up) if (d === gen) {
      const p = idx.get(id);
      if (p) out.push({ person: p, badge: `↑ ${describeRelation(personId, id, people, idx) ?? t("panel.gv.ancestor")}` });
    }
    for (const [id, d] of down) if (d === gen) {
      const p = idx.get(id);
      if (p) out.push({ person: p, badge: `↓ ${describeRelation(personId, id, people, idx) ?? t("panel.gv.descendant")}` });
    }
    const coll = new Intl.Collator("tr");
    return out.sort((a, b) => coll.compare(a.person.firstName, b.person.firstName));
  }, [personId, gen, up, down, people, idx, t]);

  return (
    <div className="space-y-3">
      <PersonPicker people={people} value={personId} onChange={(id) => { setPersonId(id); setGen(1); }} />
      {personId && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted shrink-0" htmlFor="gen-sec">{t("panel.gv.genLabel")}</label>
            <select
              id="gen-sec"
              value={gen}
              onChange={(e) => setGen(Number(e.target.value))}
              className={pickerSelectCls}
            >
              {gens.map((g) => (
                <option key={g} value={g}>
                  {t("panel.gv.genOption", { g })}{g === 0 ? ` ${t("panel.gv.selfParen")}` : ""} ({genCounts.get(g) ?? 0})
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-text-subtle">{t("common.peopleCount", { count: results.length })}</p>
          <ul className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5">
            {results.map((r) => (
              <ResultRow key={r.person.id} person={r.person} badge={r.badge} onSelect={onSelect} />
            ))}
            {results.length === 0 && (
              <li className="text-sm text-text-subtle py-2 text-center">{t("panel.gv.noneInGen")}</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * Bir kişiyi ve bir kuşak sayısı N seç; akrabaları kuşak-uzaklığına göre
 * AYRI SÜTUNLAR (alanlar) hâlinde gör: 0. alan kişinin kendisi, 1. alan 1
 * kuşak uzaktakiler, … N. alana kadar. Her alan başlığında o kuşaktaki kişi
 * sayısı parantez içinde yazılır ("2. kuşak (5)").
 */
function GenerationSpread({
  people,
  idx,
  onSelect,
}: {
  people: Person[];
  idx: ReturnType<typeof indexPeople>;
  onSelect: (id: string) => void;
}) {
  const [personId, setPersonId] = useState("");
  const [gen, setGen] = useState(2);
  const { view, hideLiving } = usePrivacy();
  const t = useT();

  // Kuşak uzaklığına göre gruplanmış akrabalar (0 = kişinin kendisi)
  const groups = useMemo(() => {
    if (!personId) return new Map<number, Person[]>();
    return relativesByGeneration(personId, people, idx);
  }, [personId, people, idx]);

  const maxGen = useMemo(() => {
    let m = 0;
    for (const k of groups.keys()) if (k > m) m = k;
    return m;
  }, [groups]);

  const effGen = Math.min(gen, Math.max(maxGen, 1));

  // 0. alandan effGen. alana kadar; her alan o kuşaktaki (tr'ye göre sıralı) kişiler
  const fields = useMemo(() => {
    const coll = new Intl.Collator("tr");
    const out: Array<{ depth: number; people: Person[] }> = [];
    for (let k = 0; k <= effGen; k++) {
      const list = [...(groups.get(k) ?? [])].sort((a, b) => coll.compare(a.firstName, b.firstName));
      out.push({ depth: k, people: list });
    }
    return out;
  }, [groups, effGen]);

  return (
    <div className="space-y-3">
      <PersonPicker people={people} value={personId} onChange={(id) => { setPersonId(id); setGen(2); }} />
      {personId && maxGen === 0 && (
        <p className="text-sm text-text-subtle py-2 text-center">{t("panel.gs.onlySelf")}</p>
      )}
      {personId && maxGen > 0 && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted shrink-0" htmlFor="gs-sec">{t("panel.gs.genLabel")}</label>
            <select
              id="gs-sec"
              value={effGen}
              onChange={(e) => setGen(Number(e.target.value))}
              className={pickerSelectCls}
            >
              {Array.from({ length: maxGen }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>{t("panel.gv.genOption", { g })}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {fields.map((f) => (
              <div key={f.depth} className="shrink-0 w-44 rounded-xl bg-surface-2 border border-border p-2.5">
                <h3 className="text-xs font-semibold text-text mb-2 leading-tight">
                  {f.depth === 0 ? t("panel.gv.self") : t("panel.gv.genOption", { g: f.depth })}{" "}
                  <span className="text-text-subtle tabular-nums">({f.people.length})</span>
                </h3>
                <ul className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5">
                  {f.people.map((rawP) => {
                    const p = view(rawP);
                    const masked = isMasked(rawP, hideLiving);
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => onSelect(p.id)}
                          className="w-full flex items-center gap-2 px-1.5 py-1.5 -mx-1 rounded-lg hover:bg-surface transition-colors text-left"
                        >
                          <Avatar person={p} size="xs" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-text truncate leading-tight">{fullName(p)}</span>
                            <span className="block text-[11px] text-text-subtle truncate leading-tight">
                              {masked ? t("common.living") : lifeSpan(p.birthDate, p.deathDate) || (p.birthPlace ?? "")}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {f.people.length === 0 && (
                    <li className="text-[11px] text-text-subtle py-1 text-center">{t("panel.gs.none")}</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Bir kişiyi ve bir yakınlık derecesini seç, o kişiye tam N. dereceden kan
 * hısımı olan herkesi gör (1° anne/çocuk, 2° kardeş/dede/torun, 4° birinci
 * kuzen…).
 */
function DegreeViewer({
  people,
  idx,
  onSelect,
}: {
  people: Person[];
  idx: ReturnType<typeof indexPeople>;
  onSelect: (id: string) => void;
}) {
  const [personId, setPersonId] = useState("");
  const [degree, setDegree] = useState(1);
  const t = useT();

  const { degrees, dist } = useMemo(() => {
    if (!personId) return { degrees: [] as number[], dist: new Map<string, number>() };
    const dist = bloodDegrees(personId, people, idx);
    const set = new Set<number>();
    for (const d of dist.values()) if (d > 0) set.add(d);
    return { degrees: [...set].sort((a, b) => a - b), dist };
  }, [personId, people, idx]);

  const results = useMemo(() => {
    if (!personId) return [];
    const out: Array<{ person: Person; badge: string }> = [];
    for (const [id, d] of dist) if (d === degree) {
      const p = idx.get(id);
      if (p) out.push({ person: p, badge: describeRelation(personId, id, people, idx) ?? `${d}°` });
    }
    const coll = new Intl.Collator("tr");
    return out.sort((a, b) => coll.compare(a.person.firstName, b.person.firstName));
  }, [personId, degree, dist, people, idx]);

  return (
    <div className="space-y-3">
      <PersonPicker people={people} value={personId} onChange={(id) => { setPersonId(id); setDegree(1); }} />
      {personId && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted shrink-0" htmlFor="deg-sec">{t("panel.dv.degLabel")}</label>
            <select
              id="deg-sec"
              value={degree}
              onChange={(e) => setDegree(Number(e.target.value))}
              className={pickerSelectCls}
            >
              {degrees.map((d) => (
                <option key={d} value={d}>{t("panel.dv.degOption", { d })}</option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-text-subtle">{t("panel.dv.count", { count: results.length })}</p>
          <ul className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5">
            {results.map((r) => (
              <ResultRow key={r.person.id} person={r.person} badge={r.badge} onSelect={onSelect} />
            ))}
            {results.length === 0 && (
              <li className="text-sm text-text-subtle py-2 text-center">{t("panel.dv.noneAtDegree")}</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function Card({
  title,
  hint,
  empty,
  className,
  children,
}: {
  title: string;
  hint?: string;
  empty?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-4 sm:p-5${className ? ` ${className}` : ""}`}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-serif text-base font-semibold text-text">{title}</h2>
        {hint && <span className="text-[11px] text-text-subtle shrink-0">{hint}</span>}
      </div>
      {empty ? <p className="text-sm text-text-subtle py-2">{empty}</p> : children}
    </section>
  );
}

function RelationCalculator({
  people,
  idx,
  onSelect,
}: {
  people: Person[];
  idx: ReturnType<typeof indexPeople>;
  onSelect: (id: string) => void;
}) {
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const t = useT();

  const sorted = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...people].sort(
      (x, y) => coll.compare(x.firstName, y.firstName) || coll.compare(x.lastName, y.lastName)
    );
  }, [people]);

  const result = useMemo(() => {
    if (!aId || !bId || aId === bId) return null;
    return describeRelation(aId, bId, people, idx);
  }, [aId, bId, people, idx]);

  const a = aId ? idx.get(aId) : undefined;
  const b = bId ? idx.get(bId) : undefined;

  const selectCls =
    "w-full h-9 px-2.5 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary cursor-pointer";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <select value={aId} onChange={(e) => setAId(e.target.value)} className={selectCls} aria-label={t("panel.rc.firstAria")}>
          <option value="">{t("common.choosePerson")}</option>
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)}
            </option>
          ))}
        </select>
        <select value={bId} onChange={(e) => setBId(e.target.value)} className={selectCls} aria-label={t("panel.rc.secondAria")}>
          <option value="">{t("common.choosePerson")}</option>
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)}
            </option>
          ))}
        </select>
      </div>

      {a && b && (
        <div className="p-3.5 rounded-xl bg-primary-soft text-center">
          {result ? (
            <p className="text-sm text-text leading-relaxed">
              <button onClick={() => onSelect(b.id)} className="font-semibold hover:underline">
                {fullName(b)}
              </button>
              {" — "}
              <button onClick={() => onSelect(a.id)} className="font-semibold hover:underline">
                {genitive(a.firstName)}
              </button>{" "}
              <span className="font-semibold text-primary">
                {possessive(result.toLocaleLowerCase("tr"))}
              </span>
              .
            </p>
          ) : (
            <p className="text-sm text-text-muted">
              {t("panel.rc.noBond")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
