"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import { calcAge, lifeSpan } from "@/lib/date";
import {
  getChildren,
  getParents,
  getSpouses,
  getFormerSpouses,
  indexPeople,
} from "@/lib/relations";
import { EDUCATION_LEVELS, LIFE_EVENT_TYPES } from "@/types/family";
import { usePrivacy } from "./PrivacyContext";
import { useT, useLang } from "@/lib/i18n";
import { aggregatePlaces } from "@/lib/places";
import { generatePreface } from "@/lib/preface";

interface Props {
  people: Person[];
  familyName?: string;
  onClose: () => void;
}

/**
 * Yazdırılabilir "aile kitabı" — gerçek bir kitap gibi kurgulanır: kapak,
 * önsöz, içindekiler ve kuşak kuşak bölümler. Her kişi bir biyografi girdisi;
 * varsa portre fotoğrafı metnin yanında akar. Ekranda önizleme, `window.print()`
 * ile kâğıda / PDF'e. Uygulama gövdesi `@media print`'te gizlenir (globals.css),
 * yalnızca `.print-root` basılır. Gizlilik: maskeli kopya (`view`) kullanılır —
 * gizli yaşayan kişilerin tarih/foto/hikâyesi sızmaz (maskeli kopyada foto yok).
 */
export default function PrintView({ people, familyName, onClose }: Props) {
  const { view } = usePrivacy();
  const t = useT();
  const { lang } = useLang();

  // Kitap yazdırma modunu işaretle — @media print yalnız .print-root'u basar
  // (görünüm yazdırma modundan `body.print-view` ile ayrılır).
  useEffect(() => {
    document.body.classList.add("print-book");
    return () => document.body.classList.remove("print-book");
  }, []);

  // Maskeli kopyalar üzerinden sırala ve indeksle.
  const masked = useMemo(() => people.map((p) => view(p)), [people, view]);
  const idx = useMemo(() => indexPeople(masked), [masked]);

  // Kişinin kuşağı: en uzun ata zincirinin uzunluğu (köksüz = 1).
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

  // Kuşaklara böl; her kuşağı doğum yılına, sonra ada göre sırala (kitap akışı).
  const chapters = useMemo(() => {
    const coll = new Intl.Collator("tr");
    const byGen = new Map<number, Person[]>();
    for (const p of masked) {
      const g = genOf.get(p.id) ?? 1;
      const arr = byGen.get(g);
      if (arr) arr.push(p);
      else byGen.set(g, [p]);
    }
    return [...byGen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gen, list]) => ({
        gen,
        people: list.sort((a, b) => {
          const ay = a.birthDate?.slice(0, 4) ?? "9999";
          const by = b.birthDate?.slice(0, 4) ?? "9999";
          return ay.localeCompare(by) || coll.compare(fullName(a), fullName(b));
        }),
      }));
  }, [masked, genOf]);

  const generations = chapters.length;

  // Kapak için yıl aralığı (bilinen en erken–en geç doğum yılı).
  const yearRange = useMemo(() => {
    let from = Infinity;
    let to = -Infinity;
    for (const p of masked) {
      const y = Number(p.birthDate?.slice(0, 4));
      if (Number.isFinite(y)) {
        if (y < from) from = y;
        if (y > to) to = y;
      }
    }
    return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
  }, [masked]);

  // Önsöz — kitapla aynı üretici (yıl aralığı + en sık şehirler + tarih).
  const topPlaces = useMemo(
    () => [...aggregatePlaces(masked)].sort((a, b) => b.count - a.count).slice(0, 5).map((a) => a.place),
    [masked]
  );
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

  const names = (list: Person[]) => list.map((p) => fullName(p)).join(", ");
  const portraitOf = (p: Person) => p.photo || p.photos?.[0];

  if (typeof document === "undefined") return null;

  const eduLabel = (e?: string) =>
    e
      ? (EDUCATION_LEVELS as readonly string[]).includes(e)
        ? t(`education.${e}`)
        : e
      : undefined;

  return createPortal(
    <div className="print-root fixed inset-0 z-50 overflow-y-auto bg-neutral-100 text-black">
      {/* Araç çubuğu — yazdırmada gizli */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <p className="text-sm font-medium text-neutral-700">{t("print.previewTitle")}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="h-9 px-4 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 transition-colors"
          >
            {t("print.action")}
          </button>
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-neutral-300 text-neutral-700 text-sm hover:bg-neutral-100 transition-colors"
          >
            {t("print.close")}
          </button>
        </div>
      </div>

      {/* Kitap sayfası — ekranda beyaz bir "sayfa", yazdırmada tam sayfa */}
      <div className="print-page mx-auto my-6 print:my-0 max-w-3xl bg-white text-black shadow-lg print:shadow-none px-8 sm:px-14 py-14 print:py-0 print:px-0 font-serif">
        {/* — Kapak sayfası — */}
        <header className="print-cover flex min-h-[70vh] print:min-h-screen flex-col items-center justify-center text-center">
          <p className="text-6xl mb-6">🌳</p>
          <h1 className="text-4xl font-bold leading-tight mb-3">
            {familyName ? t("print.bookTitleNamed", { name: familyName }) : t("print.bookTitle")}
          </h1>
          {yearRange && (
            <p className="text-lg text-neutral-500 tracking-wide mb-6">
              {t("print.coverYears", { from: yearRange.from, to: yearRange.to })}
            </p>
          )}
          <div className="w-16 border-t border-neutral-300 my-6" />
          <p className="text-sm text-neutral-500">
            {t("print.coverMeta", { count: people.length, generations })}
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            {t("print.generatedOn", { date: new Date().toLocaleDateString("tr-TR") })}
          </p>
        </header>

        {/* — Önsöz — */}
        <section className="print-section break-before-page">
          <h2 className="text-center text-2xl font-bold mb-6">{t("print.forewordTitle")}</h2>
          {preface.map((para, i) => (
            <p
              key={i}
              className={`text-[15px] leading-relaxed text-justify text-neutral-800 mb-3 ${
                i === 0
                  ? "first-letter:text-5xl first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:leading-[0.85]"
                  : ""
              }`}
            >
              {para}
            </p>
          ))}
        </section>

        {/* — Kuşak bölümleri — */}
        {chapters.map((c) => (
          <section key={c.gen} className="print-section break-before-page">
            <h2 className="print-chapter text-center text-2xl font-bold mb-8">
              {t("print.generation", { n: c.gen })}
            </h2>

            <div className="space-y-8">
              {c.people.map((p) => {
                const parents = getParents(p, idx);
                const spouses = getSpouses(p, idx);
                const exes = getFormerSpouses(p, idx);
                const children = getChildren(p, masked);
                const age = calcAge(p.birthDate, p.deathDate);
                const span = lifeSpan(p.birthDate, p.deathDate);
                const edu = eduLabel(p.education);
                const portrait = portraitOf(p);
                return (
                  <article key={p.id} className="print-entry break-inside-avoid border-b border-neutral-200 pb-8 last:border-0">
                    {/* Portre — varsa metnin soluna akar */}
                    {portrait && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={portrait}
                        alt={fullName(p)}
                        className="print-photo float-left mr-4 mb-2 w-28 h-36 object-cover rounded-md border border-neutral-200 bg-neutral-100"
                      />
                    )}

                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <h3 className="text-xl font-semibold leading-tight">
                        {fullName(p)}
                        {p.deathDate && <span className="text-neutral-400 font-normal"> ✝</span>}
                      </h3>
                      {p.code && <span className="text-xs text-neutral-400 tabular-nums shrink-0">#{p.code}</span>}
                    </div>

                    <p className="text-sm italic text-neutral-500 mb-3">
                      {span && <span>{span}</span>}
                      {age !== null && <span> · {t("print.ageYears", { age })}</span>}
                      {p.birthPlace && <span> · {p.birthPlace}</span>}
                    </p>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm mb-2">
                      {p.occupation && <Row k={t("drawer.occupation")} v={p.occupation} />}
                      {edu && <Row k={t("drawer.education")} v={edu} />}
                      {p.ethnicity && <Row k={t("drawer.ethnicity")} v={p.ethnicity} />}
                      {p.nationality && <Row k={t("drawer.nationality")} v={p.nationality} />}
                      {p.religion && <Row k={t("drawer.religion")} v={p.religion} />}
                      {p.language && <Row k={t("drawer.language")} v={p.language} />}
                      {parents.length > 0 && <Row k={t("print.parents")} v={names(parents)} wide />}
                      {spouses.length > 0 && <Row k={t("print.spouses")} v={names(spouses)} wide />}
                      {exes.length > 0 && <Row k={t("print.formerSpouses")} v={names(exes)} wide />}
                      {children.length > 0 && <Row k={t("print.children")} v={names(children)} wide />}
                    </dl>

                    {p.bio && (
                      <p className="text-[15px] text-neutral-800 mt-2 whitespace-pre-line leading-relaxed text-justify">
                        {p.bio}
                      </p>
                    )}

                    {p.events && p.events.length > 0 && (
                      <ul className="mt-3 space-y-0.5">
                        {p.events.map((ev) => {
                          const meta = LIFE_EVENT_TYPES[ev.type];
                          return (
                            <li key={ev.id} className="text-sm text-neutral-700">
                              <span className="text-neutral-400 tabular-nums">{ev.date?.slice(0, 4) ?? "—"}</span>{" "}
                              {meta?.icon ?? "•"} {ev.title}
                              {ev.place && <span className="text-neutral-500"> — {ev.place}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {/* Yazılı anılar — ses basılamaz, bu yüzden yalnız metin. */}
                    {p.memories?.some((m) => m.text) && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t("print.memories")}</p>
                        {p.memories
                          .filter((m) => m.text)
                          .map((m) => (
                            <div key={m.id} className="text-sm">
                              {m.prompt && <p className="text-neutral-500 italic leading-snug">{m.prompt}</p>}
                              <p className="text-neutral-700 whitespace-pre-line leading-snug">{m.text}</p>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Metni fotoğrafın altına taşımamak için akışı temizle */}
                    <div className="clear-both" />
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>,
    document.body
  );
}

function Row({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={`flex gap-1.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-neutral-400 shrink-0">{k}:</dt>
      <dd className="text-neutral-800">{v}</dd>
    </div>
  );
}
