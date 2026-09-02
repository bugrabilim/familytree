"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Gender, Person } from "@/types/family";
import Avatar, { genderTone } from "./ui/Avatar";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import { calcAge, lifeSpan } from "@/lib/date";
import {
  bloodDegrees,
  computeStats,
  describeRelation,
  findRelationPath,
  genitive,
  indexPeople,
  relativesByGeneration,
} from "@/lib/relations";
import { completeness, lineLabelKey, MAX_DEPTH } from "@/lib/completeness";
import { aggregateConditions, traceCondition } from "@/lib/heredity";
import { fullName } from "@/lib/name";
import { isAssociate, isMember } from "@/lib/associates";
import { findDuplicatePairs } from "@/lib/duplicates";
import MergeDialog from "./MergeDialog";
import { usePrivacy } from "./PrivacyContext";
import PersonPicker, { pickerSelectCls } from "./PersonPicker";
import { useReadOnly } from "./ReadOnlyContext";
import { isMasked } from "@/lib/privacy";
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  /** "stats" = İstatistikler (sayı/grafik), "relations" = İlişki hesapla (akrabalık araçları). */
  mode?: "stats" | "relations";
  /** Ağaçta merkezde olan (kök/odak) kişi — İlişki hesapla araçlarında
   *  varsayılan seçili gelir (#6). */
  focusId?: string;
}

export default function PanelView({ people: rawPeople, onSelect, onAdd, mode = "stats", focusId }: Props) {
  const isStats = mode !== "relations";
  const isRelations = mode === "relations";
  const { view, hideLiving } = usePrivacy();
  const { readOnly } = useReadOnly();
  const t = useT();

  // Arkadaş süzgeci: panelin tüm hesapları bu kapsam üzerinden yapılır.
  // "Herkes" (üye + çevre), yalnız üyeler ya da yalnız arkadaşlar (çevre).
  const [scope, setScope] = useState<"all" | "uye" | "cevre">("all");
  const hasAssociates = useMemo(() => rawPeople.some(isAssociate), [rawPeople]);
  const people = useMemo(
    () =>
      scope === "uye" ? rawPeople.filter(isMember)
      : scope === "cevre" ? rawPeople.filter(isAssociate)
      : rawPeople,
    [rawPeople, scope]
  );

  const stats = useMemo(() => computeStats(people), [people]);
  const idx = useMemo(() => indexPeople(people), [people]);

  // Yaklaşan olaylar TAKVİM sayfasına taşındı (bkz. CalendarView).

  const eldest = useMemo(() => {
    return [...people]
      .filter((p) => p.birthDate)
      .sort((a, b) => (a.birthDate ?? "").localeCompare(b.birthDate ?? ""))
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
  // Yeni doğanlar (0–1 yaş, yaşayan). "Çocuklar" alanı kaldırıldı; "En uzun
  // yaşamışlar" artık kendi bileşeninde (LongestLived) hesaplanıyor.
  const newborns = useMemo(
    () => byAge.filter((x) => x.living && x.age <= 1).sort((a, b) => a.age - b.age).slice(0, 8),
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
    // Cinsiyeti belirsiz (seçilmemiş) kayıtlar "Diğer" kovasına katılır (#1).
    const c: Record<Gender, number> = { female: 0, male: 0, other: 0, unknown: 0 };
    for (const p of shown) {
      const g = p.gender === "unknown" ? "other" : p.gender;
      c[g] = (c[g] ?? 0) + 1;
    }
    return c;
  }, [shown]);

  // #1 — Grafik verileri (hepsi maskeli kopyadan; segmentler tıklanınca listeler).
  const charts = useMemo(() => {
    // Medeni durum — her kişi TEK kovaya. Mevcut eşi olan biri, eşlerinden en az
    // biri hayattaysa "evli"; tüm mevcut eşleri vefat etmişse "dul" (#B). Mevcut
    // eşi yok ama eski eşi varsa "boşanmış"; hiçbiri yoksa "bekâr".
    const byId = new Map(shown.map((p) => [p.id, p]));
    const livingSpouse = (p: Person) => (p.spouseIds ?? []).some((id) => !byId.get(id)?.deathDate);
    const deadSpouse = (p: Person) => (p.spouseIds ?? []).some((id) => byId.get(id)?.deathDate);
    const married = shown.filter((p) => (p.spouseIds?.length ?? 0) > 0 && livingSpouse(p));
    const widowed = shown.filter((p) => (p.spouseIds?.length ?? 0) > 0 && !livingSpouse(p) && deadSpouse(p));
    const divorced = shown.filter(
      (p) => (p.spouseIds?.length ?? 0) === 0 && (p.formerSpouseIds?.length ?? 0) > 0
    );
    const single = shown.filter(
      (p) => (p.spouseIds?.length ?? 0) === 0 && (p.formerSpouseIds?.length ?? 0) === 0
    );

    // Ölüm türü — kaza anahtar sözcüğü olanlar "kazaen", geri kalanların
    // hepsi (nedeni kayıtsız olanlar dahil) "doğal" sayılır (#1).
    const ACCIDENTAL = /(kaza|trafik|düş|boğ|yang[ıi]n|yan[ıi]k|cinayet|öldür|vurul|intihar|zehir|elektrik|deprem|sel|savaş|silah|b[ıi]çak|accident|drown|fire|murder|suicide|kill)/i;
    const deceased = shown.filter((p) => p.deathDate);
    const accidental = deceased.filter((p) => p.deathCause?.trim() && ACCIDENTAL.test(p.deathCause));
    const natural = deceased.filter((p) => !(p.deathCause?.trim() && ACCIDENTAL.test(p.deathCause)));

    // Doğum yeri dağılımı — ilk virgül/parantez öncesi ada göre topla, ilk 8.
    const placeMap = new Map<string, Person[]>();
    for (const p of shown) {
      const raw = p.birthPlace?.split(/[,(]/)[0].trim();
      if (!raw) continue;
      const key = raw.toLocaleLowerCase("tr");
      const arr = placeMap.get(key);
      if (arr) arr.push(p);
      else placeMap.set(key, [p]);
    }
    const places = [...placeMap.values()]
      .map((arr) => ({ label: arr[0].birthPlace!.split(/[,(]/)[0].trim(), people: arr }))
      .sort((a, b) => b.people.length - a.people.length)
      .slice(0, 8);

    // Yaşayanların yaş dağılımı — 10'ar yıllık kovalar (0–9 … 90+).
    const living = byAge.filter((x) => x.living);
    const buckets: Array<{ from: number; label: string; people: Person[] }> = [];
    for (let d = 0; d <= 90; d += 10) {
      buckets.push({ from: d, label: d >= 90 ? "90+" : `${d}–${d + 9}`, people: [] });
    }
    for (const x of living) {
      const i = Math.min(9, Math.floor(x.age / 10));
      buckets[i].people.push(x.p);
    }
    // İlk dolu kovadan son dolu kovaya dek (aradaki boş kovalar da görünsün).
    const firstFull = buckets.findIndex((b) => b.people.length > 0);
    const lastFull = buckets.reduce((acc2, b, i) => (b.people.length > 0 ? i : acc2), -1);
    const ageBuckets = firstFull === -1 ? [] : buckets.slice(firstFull, lastFull + 1);

    return {
      living: groups.living,
      deceased,
      married,
      widowed,
      divorced,
      single,
      natural,
      accidental,
      places,
      ageBuckets,
    };
  }, [shown, byAge, groups.living]);

  // Olası kopyalar (aynı kişi iki kez) — düzenleyici birleştirebilir.
  const allDuplicates = useMemo(() => findDuplicatePairs(people), [people]);
  const [mergePair, setMergePair] = useState<{ a: Person; b: Person } | null>(null);

  // "Yoksay" edilen çiftler cihazda (localStorage) tutulur; kullanıcı yanlış ya
  // da bilinçli bir öneriyi kapatabilir, sayfa yenilenince geri gelmez.
  const IGNORE_KEY = "soyagaci_ignored_pairs";
  const pairKey = (aId: string, bId: string) => [aId, bId].sort().join("|");
  const [ignored, setIgnored] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });
  const ignorePair = (aId: string, bId: string) => {
    setIgnored((prev) => {
      const next = new Set(prev).add(pairKey(aId, bId));
      try {
        localStorage.setItem(IGNORE_KEY, JSON.stringify([...next]));
      } catch {
        /* yoksay */
      }
      return next;
    });
  };
  const duplicates = useMemo(
    () => allDuplicates.filter((d) => !ignored.has(pairKey(d.aId, d.bId))),
    [allDuplicates, ignored]
  );

  // Toplu birleştirme — gösterilen (yok sayılmayan) tüm çiftleri tek geçişte
  // birleştir; her çiftte daha eksiksiz kayıt korunur.
  const router = useRouter();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkError, setBulkError] = useState("");
  // #1 — seçerek birleştirme: işaretlenen çiftler.
  const [selPairs, setSelPairs] = useState<Set<string>>(new Set());
  const [selConfirm, setSelConfirm] = useState(false);
  const togglePair = (aId: string, bId: string) =>
    setSelPairs((prev) => {
      const k = pairKey(aId, bId);
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  const doMerge = async (pairs: Array<{ aId: string; bId: string }>) => {
    if (pairs.length === 0) return;
    setBulkBusy(true);
    setBulkError("");
    try {
      const res = await fetch("/api/family/merge-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pairs }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? t("merge.failed"));
      setBulkConfirm(false);
      setSelConfirm(false);
      setSelPairs(new Set());
      router.refresh();
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };
  const mergeAll = () => doMerge(duplicates.map((d) => ({ aId: d.aId, bId: d.bId })));
  const mergeSelected = () =>
    doMerge(
      duplicates.filter((d) => selPairs.has(pairKey(d.aId, d.bId))).map((d) => ({ aId: d.aId, bId: d.bId }))
    );

  // #1 — bir rakama basınca ilgili kişileri listeleyen alt pencere.
  const [drill, setDrill] = useState<{ title: string; list: Person[] } | null>(null);
  const openDrill = (title: string, list: Person[]) => {
    if (list.length) setDrill({ title, list });
  };

  if (rawPeople.length === 0) {
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
        {/* Özet başlığı + yazdır (Madde 12) */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-serif text-lg font-semibold text-text">{isRelations ? t("panel.relationsTitle") : t("panel.overviewTitle")}</h1>
          {/* Arkadaş süzgeci — yalnız ağaçta çevre kişisi varsa göster */}
          {hasAssociates && (
            <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs no-print" role="group" aria-label={t("panel.scope.aria")}>
              {([
                { k: "all", l: t("panel.scope.all") },
                { k: "uye", l: t("panel.scope.members") },
                { k: "cevre", l: t("panel.scope.friends") },
              ] as const).map((o) => (
                <button
                  key={o.k}
                  onClick={() => setScope(o.k)}
                  aria-pressed={scope === o.k}
                  className={`px-3 py-1.5 transition-colors ${
                    scope === o.k
                      ? (o.k === "cevre" ? "bg-accent text-white" : "bg-primary text-primary-text")
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          )}
          {/* "Yazdır" düğmesi sayfadan kaldırıldı; yazdırma yalnız üst bardaki
              ⋮ menüsünden yapılır (kullanıcı isteği). */}
        </div>

        {/* İstatistikler — rakamlar tıklanabilir (ilgili kişileri listeler) */}
        {isStats && (
        <>
        {/* Rakamlarla aile — özet istatistikler. Eski üstteki kişi/kuşak/
            yaşayan/vefat satırı kaldırıldı; toplam kişi ve kuşak buraya alındı (#1). */}
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="font-serif text-base font-semibold text-text">{t("panel.numbers")}</h2>
            <span className="text-[11px] text-text-subtle shrink-0">{t("panel.summary")}</span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
            <MiniStat label={t("panel.stats.people")} value={stats.total}
              onClick={() => openDrill(t("panel.stats.people"), shown)} />
            <MiniStat label={t("panel.stats.generations")} value={stats.generations} />
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
            {/* #8 — sağlık / yönelim / evlilik desenleri (yalnız veri varsa; tıklanır) */}
            {groups.congenital.length > 0 && (
              <MiniStat label={t("panel.mini.congenital")} value={groups.congenital.length}
                onClick={() => openDrill(t("panel.drill.congenital"), groups.congenital)} />
            )}
            {groups.acquired.length > 0 && (
              <MiniStat label={t("panel.mini.acquired")} value={groups.acquired.length}
                onClick={() => openDrill(t("panel.drill.acquired"), groups.acquired)} />
            )}
            {groups.deathCause.length > 0 && (
              <MiniStat label={t("panel.mini.deathCause")} value={groups.deathCause.length}
                onClick={() => openDrill(t("panel.drill.deathCause"), groups.deathCause)} />
            )}
            {groups.orientation.length > 0 && (
              <MiniStat label={t("panel.mini.orientation")} value={groups.orientation.length}
                onClick={() => openDrill(t("panel.drill.orientation"), groups.orientation)} />
            )}
            {groups.polygamy.length > 0 && (
              <MiniStat label={t("panel.mini.polygamy")} value={groups.polygamy.length}
                onClick={() => openDrill(t("panel.drill.polygamy"), groups.polygamy)} />
            )}
            {groups.multiMarriage.length > 0 && (
              <MiniStat label={t("panel.mini.multiMarriage")} value={groups.multiMarriage.length}
                onClick={() => openDrill(t("panel.drill.multiMarriage"), groups.multiMarriage)} />
            )}
          </dl>
        </section>

        {/* #2 Cinsiyet dağılımı — pasta (donut) grafik + tıklanabilir açıklama */}
        <GenderPie
          counts={genderCounts}
          onPick={(g, label) => openDrill(label, shown.filter((p) => p.gender === g || (g === "other" && p.gender === "unknown")))}
        />

        {/* Grafikler — yaşayan/vefat, medeni durum, engellilik, ölüm türü,
            doğum yeri ve yaşayanların yaş dağılımı (#1). */}
        <section>
          <div className="grid gap-4 sm:grid-cols-2">
            <MiniDonut
              title={t("panel.chart.livingDeceased")}
              segments={[
                { key: "living", label: t("panel.chart.living"), value: charts.living.length, color: "var(--primary)", people: charts.living },
                { key: "deceased", label: t("panel.chart.deceased"), value: charts.deceased.length, color: "var(--neutral)", people: charts.deceased },
              ]}
              onPick={openDrill}
            />
            <MiniDonut
              title={t("panel.chart.marital")}
              segments={[
                { key: "married", label: t("panel.chart.married"), value: charts.married.length, color: "var(--primary)", people: charts.married },
                { key: "widowed", label: t("panel.chart.widowed"), value: charts.widowed.length, color: "var(--accent)", people: charts.widowed },
                { key: "divorced", label: t("panel.chart.divorced"), value: charts.divorced.length, color: "var(--danger)", people: charts.divorced },
                { key: "single", label: t("panel.chart.single"), value: charts.single.length, color: "var(--neutral)", people: charts.single },
              ]}
              onPick={openDrill}
            />
            <MiniDonut
              title={t("panel.chart.deathCause")}
              segments={[
                { key: "natural", label: t("panel.chart.natural"), value: charts.natural.length, color: "var(--primary)", people: charts.natural },
                { key: "accidental", label: t("panel.chart.accidental"), value: charts.accidental.length, color: "var(--danger)", people: charts.accidental },
              ]}
              onPick={openDrill}
            />
            <BarChart
              title={t("panel.chart.disability")}
              bars={[
                { key: "congenital", label: t("panel.chart.congenital"), value: groups.congenital.length, people: groups.congenital },
                { key: "acquired", label: t("panel.chart.acquired"), value: groups.acquired.length, people: groups.acquired },
              ]}
              onPick={openDrill}
            />
            <BarChart
              title={t("panel.chart.location")}
              hint={t("panel.chart.locationHint")}
              bars={charts.places.map((p, i) => ({ key: `${i}`, label: p.label, value: p.people.length, people: p.people }))}
              onPick={openDrill}
            />
            {/* Yaşayanların yaş dağılımı — DİKEY çubuk grafik (#1). */}
            <VBarChart
              title={t("panel.chart.ageDist")}
              hint={t("panel.chart.ageDistHint")}
              bars={charts.ageBuckets.map((b) => ({ key: b.label, label: b.label, value: b.people.length, people: b.people }))}
              onPick={openDrill}
            />

            {/* Yeni doğanlar — doğum yerinin altında (sol sütun). */}
            <Card title={t("panel.card.newborns")} hint={t("panel.card.newbornsHint")} empty={newborns.length === 0 ? t("panel.card.noDated") : undefined}>
              <AgeList rows={newborns} onSelect={onSelect} />
            </Card>
            {/* En uzun yaşamışlar — yaş dağılımının altında (sağ sütun); "yalnız
                yaşayanlar" seçeneği varsayılan AÇIK. */}
            <Card title={t("panel.card.longestLived")} hint={t("panel.card.longestLivedHint")}>
              <LongestLived rows={byAge} onSelect={onSelect} />
            </Card>

            {/* Yaş aralığı — yeni doğanların altında (sol sütun). */}
            <Card title={t("panel.card.ageRange")} hint={t("panel.card.ageRangeHint")}>
              <AgeRangeFinder rows={byAge} onSelect={onSelect} />
            </Card>
            {/* En eski kayıtlar — yaş aralığının yanında (#E). */}
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
          </div>
        </section>
        </>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Tutarlılık uyarıları KİŞİLER sayfasına taşındı (#2). */}

          {/* Olası kopyalar — aynı kişi iki kez girilmiş olabilir (yalnız varsa) */}
          {isStats && duplicates.length > 0 && (
            <Card
              title={t("panel.card.duplicates", { count: duplicates.length })}
              hint={t("panel.card.duplicatesHint")}
              className="lg:col-span-2"
            >
              {!readOnly && duplicates.length > 1 && (
                <div className="mb-2 flex items-center flex-wrap gap-2">
                  {/* Seçilenleri birleştir (işaretli çift varsa) */}
                  {selPairs.size > 0 && (
                    selConfirm ? (
                      <>
                        <span className="text-[11px] text-text-muted">
                          {t("panel.dup.mergeSelConfirm", { count: selPairs.size })}
                        </span>
                        <Button size="sm" onClick={mergeSelected} disabled={bulkBusy}>
                          {bulkBusy ? t("merge.working") : t("panel.dup.mergeAllYes")}
                        </Button>
                        <button onClick={() => setSelConfirm(false)} disabled={bulkBusy} className="text-[11px] text-text-subtle hover:text-text">
                          {t("merge.cancel")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setBulkConfirm(false); setSelConfirm(true); }}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-text text-[11px] font-medium hover:brightness-110 transition-all"
                        >
                          {t("panel.dup.mergeSelected", { count: selPairs.size })}
                        </button>
                        <button onClick={() => setSelPairs(new Set())} className="text-[11px] text-text-subtle hover:text-text">
                          {t("history.clearSelection")}
                        </button>
                      </>
                    )
                  )}
                  {/* Tümünü birleştir */}
                  {selPairs.size === 0 && (
                    bulkConfirm ? (
                      <>
                        <span className="text-[11px] text-text-muted">
                          {t("panel.dup.mergeAllConfirm", { count: duplicates.length })}
                        </span>
                        <Button size="sm" onClick={mergeAll} disabled={bulkBusy}>
                          {bulkBusy ? t("merge.working") : t("panel.dup.mergeAllYes")}
                        </Button>
                        <button onClick={() => setBulkConfirm(false)} disabled={bulkBusy} className="text-[11px] text-text-subtle hover:text-text">
                          {t("merge.cancel")}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setBulkConfirm(true)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/30 bg-primary-soft text-primary text-[11px] font-medium hover:brightness-105 transition-all"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M8 7h8m-8 0L5 4m3 3L5 10m11-3 3-3m-3 3 3 3M6 17h12m0 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {t("panel.dup.mergeAll", { count: duplicates.length })}
                      </button>
                    )
                  )}
                </div>
              )}
              {bulkError && <p className="mb-2 text-[11px] text-danger">{bulkError}</p>}
              <ul className="space-y-1">
                {duplicates.slice(0, 10).map((d, i) => {
                  const a = idx.get(d.aId);
                  const b = idx.get(d.bId);
                  if (!a || !b) return null;
                  return (
                    <li
                      key={`${d.aId}-${d.bId}-${i}`}
                      className={`flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-xl transition-colors ${selPairs.has(pairKey(d.aId, d.bId)) ? "bg-primary-soft/50" : "hover:bg-surface-2"}`}
                    >
                      {!readOnly && (
                        <input
                          type="checkbox"
                          checked={selPairs.has(pairKey(d.aId, d.bId))}
                          onChange={() => togglePair(d.aId, d.bId)}
                          aria-label={t("history.select")}
                          className="shrink-0 accent-[var(--primary)]"
                        />
                      )}
                      <span className="text-sm truncate flex-1 min-w-0">
                        <button onClick={() => onSelect(a.id)} className="text-text hover:text-primary hover:underline">
                          {fullName(view(a))}
                        </button>
                        <span className="text-text-subtle"> · </span>
                        <button onClick={() => onSelect(b.id)} className="text-text hover:text-primary hover:underline">
                          {fullName(view(b))}
                        </button>
                      </span>
                      <span className="text-[11px] text-text-subtle shrink-0">{t(`panel.dup.${d.reason}`)}</span>
                      {!readOnly && (
                        <>
                          <button
                            onClick={() => setMergePair({ a, b })}
                            className="text-[11px] font-medium text-primary hover:underline shrink-0"
                          >
                            {t("panel.dup.merge")}
                          </button>
                          <button
                            onClick={() => ignorePair(d.aId, d.bId)}
                            className="text-[11px] text-text-subtle hover:text-text shrink-0"
                          >
                            {t("panel.dup.ignore")}
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
                {duplicates.length > 10 && (
                  <li className="px-2 pt-1 text-[11px] text-text-subtle">
                    {t("panel.card.issuesMore", { count: duplicates.length - 10 })}
                  </li>
                )}
              </ul>
            </Card>
          )}

          {/* Kalıtsal örüntü — yalnız kayıtlı sağlık bilgisi varsa */}
          {isStats && (
            <Card
              title={t("panel.card.heredity")}
              hint={t("panel.card.heredityHint")}
              className="lg:col-span-2"
            >
              <HeredityView shown={shown} onSelect={onSelect} />
            </Card>
          )}

          {/* İlişki hesapla araçları (yalnız "İlişki hesapla" görünümü) */}
          {isRelations && (
            <>
              {/* Üstte yan yana: kişinin akrabaları + yakınlık derecesi (#G). */}
              {/* Kişinin akrabaları — "Hatice'nin halası kim?" */}
              <Card title={t("panel.card.relatives")} hint={t("panel.card.relativesHint")}>
                <RelativesFinder people={people} idx={idx} onSelect={onSelect} defaultPersonId={focusId} />
              </Card>

              {/* Yakınlık derecesi — görsel (halka) (#G/#H) */}
              <Card title={t("panel.card.degree")} hint={t("panel.card.degreeHint")}>
                <DegreeViewer people={people} idx={idx} onSelect={onSelect} defaultPersonId={focusId} />
              </Card>

              {/* Yedi Göbek — kaç göbek biliniyor, hangi hat zayıf, ne eksik */}
              <Card
                title={t("panel.card.sevenGen")}
                hint={t("panel.card.sevenGenHint")}
                className="lg:col-span-2"
              >
                <SevenGenerations people={people} onSelect={onSelect} defaultPersonId={focusId} />
              </Card>

              {/* Kuşak görüntüleyici KALDIRILDI (#2). */}

              {/* Kuşaklara göre akrabalar — kuşak-uzaklığına göre ayrı sütunlar */}
              <Card title={t("panel.card.genSpread")} hint={t("panel.card.genSpreadHint")} className="lg:col-span-2">
                <GenerationSpread people={people} idx={idx} onSelect={onSelect} defaultPersonId={focusId} />
              </Card>

              {/* Akrabalık hesaplayıcı KALDIRILDI (#7). */}
            </>
          )}

          {/* Yaklaşan olaylar TAKVİM sayfasına taşındı (bkz. CalendarView). */}

          {/* "Yaşayan en yaşlılar" ve "Çocuklar" kaldırıldı; En eski kayıtlar,
              Yeni doğanlar, En uzun yaşamışlar ve Yaş aralığı grafiklerin altına
              taşındı. "Aileler" en altta, tam genişlikte kalır (#D/#E/#F). */}

          {/* Soyadları — tam genişlik; soyada tıklanınca o soyadlı kişiler
              listelenir. Çerçeve sağdan sola açılır (RTL). Varsayılan açık (#F). */}
          {isStats && (
          <Card title={t("panel.card.families")} hint={t("panel.card.familiesHint")} className="lg:col-span-2">
            <div dir="rtl" className="flex flex-wrap gap-1.5">
              {stats.surnames.map((s) => (
                <button
                  key={s.name}
                  onClick={() => openDrill(s.name, shown.filter((p) => p.lastName === s.name))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-3 text-xs text-text transition-colors"
                >
                  {s.name}
                  <span className="text-text-subtle tabular-nums">{s.count}</span>
                </button>
              ))}
            </div>
          </Card>
          )}
        </div>
      </div>

      {/* Olası kopyaları birleştir */}
      {mergePair && (
        <MergeDialog a={mergePair.a} b={mergePair.b} onClose={() => setMergePair(null)} />
      )}

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
/** En uzun yaşamışlar — "yalnız yaşayanlar" seçeneği VARSAYILAN AÇIK. Kapalıyken
 *  vefat edenler de dahil olur (yaşamış/yaşayan tüm kişiler arasında en yüksek yaş). */
function LongestLived({
  rows,
  onSelect,
}: {
  rows: Array<{ p: Person; age: number; living: boolean }>;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const [livingOnly, setLivingOnly] = useState(true);
  const shown = useMemo(
    () =>
      [...rows]
        .filter((x) => !livingOnly || x.living)
        .sort((a, b) => b.age - a.age)
        .slice(0, 5),
    [rows, livingOnly]
  );
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] text-text cursor-pointer select-none mb-2 w-fit">
        <input
          type="checkbox"
          checked={livingOnly}
          onChange={(e) => setLivingOnly(e.target.checked)}
          className="accent-[var(--primary)]"
        />
        {t("panel.longest.livingOnly")}
      </label>
      {shown.length === 0 ? (
        <p className="text-sm text-text-subtle py-2">{t("panel.card.noDated")}</p>
      ) : (
        <AgeList rows={shown} onSelect={onSelect} />
      )}
    </div>
  );
}

function AgeList({
  rows,
  onSelect,
}: {
  rows: Array<{ p: Person; age: number; living?: boolean }>;
  onSelect: (id: string) => void;
}) {
  const t = useT();
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
              {living === false ? t("panel.age.lived", { age }) : t("panel.age.old", { age })}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** #4 — Yaş aralığı filtresi. Serbest min/max ve "yalnız yaşayanlar" ile
 *  aralığa giren kişileri listeler (ör. yaşayan 25–35 yaş). */
function AgeRangeFinder({
  rows,
  onSelect,
}: {
  rows: Array<{ p: Person; age: number; living: boolean }>;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const [min, setMin] = useState("25");
  const [max, setMax] = useState("35");
  const [livingOnly, setLivingOnly] = useState(true);

  const matches = useMemo(() => {
    const lo = min.trim() === "" ? 0 : Number(min);
    const hi = max.trim() === "" ? 200 : Number(max);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return [];
    const a = Math.min(lo, hi);
    const b = Math.max(lo, hi);
    return rows
      .filter((r) => (!livingOnly || r.living) && r.age >= a && r.age <= b)
      .sort((x, y) => x.age - y.age)
      .slice(0, 100);
  }, [rows, min, max, livingOnly]);

  const inputCls =
    "w-full h-9 px-2.5 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary";

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <label className="flex-1 min-w-0">
          <span className="block text-[11px] text-text-muted mb-1">{t("panel.ageRange.min")}</span>
          <input type="number" inputMode="numeric" min={0} max={130} value={min}
            onChange={(e) => setMin(e.target.value)} className={inputCls} />
        </label>
        <span className="pb-2 text-text-subtle">–</span>
        <label className="flex-1 min-w-0">
          <span className="block text-[11px] text-text-muted mb-1">{t("panel.ageRange.max")}</span>
          <input type="number" inputMode="numeric" min={0} max={130} value={max}
            onChange={(e) => setMax(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-text cursor-pointer select-none">
        <input type="checkbox" checked={livingOnly} onChange={(e) => setLivingOnly(e.target.checked)}
          className="w-4 h-4 rounded border-border accent-primary" />
        {t("panel.ageRange.livingOnly")}
      </label>
      <p className="text-[11px] text-text-subtle">{t("panel.ageRange.count", { count: matches.length })}</p>
      {matches.length === 0 ? (
        <p className="text-sm text-text-subtle py-2 text-center">{t("panel.ageRange.empty")}</p>
      ) : (
        <div className="max-h-72 overflow-y-auto pr-0.5">
          <AgeList rows={matches} onSelect={onSelect} />
        </div>
      )}
    </div>
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
  const t = useT();
  const LABELS: Record<Gender, string> = {
    female: t("panel.gender.female"),
    male: t("panel.gender.male"),
    other: t("panel.gender.other"),
    // Cinsiyeti hiç seçilmemiş kayıtlar. Bunlar "Diğer"den AYRI bir kovadır;
    // eskiden hiç gösterilmiyordu, bu yüzden "Diğer"i seçen kullanıcı onları
    // bulamıyordu. Artık listelenir ve tıklanınca düzeltilebilirler (#1).
    unknown: t("panel.gender.unset"),
  };
  const data = (["female", "male", "other", "unknown"] as Gender[])
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
      <h2 className="font-serif text-base font-semibold text-text mb-3">{t("panel.pie.title")}</h2>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0" role="img" aria-label={t("panel.pie.title")}>
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

/** #1 — Genel amaçlı donut grafik; segment tıklanınca ilgili kişileri listeler. */
function MiniDonut({
  title,
  segments,
  onPick,
}: {
  title: string;
  segments: Array<{ key: string; label: string; value: number; color: string; people: Person[] }>;
  onPick: (title: string, people: Person[]) => void;
}) {
  const t = useT();
  const data = segments.filter((s) => s.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  const rMid = 34;
  const sw = 16;
  const C = 2 * Math.PI * rMid;
  // Yığılmış ofsetleri (döngüsel) değişken atamadan, önek toplamıyla hesapla.
  const arcs = data.map((d, i) => {
    const len = (d.value / total) * C;
    const off = data.slice(0, i).reduce((s, x) => s + (x.value / total) * C, 0);
    return { ...d, dash: `${len} ${C - len}`, off: -off, pct: Math.round((d.value / total) * 100) };
  });

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h3 className="font-serif text-base font-semibold text-text mb-3">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-text-subtle py-2">{t("panel.chart.empty")}</p>
      ) : (
        <div className="flex items-center gap-5">
          <svg viewBox="0 0 100 100" className="w-24 h-24 shrink-0" role="img" aria-label={title}>
            <g transform="rotate(-90 50 50)">
              {arcs.length === 1 ? (
                <circle cx="50" cy="50" r={rMid} fill="none" stroke={arcs[0].color} strokeWidth={sw} />
              ) : (
                arcs.map((a) => (
                  <circle
                    key={a.key}
                    cx="50"
                    cy="50"
                    r={rMid}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={sw}
                    strokeDasharray={a.dash}
                    strokeDashoffset={a.off}
                    className="cursor-pointer transition-[stroke-width] hover:[stroke-width:18]"
                    onClick={() => onPick(a.label, a.people)}
                  >
                    <title>{`${a.label}: ${a.value}`}</title>
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
              <li key={a.key}>
                <button
                  type="button"
                  onClick={() => onPick(a.label, a.people)}
                  className="w-full flex items-center gap-2.5 text-left rounded-lg px-1.5 py-1 hover:bg-surface-2 transition-colors"
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: a.color }} aria-hidden />
                  <span className="text-sm text-text flex-1 min-w-0 truncate">{a.label}</span>
                  <span className="text-xs text-text-muted tabular-nums shrink-0">
                    {a.value} · %{a.pct}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** #1 — Yatay çubuk grafik; dağılımlar (doğum yeri, yaş) için, tıklanabilir. */
function BarChart({
  title,
  hint,
  bars,
  onPick,
}: {
  title: string;
  hint?: string;
  bars: Array<{ key: string; label: string; value: number; people?: Person[] }>;
  onPick?: (title: string, people: Person[]) => void;
}) {
  const t = useT();
  const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-serif text-base font-semibold text-text">{title}</h3>
        {hint && <span className="text-[11px] text-text-subtle shrink-0">{hint}</span>}
      </div>
      {bars.length === 0 || max === 0 ? (
        <p className="text-sm text-text-subtle py-2">{t("panel.chart.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {bars.map((b) => {
            const pct = Math.round((b.value / max) * 100);
            const clickable = !!onPick && !!b.people && b.people.length > 0;
            const inner = (
              <>
                <span className="w-20 sm:w-28 shrink-0 text-xs text-text truncate">{b.label}</span>
                <span className="flex-1 h-5 rounded-md bg-surface-2 overflow-hidden">
                  <span className="block h-full rounded-md bg-primary" style={{ width: `${Math.max(pct, 4)}%` }} />
                </span>
                <span className="w-8 shrink-0 text-right text-xs text-text-muted tabular-nums">{b.value}</span>
              </>
            );
            return (
              <li key={b.key}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onPick!(b.label, b.people!)}
                    className="w-full flex items-center gap-2.5 text-left rounded-lg px-1 py-0.5 hover:bg-surface-2 transition-colors"
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="flex items-center gap-2.5 px-1 py-0.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** #1 — Dikey çubuk grafik; yaş dağılımı gibi sıralı kovalar için, tıklanabilir. */
function VBarChart({
  title,
  hint,
  bars,
  onPick,
}: {
  title: string;
  hint?: string;
  bars: Array<{ key: string; label: string; value: number; people?: Person[] }>;
  onPick?: (title: string, people: Person[]) => void;
}) {
  const t = useT();
  const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="font-serif text-base font-semibold text-text">{title}</h3>
        {hint && <span className="text-[11px] text-text-subtle shrink-0">{hint}</span>}
      </div>
      {bars.length === 0 || max === 0 ? (
        <p className="text-sm text-text-subtle py-2">{t("panel.chart.empty")}</p>
      ) : (
        // Çubuk alanına SABİT yükseklik (flex-1 yerine) — yüzde yükseklikler
        // ekranda ve yazdırmada aynı, güvenilir hesaplanır (yazdırmada çubuklar
        // kaybolmasın). Kaydırma kutusu yok; kovalar kartı taşmadan sığar.
        <div className="flex items-end gap-1.5">
          {bars.map((b) => {
            const pct = b.value === 0 ? 0 : Math.max(Math.round((b.value / max) * 100), 6);
            const clickable = !!onPick && !!b.people && b.people.length > 0;
            const col = (
              <>
                {/* Değer, çubuğun üstünde */}
                <span className="text-[10px] text-text-muted tabular-nums leading-none mb-1 h-3">
                  {b.value > 0 ? b.value : ""}
                </span>
                {/* Çubuk alanı — sabit 120px; çubuk yüzdesi bunun üzerinden */}
                <span className="w-full flex items-end" style={{ height: 120 }}>
                  <span className="block w-full rounded-t-md bg-primary" style={{ height: `${pct}%` }} />
                </span>
                {/* Kova etiketi (yaş aralığı) */}
                <span className="text-[10px] text-text-subtle leading-none mt-1.5 h-6 flex items-start justify-center text-center">
                  {b.label}
                </span>
              </>
            );
            return clickable ? (
              <button
                key={b.key}
                type="button"
                onClick={() => onPick!(b.label, b.people!)}
                title={`${b.label}: ${b.value}`}
                className="flex-1 min-w-0 flex flex-col items-center rounded-lg hover:bg-surface-2 transition-colors"
              >
                {col}
              </button>
            ) : (
              <div key={b.key} className="flex-1 min-w-0 flex flex-col items-center">
                {col}
              </div>
            );
          })}
        </div>
      )}
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
  defaultPersonId,
}: {
  people: Person[];
  idx: ReturnType<typeof indexPeople>;
  onSelect: (id: string) => void;
  defaultPersonId?: string;
}) {
  const [personId, setPersonId] = useState(defaultPersonId ?? "");
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

/**
 * "Yedi Göbek" tamamlanma ölçeri.
 *
 * Ölçünün amacı bir sayı vermek değil, ZAYIF HATTI göstermek: e-Devlet'in en
 * çok şikâyet edilen tarafı anne tarafının kesilmesi, o yüzden anne ve baba
 * hattı ayrı ayrı puanlanır ve zayıf olan vurgulanır.
 *
 * "5/7 göbek" bir sayıdır; "Ayşe'nin babası eksik" bir iştir — bu yüzden
 * boşluklar tıklanabilir ve doğrudan o kişiyi açar.
 */
function SevenGenerations({
  people,
  onSelect,
  defaultPersonId,
}: {
  people: Person[];
  onSelect: (id: string) => void;
  defaultPersonId?: string;
}) {
  const [personId, setPersonId] = useState(defaultPersonId ?? "");
  const t = useT();

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const result = useMemo(
    () => (personId ? completeness(personId, people) : null),
    [personId, people]
  );

  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? fullName(p) : "";
  };

  // Anne/baba hattı ve aralarında GERÇEK bir fark olup olmadığı.
  // "En zayıf hat" rozeti yalnız fark varsa gösterilir: ölçer beraberlikte de
  // birini seçmek zorunda (bkz. `lib/completeness.ts`), ama ikisi de eşitken
  // rozet göstermek olmayan bir farkı varmış gibi anlatır.
  const mainLines = useMemo(
    () => (result ? result.lines.filter((l) => l.path.length === 1) : []),
    [result]
  );
  const linesDiffer = useMemo(
    () => new Set(mainLines.map((l) => l.known)).size > 1,
    [mainLines]
  );

  return (
    <div className="space-y-4">
      <PersonPicker people={people} value={personId} onChange={setPersonId} />

      {!result ? (
        <p className="text-sm text-text-subtle py-2">{t("sevenGen.empty")}</p>
      ) : (
        <div className="space-y-5">
          {/* Başlık sayısı */}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tabular-nums text-primary">
                  {result.unbrokenDepth}
                </span>
                <span className="text-lg text-text-subtle tabular-nums">/ {MAX_DEPTH}</span>
              </div>
              <p className="text-xs text-text-subtle mt-0.5">{t("sevenGen.unbroken")}</p>
            </div>
            <div className="text-xs text-text-subtle space-y-0.5">
              <p>{t("sevenGen.deepest", { count: result.deepestChain })}</p>
              <p className="tabular-nums">
                {t("sevenGen.ancestors", { known: result.known, total: result.total })}
              </p>
            </div>
          </div>

          {/* Anne / baba hattı — işin asıl noktası */}
          <div className="grid gap-2 sm:grid-cols-2">
            {mainLines
              .map((line) => {
                const weak = linesDiffer && result.weakest?.path === line.path;
                const pct = Math.round((line.known / line.total) * 100);
                const key = lineLabelKey(line.path);
                return (
                  <div
                    key={line.path}
                    className={`rounded-xl border p-3 ${
                      weak ? "border-primary/50 bg-primary/5" : "border-border bg-surface-2"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-text">
                        {key ? t(key) : line.path}
                      </span>
                      <span className="text-xs tabular-nums text-text-subtle">
                        {line.known}/{line.total}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className={weak ? "h-full bg-primary" : "h-full bg-text-subtle/40"}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {weak && (
                      <p className="mt-1.5 text-[11px] text-primary">{t("sevenGen.weakest")}</p>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Göbek göbek */}
          <div className="space-y-1">
            {result.generations.map((g) => (
              <div key={g.generation} className="flex items-center gap-2.5">
                <span className="w-16 shrink-0 text-[11px] text-text-subtle tabular-nums">
                  {t("sevenGen.generation", { count: g.generation })}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full bg-primary/70"
                    style={{ width: `${(g.known / g.total) * 100}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[11px] text-text-subtle tabular-nums">
                  {g.known}/{g.total}
                </span>
              </div>
            ))}
          </div>

          {/* Eksikler — sayıyı işe çeviren kısım */}
          {result.gaps.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-text mb-1.5">{t("sevenGen.gaps")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {result.gaps.map((gap) => (
                  <li key={gap.path}>
                    <button
                      type="button"
                      onClick={() => onSelect(gap.childId)}
                      className="px-2.5 py-1 rounded-lg bg-surface-2 border border-border text-[11px] text-text hover:bg-surface-3 transition-colors"
                    >
                      {t(gap.missing === "father" ? "sevenGen.gapFather" : "sevenGen.gapMother", {
                        name: genitive(nameOf(gap.childId)),
                      })}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-primary">{t("sevenGen.complete")}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Kalıtsal durum örüntüsü.
 *
 * İki kural bu bileşeni belirliyor:
 *
 * 1. **Risk hesaplanmaz.** Ne burada ne `lib/heredity.ts`'te olasılık
 *    matematiği var. "Taşıma ihtimaliniz %25" demek ürünü tıbbi cihaz
 *    mevzuatına sokar. Gösterilen şey yalnız KAYITLI olan: kimde var ve
 *    etkilenenler arasında ebeveyn-çocuk bağı var mı. Bu ayrım kullanıcıya da
 *    yazılı olarak söylenir.
 * 2. **Maskeli veriyle çalışır.** `shown` (yani `people.map(view)`) verilir;
 *    gizlenmiş kişilerin sağlık kaydı toplamaya hiç girmez.
 */
function HeredityView({
  shown,
  onSelect,
}: {
  shown: Person[];
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const [key, setKey] = useState<string | null>(null);

  /*
   * Yalnız EN AZ İKİ kişide kayıtlı durumlar. Tek kişilik bir kayıt örüntü
   * değildir: kartın sorusu "bu ailede ne tekrarlıyor". Tekil kayıtlar zaten
   * yukarıdaki sağlık sayaçlarında ve onların alt listelerinde görünüyor;
   * burada göstermek kartı serbest metin gürültüsüyle dolduruyordu.
   */
  const conditions = useMemo(
    () => aggregateConditions(shown).filter((c) => c.count >= 2),
    [shown]
  );
  const active = key ?? conditions[0]?.key ?? null;
  const trace = useMemo(
    () => (active ? traceCondition(active, shown) : null),
    [active, shown]
  );

  const byId = useMemo(() => new Map(shown.map((p) => [p.id, p])), [shown]);
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? fullName(p) : id;
  };

  if (conditions.length === 0) {
    return <p className="text-sm text-text-subtle py-2">{t("heredity.empty")}</p>;
  }

  const agg = conditions.find((c) => c.key === active);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {conditions.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setKey(c.key)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
              c.key === active
                ? "bg-primary/10 border-primary/50 text-primary"
                : "bg-surface-2 border-border text-text hover:bg-surface-3"
            }`}
          >
            {c.label} <span className="tabular-nums opacity-70">{c.count}</span>
          </button>
        ))}
      </div>

      {trace && agg && (
        <div className="rounded-xl border border-border bg-surface-2 p-3 space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-subtle">
            <span>{t("heredity.affected", { count: trace.affected.length })}</span>
            <span>{t("heredity.generations", { count: trace.generationsSpanned })}</span>
            <span>{t("heredity.links", { count: trace.links.length })}</span>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {agg.congenital > 0 && (
              <span className="text-text-subtle">
                {t("heredity.congenital")}: <span className="text-text tabular-nums">{agg.congenital}</span>
              </span>
            )}
            {agg.acquired > 0 && (
              <span className="text-text-subtle">
                {t("heredity.acquired")}: <span className="text-text tabular-nums">{agg.acquired}</span>
              </span>
            )}
            {agg.fatal > 0 && (
              <span className="text-text-subtle">
                {t("heredity.fatal")}: <span className="text-text tabular-nums">{agg.fatal}</span>
              </span>
            )}
          </div>

          {/* Kalıtımın ağaçta GÖRÜNEN kısmı — iddia değil gözlem */}
          {trace.links.length > 0 ? (
            <div>
              <p className="text-[11px] font-medium text-text mb-1.5">{t("heredity.chains")}</p>
              <ul className="space-y-1">
                {trace.links.map((l) => (
                  <li key={`${l.parentId}-${l.childId}`} className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => onSelect(l.parentId)}
                      className="text-text hover:text-primary transition-colors"
                    >
                      {nameOf(l.parentId)}
                    </button>
                    <span className="text-text-subtle" aria-hidden>→</span>
                    <button
                      type="button"
                      onClick={() => onSelect(l.childId)}
                      className="text-text hover:text-primary transition-colors"
                    >
                      {nameOf(l.childId)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] text-text-subtle">{t("heredity.noChain")}</p>
          )}

          <div>
            <p className="text-[11px] font-medium text-text mb-1.5">{t("heredity.people")}</p>
            <div className="flex flex-wrap gap-1">
              {trace.affected.map((a) => (
                <button
                  key={a.personId}
                  type="button"
                  onClick={() => onSelect(a.personId)}
                  className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-text hover:bg-surface-3 transition-colors"
                >
                  {nameOf(a.personId)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sözleşme kullanıcıya da görünür olmalı */}
      <p className="text-[10px] text-text-subtle">{t("heredity.noRisk")}</p>
    </div>
  );
}

/* ResultRow ve Kuşak görüntüleyici (GenerationViewer) KALDIRILDI (#2/#H). */

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
  defaultPersonId,
}: {
  people: Person[];
  idx: ReturnType<typeof indexPeople>;
  onSelect: (id: string) => void;
  defaultPersonId?: string;
}) {
  const [personId, setPersonId] = useState(defaultPersonId ?? "");
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

  // 0. alandan effGen. alana kadar; her alan o kuşaktaki (tr'ye göre sıralı)
  // kişiler + her kişinin seçilene göre Türkçe akrabalık adı (#2). Ad, kutu
  // içinde farklı renkte gösterilir ("kendisi", "anne", "baba", "kardeş"…).
  const fields = useMemo(() => {
    const coll = new Intl.Collator("tr");
    const out: Array<{ depth: number; people: Array<{ person: Person; relation: string }> }> = [];
    for (let k = 0; k <= effGen; k++) {
      const list = [...(groups.get(k) ?? [])]
        .sort((a, b) => coll.compare(a.firstName, b.firstName))
        .map((person) => ({
          person,
          relation:
            person.id === personId
              ? t("panel.gv.self")
              : describeRelation(personId, person.id, people, idx) ?? "",
        }));
      out.push({ depth: k, people: list });
    }
    return out;
  }, [groups, effGen, personId, people, idx, t]);

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
                  {f.people.map(({ person: rawP, relation }) => {
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
                            {/* Akrabalık adı — farklı renkte (#2). */}
                            {relation && (
                              <span className="block text-[11px] font-medium text-primary truncate leading-tight capitalize">
                                {relation}
                              </span>
                            )}
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
  defaultPersonId,
}: {
  people: Person[];
  idx: ReturnType<typeof indexPeople>;
  onSelect: (id: string) => void;
  defaultPersonId?: string;
}) {
  const [personId, setPersonId] = useState(defaultPersonId ?? "");
  // Görsel: seçili derece halkasını vurgula (tıklanınca değişir); null = hepsi eşit.
  const [activeDeg, setActiveDeg] = useState<number | null>(null);
  const { view } = usePrivacy();
  const t = useT();

  // Kan hısımlarını dereceye (halkaya) göre grupla — merkezde seçilen kişi.
  const rings = useMemo(() => {
    if (!personId) return [] as Array<{ deg: number; people: Person[] }>;
    const dist = bloodDegrees(personId, people, idx);
    const byDeg = new Map<number, Person[]>();
    for (const [id, d] of dist) {
      if (d <= 0) continue;
      const p = idx.get(id);
      if (!p) continue;
      const arr = byDeg.get(d);
      if (arr) arr.push(p);
      else byDeg.set(d, [p]);
    }
    const coll = new Intl.Collator("tr");
    return [...byDeg.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([deg, ppl]) => ({ deg, people: ppl.sort((a, b) => coll.compare(a.firstName, b.firstName)) }));
  }, [personId, people, idx]);

  const self = personId ? idx.get(personId) : null;
  const maxDeg = rings.length ? rings[rings.length - 1].deg : 1;
  const CX = 160;
  const CY = 160;
  const R0 = 34;
  const RMAX = 150;
  const stepR = (RMAX - R0) / maxDeg;
  const CAP = 28; // halka başına en çok nokta

  return (
    <div className="space-y-3">
      <PersonPicker people={people} value={personId} onChange={(id) => { setPersonId(id); setActiveDeg(null); }} />

      {personId && rings.length === 0 && (
        <p className="text-sm text-text-subtle py-2 text-center">{t("panel.dv.noneAtDegree")}</p>
      )}

      {personId && rings.length > 0 && (
        <>
          <svg viewBox="0 0 320 320" className="w-full max-w-[340px] mx-auto block" role="img" aria-label={t("panel.card.degree")}>
            {/* Halkalar (dereceler) */}
            {rings.map((r) => {
              const R = R0 + r.deg * stepR;
              const on = activeDeg === null || activeDeg === r.deg;
              return (
                <g key={`ring-${r.deg}`}>
                  <circle
                    cx={CX} cy={CY} r={R} fill="none"
                    stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3"
                    opacity={on ? 1 : 0.35}
                  />
                  <text x={CX} y={CY - R - 2} textAnchor="middle" fontSize="9" fill="var(--text-subtle)">
                    {r.deg}°
                  </text>
                </g>
              );
            })}

            {/* Kişiler — her halkada eşit açıyla dağıtılır; tıklanınca profili açar */}
            {rings.map((r) => {
              const R = R0 + r.deg * stepR;
              const cap = Math.min(r.people.length, CAP);
              const dim = activeDeg !== null && activeDeg !== r.deg;
              return r.people.slice(0, cap).map((rawP, i) => {
                const p = view(rawP);
                const ang = (i / cap) * 2 * Math.PI - Math.PI / 2 + r.deg * 0.4;
                const x = CX + R * Math.cos(ang);
                const y = CY + R * Math.sin(ang);
                const tone = genderTone(p.gender).css;
                const initial = (p.firstName || "?").trim().charAt(0).toLocaleUpperCase("tr");
                return (
                  <g
                    key={p.id}
                    onClick={() => onSelect(p.id)}
                    className="cursor-pointer"
                    opacity={dim ? 0.3 : 1}
                  >
                    <circle cx={x} cy={y} r={8.5} fill={tone} stroke="var(--surface)" strokeWidth={1.5} />
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight={700} fill="#fff" style={{ pointerEvents: "none" }}>
                      {initial}
                    </text>
                    <title>{`${fullName(p)} · ${r.deg}°`}</title>
                  </g>
                );
              });
            })}

            {/* Merkez — seçilen kişi */}
            {self && (
              <g>
                <circle cx={CX} cy={CY} r={13} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
                <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight={700} fill="var(--primary-text)">
                  {(view(self).firstName || "?").trim().charAt(0).toLocaleUpperCase("tr")}
                </text>
                <title>{fullName(view(self))}</title>
              </g>
            )}
          </svg>

          {/* Derece rozetleri — tıklayınca o halkayı vurgular; sayıları gösterir */}
          <div className="flex flex-wrap gap-1.5 justify-center">
            {rings.map((r) => {
              const on = activeDeg === r.deg;
              return (
                <button
                  key={`leg-${r.deg}`}
                  type="button"
                  onClick={() => setActiveDeg(on ? null : r.deg)}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium border transition-colors ${
                    on ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text-muted hover:text-text"
                  }`}
                >
                  {t("panel.dv.degOption", { d: r.deg })}
                  <span className="tabular-nums opacity-70">{r.people.length}</span>
                </button>
              );
            })}
          </div>
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
  collapsible,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  empty?: string;
  className?: string;
  /** Başlığa tıklanınca açılır/kapanır (#3). */
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(collapsible ? defaultOpen : true);
  const body = empty ? <p className="text-sm text-text-subtle py-2">{empty}</p> : children;
  return (
    <section className={`rounded-2xl border border-border bg-surface p-4 sm:p-5${className ? ` ${className}` : ""}`}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <span className="flex items-baseline gap-2 min-w-0">
            <h2 className="font-serif text-base font-semibold text-text">{title}</h2>
            {hint && <span className="text-[11px] text-text-subtle shrink-0">{hint}</span>}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 text-text-subtle transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="font-serif text-base font-semibold text-text">{title}</h2>
          {hint && <span className="text-[11px] text-text-subtle shrink-0">{hint}</span>}
        </div>
      )}
      {open && <div className={collapsible ? "mt-3" : undefined}>{body}</div>}
    </section>
  );
}
