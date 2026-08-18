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

/**
 * Nostaljik aile kitabı (ekran) — sayfalar sağdan sola çevrilir (Madde 4).
 * Kapak → önsöz → kuşak kuşak kişiler; her kişi bir sayfa. Ok/klavye/kaydırma
 * ile gezilir. Gizlilik: maskeli kopya (`view`) kullanılır.
 */
export default function BookView({ people, familyName, onClose }: Props) {
  const { view } = usePrivacy();
  const t = useT();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  useEscapeKey(onClose);

  const masked = useMemo(() => people.map((p) => view(p)), [people, view]);
  const idx = useMemo(() => indexPeople(masked), [masked]);

  // Kuşak: en uzun ata zinciri (köksüz = 1)
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

  const yearRange = useMemo(() => {
    let from = Infinity, to = -Infinity;
    for (const p of masked) {
      const y = Number(p.birthDate?.slice(0, 4));
      if (Number.isFinite(y)) { if (y < from) from = y; if (y > to) to = y; }
    }
    return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
  }, [masked]);

  // Sayfalar: kapak + önsöz + kuşak sıralı kişiler
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
  const generations = useMemo(() => new Set([...genOf.values()]).size, [genOf]);

  const go = (d: "next" | "prev") => {
    setDir(d);
    setIndex((i) => Math.min(total - 1, Math.max(0, i + (d === "next" ? 1 : -1))));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go("next");
      else if (e.key === "ArrowLeft") go("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Dokunmatik kaydırma
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 45) go(dx < 0 ? "next" : "prev");
    touchX.current = null;
  };

  if (typeof document === "undefined") return null;
  const page = pages[index];

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-900/90 backdrop-blur-sm animate-fade-in">
      {/* Üst çubuk */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 shrink-0 text-neutral-200">
        <p className="text-sm font-medium truncate">
          {familyName ? t("print.bookTitleNamed", { name: familyName }) : t("print.bookTitle")}
        </p>
        <button
          onClick={onClose}
          className="h-9 px-4 rounded-xl border border-white/20 text-sm hover:bg-white/10 transition-colors"
        >
          {t("book.close")}
        </button>
      </div>

      {/* Kitap alanı */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-3 sm:px-6 pb-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="relative w-full max-w-2xl h-full max-h-[80vh] flex items-center">
          {/* Sol ok */}
          <NavArrow dir="prev" disabled={index === 0} onClick={() => go("prev")} label={t("book.prevAria")} />

          {/* Sayfa */}
          <div
            key={index}
            className={`book-paper book-paper-edge mx-10 sm:mx-14 flex-1 h-full rounded-xl overflow-hidden font-serif shadow-2xl ${
              dir === "next" ? "book-turn-next" : "book-turn-prev"
            }`}
          >
            <div className="h-full overflow-y-auto px-7 sm:px-12 py-8">
              {page.kind === "cover" && (
                <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center">
                  <p className="text-6xl mb-6">🌳</p>
                  <h1 className="text-4xl font-bold leading-tight mb-3">
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

              {page.kind === "foreword" && (
                <div>
                  <h2 className="text-center text-2xl font-bold mb-6">{t("print.forewordTitle")}</h2>
                  <p className="text-[15px] leading-relaxed text-justify first-letter:text-5xl first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:leading-[0.85]">
                    {t("print.foreword", { name: familyName ?? "", generations })}
                  </p>
                </div>
              )}

              {page.kind === "person" && <PersonPage person={page.person} gen={page.gen} idx={idx} masked={masked} t={t} />}
            </div>
          </div>

          {/* Sağ ok */}
          <NavArrow dir="next" disabled={index === total - 1} onClick={() => go("next")} label={t("book.nextAria")} />
        </div>
      </div>

      {/* Alt: sayfa numarası + ipucu */}
      <div className="shrink-0 text-center pb-3 text-neutral-300">
        <p className="text-xs tabular-nums">{t("book.page", { n: index + 1, total })}</p>
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
      className={`absolute ${dir === "prev" ? "left-0" : "right-0"} z-10 w-10 h-10 grid place-items-center rounded-full bg-white/10 text-neutral-100 hover:bg-white/20 disabled:opacity-25 disabled:cursor-default transition-colors`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function PersonPage({
  person,
  gen,
  idx,
  masked,
  t,
}: {
  person: Person;
  gen: number;
  idx: ReturnType<typeof indexPeople>;
  masked: Person[];
  t: ReturnType<typeof useT>;
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
      <p className="text-center text-[11px] uppercase tracking-[0.2em] opacity-50 mb-5">
        {t("print.generation", { n: gen })}
      </p>

      {portrait && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={portrait}
          alt={fullName(person)}
          className="float-right ml-4 mb-2 w-28 h-36 object-cover rounded-md border border-black/10 bg-black/5"
        />
      )}

      <h2 className="text-2xl font-semibold leading-tight">
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
