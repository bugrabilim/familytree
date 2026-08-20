"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useT, useLang } from "@/lib/i18n";
import { generatePreface } from "@/lib/preface";

interface Props {
  people: Person[];
  familyName?: string;
  onClose: () => void;
  /** "Yazdır / PDF" — bası görünümünü (PrintView) açar. */
  onPrint?: () => void;
}

type Page =
  | { kind: "cover" }
  | { kind: "foreword" }
  | { kind: "summary" }
  | { kind: "almanac" }
  | { kind: "places" }
  | { kind: "schema" }
  | { kind: "matrix" }
  | { kind: "person"; gen: number; person: Person };

/** react-pageflip (StPageFlip) örneğinin ihtiyaç duyduğumuz metotları. */
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
  return {
    backgroundColor: rgb(bg),
    color: rgb(text),
    boxShadow: `inset 0 0 ${40 + age * 50}px rgba(120,80,30,${0.06 + age * 0.20})`,
  };
}

/**
 * Nostaljik aile kitabı (ekran) — GERÇEK sayfa çevirme motoru olarak
 * `react-pageflip` (StPageFlip) kullanılır: sürükleyerek/köşeden ya da alttaki
 * ileri-geri düğmeleriyle çevrilir. Sayfa içeriği (kapak, önsöz, rakamlar,
 * harita, şema, ilişki matrisi, kişi biyografileri) korunur; uzun sayfalar
 * kendi içinde kayar. Eski kuşaklar parşömen, yeni kuşaklar temiz kâğıt.
 * Gizlilik: maskeli kopya (`view`).
 */
export default function BookView({ people, familyName, onClose, onPrint }: Props) {
  const { view } = usePrivacy();
  const t = useT();
  const { lang } = useLang();
  const bookRef = useRef<{ pageFlip: () => FlipApi } | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [goTo, setGoTo] = useState(false); // "sayfaya git" / arama panosu açık mı
  const [query, setQuery] = useState("");
  useEscapeKey(onClose);

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

  const yearRange = useMemo(() => {
    let from = Infinity, to = -Infinity;
    for (const p of masked) {
      const y = Number(p.birthDate?.slice(0, 4));
      if (Number.isFinite(y)) { if (y < from) from = y; if (y > to) to = y; }
    }
    return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
  }, [masked]);

  // Doğum yerleri — kitaba statik dünya haritası sayfası. Gizlilik: maskeli
  // kopyadan türetildiği için gizli yaşayanların doğum yeri sızmaz.
  const placeAgg = useMemo(() => {
    const aggs = aggregatePlaces(masked);
    const located = aggs.filter((a) => a.coords);
    const maxCount = located.reduce((m, a) => Math.max(m, a.count), 1);
    return { located, maxCount, total: aggs.length };
  }, [masked]);

  // Özet sayısal veriler — maskeli kopyadan (gizlilik korunur).
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

  // Rakamlarla Aile — genişletilmiş sayılar + listeler.
  const famStats = useMemo(() => computeStats(masked), [masked]);
  const almanac = useMemo(() => computeAlmanac(masked), [masked]);

  // En sık geçen yerler (ada göre, çoktan aza) — özet ve önsöz için.
  const topPlaces = useMemo(() => {
    const aggs = aggregatePlaces(masked);
    return [...aggs].sort((a, b) => b.count - a.count).slice(0, 5).map((a) => a.place);
  }, [masked]);

  // Önsöz metni — yıl aralığı + en sık şehirler + tarihsel dönemler.
  const preface = useMemo(
    () =>
      generatePreface({
        familyName,
        from: yearRange?.from,
        to: yearRange?.to,
        places: topPlaces,
        lang: lang === "en" ? "en" : "tr",
      }),
    [familyName, yearRange, topPlaces, lang]
  );

  const pages = useMemo<Page[]>(() => {
    const coll = new Intl.Collator("tr");
    const ordered = [...masked].sort((a, b) => {
      const ga = genOf.get(a.id) ?? 1, gb = genOf.get(b.id) ?? 1;
      if (ga !== gb) return ga - gb;
      const ay = a.birthDate?.slice(0, 4) ?? "9999", by = b.birthDate?.slice(0, 4) ?? "9999";
      return ay.localeCompare(by) || coll.compare(fullName(a), fullName(b));
    });
    const p: Page[] = [{ kind: "cover" }, { kind: "foreword" }, { kind: "summary" }, { kind: "almanac" }];
    if (placeAgg.located.length > 0) p.push({ kind: "places" });
    if (masked.length > 1) p.push({ kind: "schema" });
    if (masked.length > 1) p.push({ kind: "matrix" });
    for (const person of ordered) p.push({ kind: "person", gen: genOf.get(person.id) ?? 1, person });
    return p;
  }, [masked, genOf, placeAgg.located.length]);

  const total = pages.length;

  // Ada ya da yıla göre ara → sayfa numarasını bul.
  const searchMatches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return [] as Array<{ index: number; person: Person }>;
    const out: Array<{ index: number; person: Person }> = [];
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      if (pg.kind !== "person") continue;
      const name = fullName(pg.person).toLocaleLowerCase("tr");
      const by = pg.person.birthDate?.slice(0, 4) ?? "";
      const dy = pg.person.deathDate?.slice(0, 4) ?? "";
      if (name.includes(q) || (by && by.includes(q)) || (dy && dy.includes(q))) {
        out.push({ index: i, person: pg.person });
      }
    }
    return out.slice(0, 40);
  }, [query, pages]);

  const flip = useCallback((d: "next" | "prev") => {
    const api = bookRef.current?.pageFlip();
    if (!api) return;
    if (d === "next") api.flipNext();
    else api.flipPrev();
  }, []);

  // Sayfaya atlama: ref'e render sırasında dokunmamak için istek state'e yazılır,
  // gerçek `turnToPage` çağrısı efektte yapılır (react-hooks/refs kuralı).
  const [pendingJump, setPendingJump] = useState<number | null>(null);
  useEffect(() => {
    if (pendingJump === null) return;
    bookRef.current?.pageFlip()?.turnToPage(Math.min(total - 1, Math.max(0, pendingJump)));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingJump(null);
  }, [pendingJump, total]);

  // Klavye okları — ileri/geri çevir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") flip("next");
      else if (e.key === "ArrowLeft") flip("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip]);

  if (typeof document === "undefined") return null;

  const ageOf = (pg: Page): number => {
    if (pg.kind === "person") return maxGen > 1 ? (maxGen - pg.gen) / (maxGen - 1) : 0.5;
    return 1; // kapak/önsöz en eski his
  };

  const renderContent = (pg: Page) => {
    switch (pg.kind) {
      case "cover":
        return (
          <div className="h-full min-h-[55vh] flex flex-col items-center justify-center text-center">
            <p className="text-6xl mb-6">🌳</p>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold leading-tight mb-3">
              {familyName ? t("print.bookTitleNamed", { name: familyName }) : t("print.bookTitle")}
            </h1>
            {yearRange && (
              <p className="text-lg opacity-70 tracking-wide mb-6">
                {t("print.coverYears", { from: yearRange.from, to: yearRange.to })}
              </p>
            )}
            <div className="w-16 border-t border-current/25 my-6" />
            <p className="text-sm opacity-70">{t("print.coverMeta", { count: people.length, generations })}</p>
          </div>
        );
      case "foreword":
        return (
          <div className="font-serif">
            <h2 className="text-center text-2xl font-bold mb-6">{t("print.forewordTitle")}</h2>
            {preface.map((para, i) => (
              <p
                key={i}
                className={`text-[15px] leading-relaxed text-justify mb-3 ${
                  i === 0
                    ? "first-letter:text-5xl first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:leading-[0.85]"
                    : ""
                }`}
              >
                {para}
              </p>
            ))}
          </div>
        );
      case "summary":
        return (
          <div className="font-serif h-full flex flex-col">
            <h2 className="text-center text-2xl font-bold mb-1">{t("book.summaryTitle")}</h2>
            {yearRange && (
              <p className="text-center text-sm opacity-60 mb-5">
                {t("print.coverYears", { from: yearRange.from, to: yearRange.to })}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <SummaryStat big label={t("book.stat.people")} value={stats.total} />
              <SummaryStat big label={t("book.stat.generations")} value={generations} />
              <SummaryStat label={t("book.stat.living")} value={stats.living} />
              <SummaryStat label={t("book.stat.deceased")} value={stats.deceased} />
              <SummaryStat label={t("book.stat.male")} value={stats.male} />
              <SummaryStat label={t("book.stat.female")} value={stats.female} />
            </div>
            {topPlaces.length > 0 && (
              <div className="mt-6">
                <p className="text-xs uppercase tracking-wide opacity-60 mb-2">{t("book.stat.topPlaces")}</p>
                <p className="text-[15px] leading-relaxed">{topPlaces.join(" · ")}</p>
              </div>
            )}
          </div>
        );
      case "almanac":
        return (
          <div className="font-serif">
            <h2 className="text-center text-2xl font-bold mb-5">{t("book.almanacTitle")}</h2>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <SummaryStat label={t("book.stat.people")} value={famStats.total} />
              <SummaryStat label={t("book.stat.generations")} value={generations} />
              <SummaryStat label={t("book.stat.living")} value={famStats.living} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-5">
              <Row k={t("panel.mini.marriages")} v={String(famStats.marriages)} />
              <Row k={t("panel.mini.divorces")} v={String(famStats.divorces)} />
              {famStats.avgLifespan !== undefined && (
                <Row k={t("panel.mini.avgLifespan")} v={t("panel.mini.avgLifespanValue", { years: famStats.avgLifespan })} />
              )}
              <Row k={t("panel.mini.largestSibship")} v={String(famStats.largestSibship)} />
              {famStats.topBirthPlace && (
                <Row k={t("panel.mini.topBirthPlace")} v={`${famStats.topBirthPlace.name} (${famStats.topBirthPlace.count})`} wide />
              )}
            </dl>
            <h3 className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-2">{t("book.perGeneration")}</h3>
            <ul className="mb-5 space-y-1">
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <AlmanacList
                title={t("book.eldestTitle")}
                rows={almanac.eldest
                  .map((id) => idx.get(id))
                  .filter((p): p is Person => !!p)
                  .map((p) => ({ name: fullName(p), meta: lifeSpan(p.birthDate, p.deathDate) }))}
              />
              <AlmanacList
                title={t("book.longestLivedTitle")}
                rows={almanac.longestLived
                  .map((r) => ({ p: idx.get(r.id), age: r.age }))
                  .filter((x): x is { p: Person; age: number } => !!x.p)
                  .map(({ p, age }) => ({ name: fullName(p), meta: t("print.ageYears", { age }) }))}
              />
              <AlmanacList
                title={t("book.livingOldestTitle")}
                rows={almanac.livingOldest
                  .map((r) => ({ p: idx.get(r.id), age: r.age }))
                  .filter((x): x is { p: Person; age: number } => !!x.p)
                  .map(({ p, age }) => ({ name: fullName(p), meta: t("print.ageYears", { age }) }))}
              />
              {famStats.surnames.length > 0 && (
                <AlmanacList
                  title={t("book.surnamesTitle")}
                  rows={famStats.surnames.map((s) => ({ name: s.name, meta: String(s.count) }))}
                />
              )}
            </div>
          </div>
        );
      case "places":
        return (
          <div className="font-serif h-full flex flex-col">
            <h2 className="text-center text-2xl font-bold mb-1">{t("book.placesTitle")}</h2>
            <p className="text-center text-sm opacity-60 mb-4">
              {t("book.placesSubtitle", { located: placeAgg.located.length, total: placeAgg.total })}
            </p>
            <BookMap located={placeAgg.located} maxCount={placeAgg.maxCount} />
          </div>
        );
      case "schema":
        return (
          <div className="font-serif h-full flex flex-col">
            <h2 className="text-center text-2xl font-bold mb-4">{t("book.schemaTitle")}</h2>
            <div className="flex-1 min-h-0 flex rounded-lg overflow-hidden border border-black/15 bg-current/[0.03]">
              <TreeSchema people={masked} />
            </div>
          </div>
        );
      case "matrix":
        return (
          <div className="font-serif">
            <h2 className="text-center text-2xl font-bold mb-1">{t("book.matrixTitle")}</h2>
            <p className="text-center text-xs opacity-60 mb-4 max-w-md mx-auto leading-relaxed">{t("book.matrixIntro")}</p>
            <RelationMatrix people={masked} />
          </div>
        );
      case "person":
        return (
          <div className="font-serif">
            <PersonPage person={pg.person} gen={pg.gen} idx={idx} masked={masked} t={t} />
          </div>
        );
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900/90 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 shrink-0 text-neutral-200">
        <p className="text-sm font-medium truncate">
          {familyName ? t("print.bookTitleNamed", { name: familyName }) : t("print.bookTitle")}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Sayfaya git / ara */}
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
          {/* Yazdır / PDF */}
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

      {/* Sayfaya git / ara panosu */}
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
                        <span className="text-[11px] text-neutral-400 tabular-nums shrink-0">
                          {t("book.pageN", { n: m.index + 1 })}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex items-center justify-center px-2 sm:px-8 pb-3">
        <div className="relative w-full max-w-6xl h-full max-h-[74vh] flex items-center justify-center">
          <NavArrow dir="prev" disabled={currentPage <= 0} onClick={() => flip("prev")} label={t("book.prevAria")} />

          <HTMLFlipBook
            ref={bookRef}
            className="mx-auto shadow-2xl"
            style={{}}
            startPage={0}
            size="stretch"
            width={520}
            height={720}
            minWidth={300}
            maxWidth={640}
            minHeight={420}
            maxHeight={900}
            drawShadow
            flippingTime={650}
            usePortrait
            startZIndex={0}
            autoSize
            maxShadowOpacity={0.5}
            showCover
            mobileScrollSupport
            clickEventForward
            useMouseEvents
            swipeDistance={30}
            showPageCorners
            disableFlipByClick
            onFlip={(e: { data: number }) => setCurrentPage(e.data)}
          >
            {pages.map((pg, i) => (
              <BookPage key={i} age={ageOf(pg)} hard={pg.kind === "cover"}>
                {renderContent(pg)}
              </BookPage>
            ))}
          </HTMLFlipBook>

          <NavArrow dir="next" disabled={currentPage >= total - 1} onClick={() => flip("next")} label={t("book.nextAria")} />
        </div>
      </div>

      <div className="shrink-0 text-center pb-3 text-neutral-300">
        <p className="text-xs tabular-nums">{t("book.page", { n: Math.min(currentPage + 1, total), total })}</p>
        <p className="hidden sm:block text-[11px] text-neutral-400 mt-0.5">{t("book.hint")}</p>
      </div>
    </div>,
    document.body
  );
}

/* ---------------------------------------------------------------- */

/** Tek kitap yaprağı — react-pageflip yaprağa ref bağlayabilsin diye forwardRef.
 *  Parşömen zemini + içerik kendi içinde kaydırılır (sabit sayfa boyutu). */
const BookPage = forwardRef<HTMLDivElement, { children: React.ReactNode; age: number; hard?: boolean }>(
  function BookPage({ children, age, hard }, ref) {
    return (
      <div
        ref={ref}
        className="book-leaf overflow-hidden"
        data-density={hard ? "hard" : "soft"}
        style={paperStyle(age)}
      >
        <div className="h-full overflow-y-auto px-6 sm:px-9 py-7">{children}</div>
      </div>
    );
  }
);

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

function PersonPage({
  person, gen, idx, masked, t,
}: {
  person: Person; gen: number; idx: ReturnType<typeof indexPeople>; masked: Person[]; t: ReturnType<typeof useT>;
}) {
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
    <div>
      <p className="text-center text-[11px] uppercase tracking-[0.2em] opacity-50 mb-5">{t("print.generation", { n: gen })}</p>
      {portrait && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={portrait} alt={fullName(person)} className="float-right ml-4 mb-2 w-24 h-32 sm:w-28 sm:h-36 object-cover rounded-md border border-black/10 bg-black/5" />
      )}
      <h2 className="text-xl sm:text-2xl font-semibold leading-tight">
        {fullName(person)}
      </h2>
      <p className="text-sm italic opacity-60 mt-1 mb-4">
        {span && <span>{span}</span>}
        {age !== null && <span> · {t("print.ageYears", { age })}</span>}
        {person.birthPlace && <span> · {person.birthPlace}</span>}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm mb-3">
        {person.occupation && <Row k={t("drawer.occupation")} v={person.occupation} />}
        {edu && <Row k={t("drawer.education")} v={edu} />}
        {parents.length > 0 && <Row k={t("print.parents")} v={names(parents)} wide />}
        {spouses.length > 0 && <Row k={t("print.spouses")} v={names(spouses)} wide />}
        {exes.length > 0 && <Row k={t("print.formerSpouses")} v={names(exes)} wide />}
        {children.length > 0 && <Row k={t("print.children")} v={names(children)} wide />}
      </dl>
      {person.bio && <p className="text-[15px] leading-relaxed text-justify whitespace-pre-line">{person.bio}</p>}
      {person.events && person.events.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {person.events.map((ev) => {
            const meta = LIFE_EVENT_TYPES[ev.type];
            return (
              <li key={ev.id} className="text-sm">
                <span className="opacity-40 tabular-nums">{ev.date?.slice(0, 4) ?? "—"}</span>{" "}
                {meta?.icon ?? "•"} {ev.title}
                {ev.place && <span className="opacity-60"> — {ev.place}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {person.memories?.some((m) => m.text) && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50 mb-1">{t("print.memories")}</p>
          {person.memories.filter((m) => m.text).map((m) => (
            <div key={m.id} className="text-sm mb-1.5">
              {m.prompt && <p className="italic opacity-60 leading-snug">{m.prompt}</p>}
              <p className="opacity-90 whitespace-pre-line leading-snug">{m.text}</p>
            </div>
          ))}
        </div>
      )}
      <div className="clear-both" />
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

/** Almanak listesi — başlık + isim/açıklama satırları. */
function AlmanacList({ title, rows }: { title: string; rows: Array<{ name: string; meta?: string | null }> }) {
  if (rows.length === 0) return null;
  return (
    <div>
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
