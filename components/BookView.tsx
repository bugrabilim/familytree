"use client";

import { Fragment, forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import HTMLFlipBook from "react-pageflip";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import { calcAge, lifeSpan } from "@/lib/date";
import { getChildren, getParents, getSpouses, getFormerSpouses, indexPeople, computeStats } from "@/lib/relations";
import { aggregatePlaces } from "@/lib/places";
import { EDUCATION_LEVELS, LIFE_EVENT_TYPES } from "@/types/family";
import { computeAlmanac } from "@/lib/book-stats";
import BookMap from "./BookMap";
import TreeSchema from "./TreeSchema";
import RelationMatrix from "./RelationMatrix";
import { usePrivacy } from "./PrivacyContext";
import useEscapeKey from "@/lib/useEscapeKey";
import { useT, useLang, type TFunction } from "@/lib/i18n";
import { generatePreface } from "@/lib/preface";
import { usePaginate, type RenderedPage, type Unit } from "./book/paginate";

interface Props {
  people: Person[];
  familyName?: string;
  onClose: () => void;
  /** "Yazdır / PDF" — bası görünümünü (PrintView) açar. */
  onPrint?: () => void;
}

interface FlipApi {
  flipNext: () => void;
  flipPrev: () => void;
  turnToPage: (page: number) => void;
  getPageCount: () => number;
}

/* Kâğıt yaşlandırma: 0 = yeni/temiz krem, 1 = eski parşömen. */
const AGED = { bg: [228, 212, 178], text: [74, 58, 40] };
const FRESH = { bg: [250, 246, 236], text: [43, 33, 23] };
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
function paperStyle(age: number): React.CSSProperties {
  const bg = AGED.bg.map((a, i) => lerp(FRESH.bg[i], a, age));
  const text = AGED.text.map((a, i) => lerp(FRESH.text[i], a, age));
  return { backgroundColor: rgb(bg), color: rgb(text) };
}

/* ---- Sayfa geometrisi (baskı hissi: portre, asimetrik kenar boşlukları) ---- */
const RATIO = 0.72; // genişlik / yükseklik
interface Geom {
  pageW: number;
  pageH: number;
  padX: number;
  padTop: number;
  padBot: number;
  contentW: number;
  contentH: number;
  spread: boolean;
  sig: string;
}
function computeGeom(w: number, h: number): Geom {
  const spread = w >= 820;
  const availW = spread ? (w - 12) / 2 : w;
  let pageW = Math.min(availW, 560);
  let pageH = Math.round(pageW / RATIO);
  if (pageH > h) {
    pageH = Math.floor(h);
    pageW = Math.round(pageH * RATIO);
  }
  pageW = Math.max(240, Math.floor(pageW));
  pageH = Math.max(340, Math.floor(pageH));
  const padX = Math.round(pageW * 0.088);
  const padTop = Math.round(pageH * 0.05) + 18; // üst kenar + koşan başlık bandı
  const padBot = Math.round(pageH * 0.055) + 20; // alt kenar + sayfa no bandı
  const contentW = pageW - padX * 2;
  const contentH = pageH - padTop - padBot;
  return { pageW, pageH, padX, padTop, padBot, contentW, contentH, spread, sig: `${contentW}x${contentH}` };
}

/**
 * Nostaljik aile kitabı (ekran) — BASKI-ÖNCE model: içerik önce sabit sayfalara
 * bölünür (paginate.tsx), sonra react-pageflip (StPageFlip) ile çevrilir. Uzun
 * biyografiler arka sayfalara akar, hiçbir şey kırpılmaz. Eski kuşaklar
 * parşömen, yeni kuşaklar temiz kâğıt. Gizlilik: maskeli kopya (`view`).
 */
export default function BookView({ people, familyName, onClose, onPrint }: Props) {
  const { view } = usePrivacy();
  const t = useT();
  const { lang } = useLang();
  const bookRef = useRef<{ pageFlip: () => FlipApi } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<Geom | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [goTo, setGoTo] = useState(false);
  const [query, setQuery] = useState("");
  useEscapeKey(onClose);

  // Sahne boyutunu ölç → sayfa geometrisi. Yeniden boyutta (debounce) güncelle.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let timer: number | undefined;
    const apply = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      const g = computeGeom(r.width, r.height);
      setGeom((prev) => (prev && prev.sig === g.sig && prev.pageW === g.pageW ? prev : g));
    };
    apply();
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 200);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  const masked = useMemo(() => people.map((p) => view(p)), [people, view]);
  const idx = useMemo(() => indexPeople(masked), [masked]);

  const genOf = useMemo(() => {
    const cache = new Map<string, number>();
    const depth = (p: Person, seen: Set<string>): number => {
      const hit = cache.get(p.id);
      if (hit !== undefined) return hit;
      if (seen.has(p.id)) return 1;
      seen.add(p.id);
      const parents = getParents(p, idx);
      const d = parents.length === 0 ? 1 : 1 + Math.max(...parents.map((pa) => depth(pa, seen)));
      seen.delete(p.id);
      cache.set(p.id, d);
      return d;
    };
    const m = new Map<string, number>();
    for (const p of masked) m.set(p.id, depth(p, new Set()));
    return m;
  }, [masked, idx]);

  const maxGen = useMemo(() => Math.max(1, ...[...genOf.values()]), [genOf]);
  const generations = useMemo(() => new Set([...genOf.values()]).size, [genOf]);
  const ageOf = useCallback((gen: number) => (maxGen > 1 ? (maxGen - gen) / (maxGen - 1) : 0.5), [maxGen]);

  const yearRange = useMemo(() => {
    let from = Infinity, to = -Infinity;
    for (const p of masked) {
      const y = Number(p.birthDate?.slice(0, 4));
      if (Number.isFinite(y)) { if (y < from) from = y; if (y > to) to = y; }
    }
    return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
  }, [masked]);

  const placeAgg = useMemo(() => {
    const aggs = aggregatePlaces(masked);
    const located = aggs.filter((a) => a.coords);
    const maxCount = located.reduce((m, a) => Math.max(m, a.count), 1);
    return { located, maxCount, total: aggs.length };
  }, [masked]);

  const stats = useMemo(() => {
    let living = 0, deceased = 0, male = 0, female = 0;
    for (const p of masked) {
      if (p.deathDate) deceased++;
      else living++;
      if (p.gender === "male") male++;
      else if (p.gender === "female") female++;
    }
    return { total: masked.length, living, deceased, male, female };
  }, [masked]);

  const famStats = useMemo(() => computeStats(masked), [masked]);
  const almanac = useMemo(() => computeAlmanac(masked), [masked]);
  const topPlaces = useMemo(() => {
    const aggs = aggregatePlaces(masked);
    return [...aggs].sort((a, b) => b.count - a.count).slice(0, 5).map((a) => a.place);
  }, [masked]);
  const preface = useMemo(
    () => generatePreface({ familyName, from: yearRange?.from, to: yearRange?.to, places: topPlaces, lang: lang === "en" ? "en" : "tr" }),
    [familyName, yearRange, topPlaces, lang]
  );

  const bookTitle = familyName ? t("print.bookTitleNamed", { name: familyName }) : t("print.bookTitle");

  // Kişileri kuşağa, sonra doğum yılına, sonra ada göre sırala.
  const ordered = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...masked].sort((a, b) => {
      const ga = genOf.get(a.id) ?? 1, gb = genOf.get(b.id) ?? 1;
      if (ga !== gb) return ga - gb;
      const ay = a.birthDate?.slice(0, 4) ?? "9999", by = b.birthDate?.slice(0, 4) ?? "9999";
      return ay.localeCompare(by) || coll.compare(fullName(a), fullName(b));
    });
  }, [masked, genOf]);

  // Kişinin ilk sayfasına atlamak için: personId → units içindeki sıra bilgisi
  // (sayfa çözümü pages üzerinden yapılır). Arama bunu kullanır.
  const units = useMemo<Unit[]>(() => {
    const u: Unit[] = [];
    const sectionForeword = t("print.forewordTitle");
    // Kapak
    u.push({ kind: "full", key: "cover", age: 1, node: <CoverPage title={bookTitle} yearRange={yearRange} count={people.length} generations={generations} t={t} /> });
    // Önsöz
    u.push({ kind: "block", key: "fw-title", age: 1, section: sectionForeword, breakBefore: true, keepWithNext: true, node: <SectionTitle>{sectionForeword}</SectionTitle> });
    preface.forEach((para, i) => {
      u.push({
        kind: "text",
        key: `fw-${i}`,
        age: 1,
        section: sectionForeword,
        text: para,
        className: "text-[15px] leading-relaxed text-justify mb-3",
        leadClassName: i === 0 ? "text-[15px] leading-relaxed text-justify mb-3 first-letter:text-5xl first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:leading-[0.8]" : undefined,
      });
    });
    // Ailenin Özeti + Rakamlarla Aile
    const secAlmanac = t("book.almanacTitle");
    u.push({ kind: "block", key: "alm-title", age: 1, section: secAlmanac, breakBefore: true, keepWithNext: true, node: <SectionTitle>{secAlmanac}</SectionTitle> });
    u.push({
      kind: "block", key: "alm-grid", age: 1, section: secAlmanac, keepWithNext: true,
      node: (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <SummaryStat label={t("book.stat.people")} value={famStats.total} />
          <SummaryStat label={t("book.stat.generations")} value={generations} />
          <SummaryStat label={t("book.stat.living")} value={famStats.living} />
          <SummaryStat label={t("book.stat.deceased")} value={stats.deceased} />
          <SummaryStat label={t("book.stat.male")} value={stats.male} />
          <SummaryStat label={t("book.stat.female")} value={stats.female} />
        </div>
      ),
    });
    u.push({
      kind: "block", key: "alm-nums", age: 1, section: secAlmanac,
      node: (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-4">
          <Row k={t("panel.mini.marriages")} v={String(famStats.marriages)} />
          <Row k={t("panel.mini.divorces")} v={String(famStats.divorces)} />
          {famStats.avgLifespan !== undefined && <Row k={t("panel.mini.avgLifespan")} v={t("panel.mini.avgLifespanValue", { years: famStats.avgLifespan })} />}
          <Row k={t("panel.mini.largestSibship")} v={String(famStats.largestSibship)} />
          {famStats.topBirthPlace && <Row k={t("panel.mini.topBirthPlace")} v={`${famStats.topBirthPlace.name} (${famStats.topBirthPlace.count})`} wide />}
          {topPlaces.length > 0 && <Row k={t("book.stat.topPlaces")} v={topPlaces.join(" · ")} wide />}
        </dl>
      ),
    });
    u.push({
      kind: "block", key: "alm-pergen", age: 1, section: secAlmanac, keepWithNext: true,
      node: (
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-2">{t("book.perGeneration")}</h3>
          <ul className="space-y-1">
            {almanac.perGeneration.map((g) => (
              <li key={g.gen} className="flex items-center gap-2 text-[13px]">
                <span className="w-20 shrink-0 opacity-70">{t("print.generation", { n: g.gen })}</span>
                <span className="flex-1 h-2.5 rounded-full bg-current/10 overflow-hidden">
                  <span className="block h-full bg-current/40" style={{ width: `${Math.round((g.count / Math.max(1, famStats.total)) * 100)}%` }} />
                </span>
                <span className="w-8 text-right tabular-nums opacity-80">{g.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    });
    const lists: Array<{ key: string; title: string; rows: Array<{ name: string; meta?: string | null }> }> = [
      { key: "eldest", title: t("book.eldestTitle"), rows: almanac.eldest.map((id) => idx.get(id)).filter((p): p is Person => !!p).map((p) => ({ name: fullName(p), meta: lifeSpan(p.birthDate, p.deathDate) })) },
      { key: "longest", title: t("book.longestLivedTitle"), rows: almanac.longestLived.map((r) => ({ p: idx.get(r.id), age: r.age })).filter((x): x is { p: Person; age: number } => !!x.p).map(({ p, age }) => ({ name: fullName(p), meta: t("print.ageYears", { age }) })) },
      { key: "livingold", title: t("book.livingOldestTitle"), rows: almanac.livingOldest.map((r) => ({ p: idx.get(r.id), age: r.age })).filter((x): x is { p: Person; age: number } => !!x.p).map(({ p, age }) => ({ name: fullName(p), meta: t("print.ageYears", { age }) })) },
      { key: "surnames", title: t("book.surnamesTitle"), rows: famStats.surnames.map((s) => ({ name: s.name, meta: String(s.count) })) },
    ];
    for (const l of lists) {
      if (l.rows.length === 0) continue;
      u.push({ kind: "block", key: `alm-${l.key}`, age: 1, section: secAlmanac, keepWithNext: true, node: <AlmanacList title={l.title} rows={l.rows} /> });
    }
    // Harita, şema, matris — tam sayfa
    if (placeAgg.located.length > 0) {
      u.push({ kind: "full", key: "map", age: 1, section: t("book.placesTitle"), node: <FullPageWrap title={t("book.placesTitle")} subtitle={t("book.placesSubtitle", { located: placeAgg.located.length, total: placeAgg.total })}><BookMap located={placeAgg.located} maxCount={placeAgg.maxCount} /></FullPageWrap> });
    }
    if (masked.length > 1) {
      u.push({ kind: "full", key: "schema", age: 1, section: t("book.schemaTitle"), node: <FullPageWrap title={t("book.schemaTitle")} subtitle={t("book.schemaRotateHint")}><RotatedFill><TreeSchema people={masked} /></RotatedFill></FullPageWrap> });
      u.push({ kind: "full", key: "matrix", age: 1, section: t("book.matrixTitle"), node: <FullPageWrap title={t("book.matrixTitle")} subtitle={t("book.matrixIntro")}><FitBox><RelationMatrix people={masked} scroll={false} /></FitBox></FullPageWrap> });
    }
    // Kişiler — kuşak bölümleri
    let lastGen = -1;
    for (const person of ordered) {
      const gen = genOf.get(person.id) ?? 1;
      const age = ageOf(gen);
      const secLabel = t("print.generation", { n: gen });
      if (gen !== lastGen) {
        lastGen = gen;
        u.push({ kind: "block", key: `chap-${gen}`, age, section: secLabel, breakBefore: true, keepWithNext: true, node: <ChapterTitle>{secLabel}</ChapterTitle> });
      }
      u.push({ kind: "block", key: `p-${person.id}-h`, age, personId: person.id, section: secLabel, keepWithNext: true, node: <PersonHeader person={person} idx={idx} masked={masked} t={t} /> });
      if (person.bio) {
        u.push({ kind: "text", key: `p-${person.id}-bio`, age, personId: person.id, section: secLabel, text: person.bio, className: "text-[14.5px] leading-relaxed text-justify whitespace-pre-line mb-2" });
      }
      if (person.events && person.events.length > 0) {
        for (const ev of person.events) {
          const meta = LIFE_EVENT_TYPES[ev.type];
          u.push({
            kind: "block", key: `p-${person.id}-ev-${ev.id}`, age, personId: person.id, section: secLabel,
            node: (
              <p className="text-sm mb-0.5">
                <span className="opacity-40 tabular-nums">{ev.date?.slice(0, 4) ?? "—"}</span>{" "}
                {meta?.icon ?? "•"} {ev.title}
                {ev.place && <span className="opacity-60"> — {ev.place}</span>}
              </p>
            ),
          });
        }
      }
      const mems = person.memories?.filter((m) => m.text) ?? [];
      if (mems.length > 0) {
        u.push({ kind: "block", key: `p-${person.id}-mh`, age, personId: person.id, section: secLabel, keepWithNext: true, node: <p className="text-xs font-semibold uppercase tracking-wide opacity-50 mt-2 mb-1">{t("print.memories")}</p> });
        for (const m of mems) {
          u.push({
            kind: "block", key: `p-${person.id}-m-${m.id}`, age, personId: person.id, section: secLabel,
            node: (
              <div className="text-sm mb-1.5">
                {m.prompt && <p className="italic opacity-60 leading-snug">{m.prompt}</p>}
                <p className="opacity-90 whitespace-pre-line leading-snug">{m.text}</p>
              </div>
            ),
          });
        }
      }
    }
    return u;
  }, [ordered, genOf, ageOf, idx, masked, almanac, famStats, stats, placeAgg, topPlaces, preface, yearRange, generations, people.length, bookTitle, t]);

  const geomForPaginate = useMemo(
    () => ({ contentW: geom?.contentW ?? 400, contentH: geom?.contentH ?? 560, sig: geom?.sig ?? "init" }),
    [geom]
  );
  const { probe, pages } = usePaginate(units, geomForPaginate);

  const total = pages?.length ?? 0;

  // Kişi → ilk sayfa indeksi (arama için).
  const personFirstPage = useMemo(() => {
    const m = new Map<string, number>();
    if (!pages) return m;
    for (let i = 0; i < pages.length; i++) {
      const pid = pages[i].personId;
      if (pid && !m.has(pid)) m.set(pid, i);
    }
    return m;
  }, [pages]);

  const searchMatches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return [] as Array<{ person: Person; index: number }>;
    const out: Array<{ person: Person; index: number }> = [];
    for (const p of ordered) {
      const name = fullName(p).toLocaleLowerCase("tr");
      const by = p.birthDate?.slice(0, 4) ?? "";
      const dy = p.deathDate?.slice(0, 4) ?? "";
      if (name.includes(q) || (by && by.includes(q)) || (dy && dy.includes(q))) {
        const index = personFirstPage.get(p.id);
        if (index !== undefined) out.push({ person: p, index });
      }
      if (out.length >= 40) break;
    }
    return out;
  }, [query, ordered, personFirstPage]);

  const flip = useCallback((d: "next" | "prev") => {
    const api = bookRef.current?.pageFlip();
    if (!api) return;
    if (d === "next") api.flipNext();
    else api.flipPrev();
  }, []);
  const [pendingJump, setPendingJump] = useState<number | null>(null);
  useEffect(() => {
    if (pendingJump === null) return;
    bookRef.current?.pageFlip()?.turnToPage(Math.min(total - 1, Math.max(0, pendingJump)));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingJump(null);
  }, [pendingJump, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") flip("next");
      else if (e.key === "ArrowLeft") flip("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip]);

  // Sayfa sayısı / geometri değişince flipbook'u yeniden kur (StPageFlip sabit
  // çocuk sayısı/boyutuyla çalışır); mevcut sayfayı koru.
  const flipKey = geom ? `${geom.sig}-${total}` : "init";
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCurrentPage(0); }, [flipKey]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900/92 backdrop-blur-sm animate-fade-in">
      {/* Araç çubuğu */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 shrink-0 text-neutral-200">
        <p className="text-sm font-medium truncate">{bookTitle}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setGoTo((v) => !v)}
            aria-pressed={goTo}
            title={t("book.goToTitle")}
            className={`h-9 w-9 grid place-items-center rounded-xl border text-sm transition-colors ${goTo ? "border-white/40 bg-white/15" : "border-white/20 hover:bg-white/10"}`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.9" />
              <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
          {onPrint && (
            <button
              onClick={onPrint}
              title={t("book.printTitle")}
              className="h-9 px-3 rounded-xl border border-white/20 text-sm hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 9V3h12v6M6 18H4v-6a2 2 0 012-2h12a2 2 0 012 2v6h-2M8 14h8v7H8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{t("book.print")}</span>
            </button>
          )}
          <button onClick={onClose} className="h-9 px-4 rounded-xl border border-white/20 text-sm hover:bg-white/10 transition-colors">
            {t("book.close")}
          </button>
        </div>
      </div>

      {/* Ara / sayfaya git */}
      {goTo && (
        <div className="shrink-0 px-4 sm:px-6 pb-3 -mt-1">
          <div className="mx-auto max-w-xl rounded-2xl border border-white/15 bg-neutral-800/80 backdrop-blur p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("book.searchPlaceholder")}
                className="flex-1 h-9 px-3 rounded-xl bg-neutral-900/70 border border-white/15 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-white/40"
              />
              <div className="flex items-center gap-1.5 text-neutral-300 text-xs">
                <span className="hidden sm:inline">{t("book.pageJump")}</span>
                <input
                  type="number"
                  min={1}
                  max={total}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = Number((e.target as HTMLInputElement).value);
                      if (Number.isFinite(n)) setPendingJump(n - 1);
                    }
                  }}
                  placeholder="#"
                  className="w-16 h-9 px-2 rounded-xl bg-neutral-900/70 border border-white/15 text-sm text-neutral-100 tabular-nums focus:outline-none focus:border-white/40"
                />
              </div>
            </div>
            {query.trim() && (
              <ul className="max-h-48 overflow-y-auto space-y-0.5">
                {searchMatches.length === 0 ? (
                  <li className="text-xs text-neutral-400 py-1.5 px-1">{t("book.noMatch")}</li>
                ) : (
                  searchMatches.map((m) => (
                    <li key={m.person.id}>
                      <button
                        onClick={() => { setPendingJump(m.index); setGoTo(false); setQuery(""); }}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-white/10 transition-colors"
                      >
                        <span className="text-sm text-neutral-100 truncate">
                          {fullName(m.person)}
                          {m.person.birthDate && <span className="text-neutral-400"> · {m.person.birthDate.slice(0, 4)}</span>}
                        </span>
                        <span className="text-[11px] text-neutral-400 tabular-nums shrink-0">{t("book.pageN", { n: m.index + 1 })}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Sahne */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-2 sm:px-8 pb-2">
        <div ref={stageRef} className="relative w-full max-w-6xl h-full max-h-[76vh] flex items-center justify-center">
          <NavArrow dir="prev" disabled={currentPage <= 0} onClick={() => flip("prev")} label={t("book.prevAria")} />

          {geom && pages && pages.length > 0 && (
            <HTMLFlipBook
              key={flipKey}
              ref={bookRef}
              className="shadow-2xl"
              style={{}}
              startPage={0}
              size="fixed"
              width={geom.pageW}
              height={geom.pageH}
              minWidth={geom.pageW}
              maxWidth={geom.pageW}
              minHeight={geom.pageH}
              maxHeight={geom.pageH}
              drawShadow
              flippingTime={700}
              usePortrait={!geom.spread}
              startZIndex={0}
              autoSize={false}
              maxShadowOpacity={0.5}
              showCover
              mobileScrollSupport={false}
              clickEventForward
              useMouseEvents
              swipeDistance={30}
              showPageCorners
              disableFlipByClick={false}
              onFlip={(e: { data: number }) => setCurrentPage(e.data)}
            >
              {pages.map((pg, i) => (
                <BookPage key={pg.key} page={pg} num={i + 1} geom={geom} bookTitle={bookTitle} t={t} />
              ))}
            </HTMLFlipBook>
          )}

          {(!geom || !pages) && (
            <div className="flex items-center gap-2.5 text-neutral-300 text-sm">
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white/80 animate-spin" />
              {t("book.composing")}
            </div>
          )}

          <NavArrow dir="next" disabled={currentPage >= total - 1} onClick={() => flip("next")} label={t("book.nextAria")} />
        </div>
      </div>

      <div className="shrink-0 text-center pb-3 text-neutral-300">
        <p className="text-xs tabular-nums">{t("book.page", { n: Math.min(currentPage + 1, total || 1), total: total || 1 })}</p>
        <p className="hidden sm:block text-[11px] text-neutral-400 mt-0.5">{t("book.hint")}</p>
      </div>

      {/* Ölçüm sondası (gizli) */}
      {geom && probe}
    </div>,
    document.body
  );
}

/* ---------------------------------------------------------------- */

const BookPage = forwardRef<HTMLDivElement, { page: RenderedPage; num: number; geom: Geom; bookTitle: string; t: TFunction }>(
  function BookPage({ page, num, geom, bookTitle, t }, ref) {
    const isCover = num === 1 && page.isFull; // ilk tam sayfa = kapak
    return (
      // Dış öğeyi react-pageflip konumlandırır (StPageFlip inline stilini ezer),
      // bu yüzden PARŞÖMEN zemini + metin rengi, StPageFlip'in dokunmadığı bir İÇ
      // sarmalayıcıya uygulanır — aksi halde sayfa saydam kalıp arkadaki koyu
      // zemini gösteriyordu (karanlık hatası).
      <div ref={ref} data-density={isCover ? "hard" : "soft"} className="book-leaf" style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
        <div className="absolute inset-0" style={{ ...paperStyle(page.age), overflow: "hidden" }}>
          {page.isFull ? (
            <div className="absolute inset-0 flex flex-col" style={{ padding: Math.round(geom.padX * 0.7) }}>
              {page.nodes.map((n, i) => (
                <Fragment key={i}>{n}</Fragment>
              ))}
            </div>
          ) : (
            <>
              {/* Koşan başlık */}
              <div
                className="absolute left-0 right-0 flex items-center justify-between text-[10px] uppercase tracking-wider opacity-45"
                style={{ top: Math.round(geom.padTop * 0.42), paddingLeft: geom.padX, paddingRight: geom.padX }}
              >
                <span className="truncate">{page.section ?? bookTitle}</span>
                <span className="truncate">{bookTitle}</span>
              </div>
              {/* İçerik */}
              <div
                className="absolute font-serif flex flex-col"
                style={{ top: geom.padTop, left: geom.padX, width: geom.contentW, height: geom.contentH, overflow: "hidden" }}
              >
                {page.continues && <p className="text-[11px] italic opacity-45 mb-1">… {t("book.contd")}</p>}
                {page.nodes}
              </div>
            </>
          )}
          {/* Sayfa numarası */}
          {!isCover && (
            <div className="absolute left-0 right-0 text-center text-[11px] tabular-nums opacity-50" style={{ bottom: Math.round(geom.padBot * 0.4) }}>
              {num}
            </div>
          )}
        </div>
      </div>
    );
  }
);

function CoverPage({ title, yearRange, count, generations, t }: { title: string; yearRange: { from: number; to: number } | null; count: number; generations: number; t: TFunction }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center px-6">
      <p className="text-6xl mb-6">🌳</p>
      <h1 className="font-serif text-3xl sm:text-4xl font-bold leading-tight mb-3">{title}</h1>
      {yearRange && <p className="text-lg opacity-70 tracking-wide mb-6">{t("print.coverYears", { from: yearRange.from, to: yearRange.to })}</p>}
      <div className="w-16 border-t border-current/25 my-6" />
      <p className="text-sm opacity-70">{t("print.coverMeta", { count, generations })}</p>
    </div>
  );
}

/** Çok geniş ama kısa içeriği (soy ağacı şeması) 90° döndürüp sayfanın uzun
 *  kenarını kullanarak büyütür ("dik yerleştir"). İç kutu, dış kutunun en/boyu
 *  değiştirilmiş hâliyle boyutlanır; TreeSchema (w-full h-full) onu doldurur. */
function RotatedFill({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((prev) => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1 ? prev : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative flex-1 min-h-0 w-full overflow-hidden rounded-lg border border-black/10 bg-current/[0.03]">
      {box.w > 0 && (
        <div style={{ position: "absolute", top: "50%", left: "50%", width: box.h, height: box.w, transform: "translate(-50%, -50%) rotate(90deg)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** İçeriği (ör. geniş matris tablosu) sayfa kutusuna ölçekleyerek sığdırır —
 *  taşma/kırpma yerine transform:scale. scrollWidth/Height transform'dan
 *  etkilenmediği için doğal boyutu güvenle okur. */
function FitBox({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const o = outerRef.current, inr = innerRef.current;
    if (!o || !inr) return;
    const measure = () => {
      const iw = inr.scrollWidth, ih = inr.scrollHeight;
      const aw = o.clientWidth, ah = o.clientHeight;
      if (!iw || !ih || !aw || !ah) return;
      const s = Math.min(aw / iw, ah / ih, 1);
      setScale((prev) => (Math.abs(prev - s) < 0.004 ? prev : s));
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [children]);
  return (
    <div ref={outerRef} className="flex-1 min-h-0 w-full overflow-hidden flex items-start justify-center">
      <div ref={innerRef} className="inline-block" style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
        {children}
      </div>
    </div>
  );
}

function FullPageWrap({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="font-serif h-full w-full flex flex-col">
      <h2 className="text-center text-2xl font-bold mb-1">{title}</h2>
      {subtitle && <p className="text-center text-xs opacity-60 mb-3 max-w-md mx-auto leading-relaxed">{subtitle}</p>}
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-serif text-center text-2xl font-bold mb-5">{children}</h2>;
}

function ChapterTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-center my-2">
      <div className="mx-auto w-10 border-t border-current/25 mb-3" />
      <h2 className="font-serif text-xl font-semibold tracking-[0.15em] uppercase opacity-80">{children}</h2>
      <div className="mx-auto w-10 border-t border-current/25 mt-3" />
    </div>
  );
}

function SummaryStat({ label, value, big }: { label: string; value: number; big?: boolean }) {
  return (
    <div className="rounded-lg border border-current/15 bg-current/[0.03] px-3 py-2.5 text-center">
      <p className={`font-bold tabular-nums ${big ? "text-3xl" : "text-2xl"}`}>{value.toLocaleString("tr")}</p>
      <p className="text-[11px] uppercase tracking-wide opacity-60 mt-0.5">{label}</p>
    </div>
  );
}

function NavArrow({ dir, disabled, onClick, label }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`absolute ${dir === "prev" ? "left-0" : "right-0"} z-10 w-9 h-9 sm:w-10 sm:h-10 grid place-items-center rounded-full bg-white/10 text-neutral-100 hover:bg-white/20 disabled:opacity-25 disabled:cursor-default transition-colors`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function PersonHeader({ person, idx, masked, t }: { person: Person; idx: ReturnType<typeof indexPeople>; masked: Person[]; t: TFunction }) {
  const parents = getParents(person, idx);
  const spouses = getSpouses(person, idx);
  const exes = getFormerSpouses(person, idx);
  const children = getChildren(person, masked);
  const age = calcAge(person.birthDate, person.deathDate);
  const span = lifeSpan(person.birthDate, person.deathDate);
  const edu = person.education
    ? (EDUCATION_LEVELS as readonly string[]).includes(person.education)
      ? t(`education.${person.education}`)
      : person.education
    : undefined;
  const portrait = person.photo || person.photos?.[0];
  const names = (list: Person[]) => list.map((p) => fullName(p)).join(", ");
  return (
    <div className="mb-1.5">
      <div className="flex items-start gap-3 mb-2">
        {portrait && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={portrait} alt={fullName(person)} className="w-20 object-cover rounded-md border border-black/10 bg-black/5 shrink-0" style={{ height: 104 }} />
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-semibold leading-tight">{fullName(person)}</h2>
          <p className="text-sm italic opacity-60 mt-0.5">
            {span && <span>{span}</span>}
            {age !== null && <span> · {t("print.ageYears", { age })}</span>}
            {person.birthPlace && <span> · {person.birthPlace}</span>}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
        {person.occupation && <Row k={t("drawer.occupation")} v={person.occupation} />}
        {edu && <Row k={t("drawer.education")} v={edu} />}
        {parents.length > 0 && <Row k={t("print.parents")} v={names(parents)} wide />}
        {spouses.length > 0 && <Row k={t("print.spouses")} v={names(spouses)} wide />}
        {exes.length > 0 && <Row k={t("print.formerSpouses")} v={names(exes)} wide />}
        {children.length > 0 && <Row k={t("print.children")} v={names(children)} wide />}
      </dl>
    </div>
  );
}

function Row({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={`flex gap-1.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="opacity-40 shrink-0">{k}:</dt>
      <dd className="opacity-90">{v}</dd>
    </div>
  );
}

function AlmanacList({ title, rows }: { title: string; rows: Array<{ name: string; meta?: string | null }> }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-1.5">{title}</h3>
      <ul className="space-y-0.5">
        {rows.map((r, i) => (
          <li key={`${r.name}-${i}`} className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="opacity-90 truncate min-w-0">{r.name}</span>
            {r.meta && <span className="opacity-60 tabular-nums shrink-0">{r.meta}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
