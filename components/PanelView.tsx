"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
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
} from "@/lib/relations";
import { fullName } from "@/lib/name";
import { usePrivacy } from "./PrivacyContext";
import { useReadOnly } from "./ReadOnlyContext";
import { isMasked } from "@/lib/privacy";

interface Props {
  people: Person[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onImportExport: () => void;
}

export default function PanelView({ people, onSelect, onAdd, onImportExport }: Props) {
  const { view, hideLiving } = usePrivacy();
  const { readOnly } = useReadOnly();
  const stats = useMemo(() => computeStats(people), [people]);
  const idx = useMemo(() => indexPeople(people), [people]);

  // 🎂 Doğum günleri · 💍 evlilik yıldönümleri · 🕯️ anma günleri — tek liste.
  // Yıldönümleri, gizlilik için maskeli kopyadan türetilir: gizli yaşayan bir
  // kişinin evlilik tarihi (maskeli kopyada `events` yok) sızmaz.
  const upcoming = useMemo(() => {
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
        if (days !== null && days <= 60) {
          out.push({ key: `b-${p.id}`, kind: "birthday", rawPerson: p, days, icon: "🎂", label: "" });
        }
      }

      // 🕯️ Anma günü — vefat edenler. Gizli (confidential) kayıtlar hariç.
      if (p.deathDate && !isMasked(p, hideLiving)) {
        const days = daysUntilAnniversary(p.deathDate);
        if (days !== null && days <= 60) {
          const years = occYearOf(days) - Number(p.deathDate.slice(0, 4));
          out.push({
            key: `m-${p.id}`,
            kind: "memorial",
            rawPerson: p,
            days,
            icon: "🕯️",
            label: years >= 1 ? `${years}. yıl anması` : "Ölüm yıldönümü",
          });
        }
      }

      // 💍 Evlilik yıldönümü — maskeli kopyadan okunur (gizli tarih sızmaz).
      const events = view(p).events;
      if (events) {
        for (const ev of events) {
          if (ev.type !== "evlilik" || !ev.date) continue;
          const days = daysUntilAnniversary(ev.date);
          if (days === null || days > 60) continue;
          const years = occYearOf(days) - Number(ev.date.slice(0, 4));
          out.push({
            key: `a-${p.id}-${ev.id}`,
            kind: "anniversary",
            rawPerson: p,
            days,
            icon: "💍",
            label: years >= 1 ? `${years}. evlilik yıldönümü` : "Evlilik yıldönümü",
          });
        }
      }
    }

    return out.sort((a, b) => a.days - b.days).slice(0, 8);
  }, [people, view, hideLiving]);

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

  if (people.length === 0) {
    return (
      <div className="h-full grid place-items-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-3">🌱</p>
          <h2 className="font-serif text-xl font-semibold text-text mb-1.5">Panel boş</h2>
          <p className="text-sm text-text-muted mb-5">
            İlk kişiyi ekleyince burada ailenin özeti, doğum günleri ve akrabalık
            araçları belirecek.
          </p>
          {!readOnly && <Button onClick={onAdd}>İlk kişiyi ekle</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* İstatistikler */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value={stats.total} label="Kişi" tone="primary" />
          <Stat value={stats.generations} label="Kuşak" tone="accent" />
          <Stat value={stats.living} label="Yaşayan" tone="male" />
          <Stat value={stats.deceased} label="Vefat eden" tone="neutral" />
        </section>

        {/* Rakamlarla aile — genişletilmiş istatistikler */}
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-serif text-base font-semibold text-text">Rakamlarla aile</h2>
            <span className="text-[11px] text-text-subtle shrink-0">özet</span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
            <MiniStat label="Kadın" value={stats.female} />
            <MiniStat label="Erkek" value={stats.male} />
            <MiniStat label="Evlilik" value={stats.marriages} />
            <MiniStat label="Boşanma" value={stats.divorces} />
            {stats.avgLifespan !== undefined && (
              <MiniStat label="Ortalama ömür" value={`${stats.avgLifespan} yıl`} />
            )}
            {stats.oldestLivingAge !== undefined && (
              <MiniStat label="En yaşlı yaşayan" value={`${stats.oldestLivingAge} yaş`} />
            )}
            {stats.oldestBirthYear !== undefined && (
              <MiniStat label="En eski doğum" value={stats.oldestBirthYear} />
            )}
            <MiniStat label="En kalabalık kardeş" value={stats.largestSibship} />
            {stats.topBirthPlace && (
              <MiniStat label="En sık doğum yeri" value={`${stats.topBirthPlace.name} (${stats.topBirthPlace.count})`} wide />
            )}
            {stats.unlinked > 0 && <MiniStat label="Bağsız kişi" value={stats.unlinked} />}
          </dl>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Kişinin akrabaları — "Hatice'nin halası kim?" */}
          <Card title="Kişinin akrabaları" hint="Örn. birinin halası kim?">
            <RelativesFinder people={people} idx={idx} onSelect={onSelect} />
          </Card>

          {/* Kuşak görüntüleyici */}
          <Card title="Kuşak görüntüleyici" hint="N. kuşaktaki herkes">
            <GenerationViewer people={people} idx={idx} onSelect={onSelect} />
          </Card>

          {/* Yakınlık derecesi */}
          <Card title="Yakınlık derecesi" hint="1° · 2° · 10°…">
            <DegreeViewer people={people} idx={idx} onSelect={onSelect} />
          </Card>

          {/* Yaklaşan olaylar — doğum günü 🎂 · evlilik yıldönümü 💍 · anma 🕯️ */}
          <Card
            title="Yaklaşan olaylar"
            hint="Önümüzdeki 60 gün"
            empty={upcoming.length === 0 ? "Bu dönemde yaklaşan olay yok" : undefined}
          >
            <ul className="space-y-1">
              {upcoming.map((ev) => {
                const person = view(ev.rawPerson);
                const masked = isMasked(ev.rawPerson, hideLiving);
                let subtext: React.ReactNode = null;
                if (ev.kind === "birthday") {
                  const age = calcAge(ev.rawPerson.birthDate);
                  subtext = masked ? (
                    <p className="text-[11px] text-text-subtle leading-tight">🔒 Yaşayan</p>
                  ) : age !== null ? (
                    <p className="text-[11px] text-text-subtle leading-tight">
                      🎂 {age + (ev.days === 0 ? 0 : 1)} yaşına giriyor
                    </p>
                  ) : (
                    <p className="text-[11px] text-text-subtle leading-tight">🎂 Doğum günü</p>
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
          <Card title="Akrabalık hesaplayıcı" hint="İki kişi nasıl akraba?">
            <RelationCalculator people={people} idx={idx} onSelect={onSelect} />
          </Card>

          {/* En eski kuşak */}
          <Card title="En eski kayıtlar" empty={eldest.length === 0 ? "Tarihli kayıt yok" : undefined}>
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
                        {masked ? "🔒 Yaşayan" : lifeSpan(p.birthDate, p.deathDate)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* En yeni kayıtlar */}
          <Card title="En yeni kayıtlar" hint="Doğuma göre" empty={newest.length === 0 ? "Tarihli kayıt yok" : undefined}>
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
                        {masked ? "🔒 Yaşayan" : lifeSpan(p.birthDate, p.deathDate)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Soyadları + uyarılar */}
          <Card title="Aileler" hint="Soyada göre">
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
                  <span className="font-semibold">{stats.unlinked} kişinin</span> hiçbir
                  aile bağı yok. Ağaç görünümünde kartın kenarındaki{" "}
                  <span className="font-semibold">+</span> düğmeleriyle ebeveyn, eş veya
                  çocuk ekleyebilirsin.
                </p>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="secondary" onClick={onImportExport}>
                GEDCOM aktar / al
              </Button>
              {!readOnly && (
                <Button size="sm" variant="secondary" onClick={onAdd}>
                  Kişi ekle
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
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
}: {
  value: number;
  label: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className={`rounded-2xl p-4 ${TONES[tone]}`}>
      <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
      <p className="text-xs mt-1.5 opacity-80">{label}</p>
    </div>
  );
}

function MiniStat({ label, value, wide }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] text-text-subtle leading-tight">{label}</dt>
      <dd className="text-lg font-semibold text-text tabular-nums leading-tight truncate">{value}</dd>
    </div>
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
      <select value={personId} onChange={(e) => setPersonId(e.target.value)} className={selectCls} aria-label="Kişi seç">
        <option value="">Kişi seç…</option>
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
            placeholder="Akrabalık ya da isim süz — örn. hala, dayı…"
            className="w-full h-9 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-primary"
          />
          <p className="text-[11px] text-text-subtle">{relatives.length} akraba bulundu</p>
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
              <li className="text-sm text-text-subtle py-2 text-center">Eşleşen akraba yok</li>
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
  const sorted = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...people].sort(
      (x, y) => coll.compare(x.firstName, y.firstName) || coll.compare(x.lastName, y.lastName)
    );
  }, [people]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={pickerSelectCls} aria-label="Kişi seç">
      <option value="">Kişi seç…</option>
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

  const { up, down, gens } = useMemo(() => {
    if (!personId) return { up: new Map<string, number>(), down: new Map<string, number>(), gens: [] as number[] };
    const up = ancestorDepths(personId, idx);
    const down = descendantDepths(personId, people);
    const set = new Set<number>([0]);
    for (const d of up.values()) set.add(d);
    for (const d of down.values()) set.add(d);
    return { up, down, gens: [...set].sort((a, b) => a - b) };
  }, [personId, people, idx]);

  const results = useMemo(() => {
    if (!personId) return [];
    const out: Array<{ person: Person; badge: string }> = [];
    if (gen === 0) {
      const self = idx.get(personId);
      if (self) out.push({ person: self, badge: "Kendisi" });
      return out;
    }
    for (const [id, d] of up) if (d === gen) {
      const p = idx.get(id);
      if (p) out.push({ person: p, badge: `↑ ${describeRelation(personId, id, people, idx) ?? "ata"}` });
    }
    for (const [id, d] of down) if (d === gen) {
      const p = idx.get(id);
      if (p) out.push({ person: p, badge: `↓ ${describeRelation(personId, id, people, idx) ?? "torun"}` });
    }
    const coll = new Intl.Collator("tr");
    return out.sort((a, b) => coll.compare(a.person.firstName, b.person.firstName));
  }, [personId, gen, up, down, people, idx]);

  return (
    <div className="space-y-3">
      <PersonPicker people={people} value={personId} onChange={(id) => { setPersonId(id); setGen(1); }} />
      {personId && (
        <>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted shrink-0" htmlFor="gen-sec">Kuşak</label>
            <select
              id="gen-sec"
              value={gen}
              onChange={(e) => setGen(Number(e.target.value))}
              className={pickerSelectCls}
            >
              {gens.map((g) => (
                <option key={g} value={g}>
                  {g}. kuşak{g === 0 ? " (kişinin kendisi)" : ""}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-text-subtle">{results.length} kişi</p>
          <ul className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5">
            {results.map((r) => (
              <ResultRow key={r.person.id} person={r.person} badge={r.badge} onSelect={onSelect} />
            ))}
            {results.length === 0 && (
              <li className="text-sm text-text-subtle py-2 text-center">Bu kuşakta kimse yok</li>
            )}
          </ul>
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
            <label className="text-xs text-text-muted shrink-0" htmlFor="deg-sec">Derece</label>
            <select
              id="deg-sec"
              value={degree}
              onChange={(e) => setDegree(Number(e.target.value))}
              className={pickerSelectCls}
            >
              {degrees.map((d) => (
                <option key={d} value={d}>{d}. derece ({d}°)</option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-text-subtle">{results.length} kişi · yalnızca kan hısımlığı</p>
          <ul className="max-h-72 overflow-y-auto space-y-0.5 pr-0.5">
            {results.map((r) => (
              <ResultRow key={r.person.id} person={r.person} badge={r.badge} onSelect={onSelect} />
            ))}
            {results.length === 0 && (
              <li className="text-sm text-text-subtle py-2 text-center">Bu derecede kimse yok</li>
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
  children,
}: {
  title: string;
  hint?: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
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
        <select value={aId} onChange={(e) => setAId(e.target.value)} className={selectCls} aria-label="Birinci kişi">
          <option value="">Kişi seç…</option>
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)}
            </option>
          ))}
        </select>
        <select value={bId} onChange={(e) => setBId(e.target.value)} className={selectCls} aria-label="İkinci kişi">
          <option value="">Kişi seç…</option>
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
              Bu iki kişi arasında bir bağ bulunamadı.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
