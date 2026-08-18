"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import { calcAge, lifeSpan } from "@/lib/date";
import { getChildren, getParents, getSpouses, getFormerSpouses, indexPeople } from "@/lib/relations";
import { EDUCATION_LEVELS, LIFE_EVENT_TYPES } from "@/types/family";
import { usePrivacy } from "./PrivacyContext";
import useEscapeKey from "@/lib/useEscapeKey";
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  familyName?: string;
  onClose: () => void;
}

type Page =
  | { kind: "cover" }
  | { kind: "foreword" }
  | { kind: "person"; gen: number; person: Person };

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
 * Nostaljik aile kitabı (ekran) — açık kitap gibi YAN YANA İKİ SAYFA (dar
 * ekranda tek). Eski kuşaklar parşömen, yeni kuşaklar temiz kâğıt; kenarda
 * okunan/kalan sayfalar yığın gibi görünür (kitap kalınlığı). Sayfalar sağdan
 * sola çevrilir. Gizlilik: maskeli kopya (`view`).
 */
export default function BookView({ people, familyName, onClose }: Props) {
  const { view } = usePrivacy();
  const t = useT();
  const [index, setIndex] = useState(0);
  const [wide, setWide] = useState(false);
  useEscapeKey(onClose);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 720px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
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

  const yearRange = useMemo(() => {
    let from = Infinity, to = -Infinity;
    for (const p of masked) {
      const y = Number(p.birthDate?.slice(0, 4));
      if (Number.isFinite(y)) { if (y < from) from = y; if (y > to) to = y; }
    }
    return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
  }, [masked]);

  const pages = useMemo<Page[]>(() => {
    const coll = new Intl.Collator("tr");
    const ordered = [...masked].sort((a, b) => {
      const ga = genOf.get(a.id) ?? 1, gb = genOf.get(b.id) ?? 1;
      if (ga !== gb) return ga - gb;
      const ay = a.birthDate?.slice(0, 4) ?? "9999", by = b.birthDate?.slice(0, 4) ?? "9999";
      return ay.localeCompare(by) || coll.compare(fullName(a), fullName(b));
    });
    const p: Page[] = [{ kind: "cover" }, { kind: "foreword" }];
    for (const person of ordered) p.push({ kind: "person", gen: genOf.get(person.id) ?? 1, person });
    return p;
  }, [masked, genOf]);

  const total = pages.length;
  const step = wide ? 2 : 1;

  // Flipbook: çevrilen yaprak (eski sayfa) cilt ekseninde döner.
  const [leaf, setLeaf] = useState<{ half: "left" | "right" | "full"; front: Page | undefined; dir: "next" | "prev" } | null>(null);
  const leafTimer = useRef<number | null>(null);

  const go = (d: "next" | "prev") => {
    if (leaf) return; // çevirme sürerken yok say
    const oldIndex = index;
    const ni = Math.min(total - 1, Math.max(0, oldIndex + (d === "next" ? step : -step)));
    if (ni === oldIndex) return;
    // Çevrilen sayfanın ön yüzü (eski sayfa) ve hangi yarıyı kapladığı
    let half: "left" | "right" | "full";
    let front: Page | undefined;
    if (!wide) { half = "full"; front = pages[oldIndex]; }
    else if (d === "next") { half = "right"; front = pages[oldIndex + 1]; }
    else { half = "left"; front = pages[oldIndex]; }
    setIndex(ni);
    setLeaf({ half, front, dir: d });
    if (leafTimer.current) window.clearTimeout(leafTimer.current);
    leafTimer.current = window.setTimeout(() => setLeaf(null), 620);
  };

  useEffect(() => () => { if (leafTimer.current) window.clearTimeout(leafTimer.current); }, []);

  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goRef.current("next");
      else if (e.key === "ArrowLeft") goRef.current("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 45) go(dx < 0 ? "next" : "prev");
    touchX.current = null;
  };

  if (typeof document === "undefined") return null;

  const ageOf = (pg: Page | undefined): number => {
    if (!pg) return 1;
    if (pg.kind === "person") return maxGen > 1 ? (maxGen - pg.gen) / (maxGen - 1) : 0.5;
    return 1; // kapak/önsöz en eski his
  };

  // Yığın kalınlıkları (okunan sol, kalan sağ) — kitap kalınlığı hissi
  const leftStack = Math.min(46, index * 0.7 + 2);
  const rightStack = Math.min(46, (total - 1 - index) * 0.7 + 2);

  const left = pages[index];
  const right = wide ? pages[index + 1] : undefined;

  const renderPage = (pg: Page | undefined, side: "left" | "right") => {
    if (!pg) return <div className="flex-1" />;
    return (
      <div
        className={`book-paper-edge flex-1 h-full overflow-hidden ${side === "left" ? "rounded-l-md" : "rounded-r-md"}`}
        style={paperStyle(ageOf(pg))}
      >
        <div className="h-full overflow-y-auto px-6 sm:px-10 py-7">
          {pg.kind === "cover" && (
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
          )}
          {pg.kind === "foreword" && (
            <div className="font-serif">
              <h2 className="text-center text-2xl font-bold mb-6">{t("print.forewordTitle")}</h2>
              <p className="text-[15px] leading-relaxed text-justify first-letter:text-5xl first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:leading-[0.85]">
                {t("print.foreword", { name: familyName ?? "", generations })}
              </p>
            </div>
          )}
          {pg.kind === "person" && (
            <div className="font-serif">
              <PersonPage person={pg.person} gen={pg.gen} idx={idx} masked={masked} t={t} />
            </div>
          )}
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900/90 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 shrink-0 text-neutral-200">
        <p className="text-sm font-medium truncate">
          {familyName ? t("print.bookTitleNamed", { name: familyName }) : t("print.bookTitle")}
        </p>
        <button onClick={onClose} className="h-9 px-4 rounded-xl border border-white/20 text-sm hover:bg-white/10 transition-colors">
          {t("book.close")}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-2 sm:px-6 pb-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="relative w-full max-w-4xl h-full max-h-[82vh] flex items-center">
          <NavArrow dir="prev" disabled={index === 0} onClick={() => go("prev")} label={t("book.prevAria")} />

          {/* Kitap: [okunan yığın][sol sayfa][cilt][sağ sayfa][kalan yığın] */}
          <div className="mx-9 sm:mx-12 flex-1 h-full flex items-stretch justify-center">
            {/* Okunan sayfalar (sol yığın) */}
            <div
              className="shrink-0 h-[94%] my-auto rounded-l-md"
              style={{
                width: leftStack,
                background: "repeating-linear-gradient(90deg, #d8c7a4, #d8c7a4 1px, #efe4cc 1px, #efe4cc 3px)",
                boxShadow: "inset 2px 0 6px rgba(0,0,0,0.12)",
              }}
              aria-hidden
            />

            <div className="book-scene relative flex-1 h-full flex shadow-2xl">
              {renderPage(left, "left")}
              {wide && <div className="w-px bg-black/20 shrink-0" aria-hidden />}
              {wide && renderPage(right, "right")}

              {/* Çevrilen yaprak — ön yüz eski sayfa, arka yüz parşömen alt yüzü */}
              {leaf && (
                <div
                  className={`leaf ${leaf.dir === "next" ? "leaf-next" : "leaf-prev"}`}
                  style={
                    leaf.half === "full"
                      ? { left: 0, right: 0 }
                      : leaf.half === "right"
                      ? { left: "50%", right: 0 }
                      : { left: 0, right: "50%" }
                  }
                >
                  <div className="leaf-face flex">{renderPage(leaf.front, leaf.half === "left" ? "right" : "left")}</div>
                  <div
                    className="leaf-face leaf-back"
                    style={paperStyle(0.55)}
                  >
                    <div className="leaf-shadow" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.12), transparent 40%)" }} />
                  </div>
                </div>
              )}
            </div>

            {/* Kalan sayfalar (sağ yığın) */}
            <div
              className="shrink-0 h-[94%] my-auto rounded-r-md"
              style={{
                width: rightStack,
                background: "repeating-linear-gradient(90deg, #efe4cc, #efe4cc 1px, #d8c7a4 1px, #d8c7a4 3px)",
                boxShadow: "inset -2px 0 6px rgba(0,0,0,0.12)",
              }}
              aria-hidden
            />
          </div>

          <NavArrow dir="next" disabled={index >= total - 1} onClick={() => go("next")} label={t("book.nextAria")} />
        </div>
      </div>

      <div className="shrink-0 text-center pb-3 text-neutral-300">
        <p className="text-xs tabular-nums">{t("book.page", { n: Math.min(index + 1, total), total })}</p>
        <p className="hidden sm:block text-[11px] text-neutral-400 mt-0.5">{t("book.hint")}</p>
      </div>
    </div>,
    document.body
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
        {person.deathDate && <span className="opacity-40 font-normal"> ✝</span>}
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
