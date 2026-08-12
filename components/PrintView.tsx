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
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  familyName?: string;
  onClose: () => void;
}

/**
 * Yazdırılabilir "aile kitabı" — ekranda önizleme, `window.print()` ile kâğıda /
 * PDF'e. Uygulama gövdesi `@media print`'te gizlenir (globals.css), yalnızca
 * `.print-root` basılır. Araç çubuğu `print:hidden`. Gizlilik: maskeli kopya
 * (`view`) kullanılır, gizli yaşayan kişilerin tarih/foto/hikâyesi sızmaz.
 */
export default function PrintView({ people, familyName, onClose }: Props) {
  const { view } = usePrivacy();
  const t = useT();

  // Kitap yazdırma modunu işaretle — @media print yalnız .print-root'u basar
  // (görünüm yazdırma modundan `body.print-view` ile ayrılır).
  useEffect(() => {
    document.body.classList.add("print-book");
    return () => document.body.classList.remove("print-book");
  }, []);

  // Maskeli kopyalar üzerinden sırala ve indeksle.
  const masked = useMemo(() => people.map((p) => view(p)), [people, view]);
  const idx = useMemo(() => indexPeople(masked), [masked]);

  const ordered = useMemo(() => {
    const coll = new Intl.Collator("tr");
    return [...masked].sort((a, b) => {
      // Önce doğum yılına (bilinmeyen sona), sonra ada göre — kitap akışı gibi.
      const ay = a.birthDate?.slice(0, 4) ?? "9999";
      const by = b.birthDate?.slice(0, 4) ?? "9999";
      return ay.localeCompare(by) || coll.compare(fullName(a), fullName(b));
    });
  }, [masked]);

  const generations = useMemo(() => {
    // Kaba kuşak sayısı: köksüzlerden en uzun ata zinciri.
    let max = 0;
    const depthOf = (p: Person, seen: Set<string>): number => {
      if (seen.has(p.id)) return 0;
      seen.add(p.id);
      const parents = getParents(p, idx);
      if (parents.length === 0) return 1;
      return 1 + Math.max(...parents.map((pa) => depthOf(pa, seen)));
    };
    for (const p of masked) max = Math.max(max, depthOf(p, new Set()));
    return max;
  }, [masked, idx]);

  const names = (list: Person[]) => list.map((p) => fullName(p)).join(", ");

  if (typeof document === "undefined") return null;

  const eduLabel = (e?: string) =>
    e
      ? (EDUCATION_LEVELS as readonly string[]).includes(e)
        ? t(`education.${e}`)
        : e
      : undefined;

  return createPortal(
    <div className="print-root fixed inset-0 z-50 overflow-y-auto bg-white text-black">
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

      {/* Kitap içeriği */}
      <div className="mx-auto max-w-3xl px-6 sm:px-10 py-10 print:py-0 print:px-0">
        {/* Kapak */}
        <header className="print-cover text-center mb-10 pb-8 border-b border-neutral-300">
          <p className="text-5xl mb-4">🌳</p>
          <h1 className="font-serif text-3xl font-bold mb-2">
            {familyName ? t("print.bookTitleNamed", { name: familyName }) : t("print.bookTitle")}
          </h1>
          <p className="text-sm text-neutral-500">
            {t("print.coverMeta", { count: people.length, generations })}
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            {t("print.generatedOn", { date: new Date().toLocaleDateString("tr-TR") })}
          </p>
        </header>

        {/* Kişiler */}
        <div className="space-y-5">
          {ordered.map((p) => {
            const parents = getParents(p, idx);
            const spouses = getSpouses(p, idx);
            const exes = getFormerSpouses(p, idx);
            const children = getChildren(p, masked);
            const age = calcAge(p.birthDate, p.deathDate);
            const span = lifeSpan(p.birthDate, p.deathDate);
            const edu = eduLabel(p.education);
            return (
              <article key={p.id} className="print-entry break-inside-avoid border border-neutral-200 rounded-lg p-4">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <h2 className="font-serif text-lg font-semibold leading-tight">
                    {fullName(p)}
                    {p.deathDate && <span className="text-neutral-400 font-normal"> ✝</span>}
                  </h2>
                  {p.code && <span className="text-xs text-neutral-400 tabular-nums shrink-0">#{p.code}</span>}
                </div>

                <p className="text-sm text-neutral-600 mb-2">
                  {span && <span>{span}</span>}
                  {age !== null && <span> · {t("print.ageYears", { age })}</span>}
                  {p.birthPlace && <span> · {p.birthPlace}</span>}
                </p>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
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

                {p.bio && <p className="text-sm text-neutral-700 mt-2 whitespace-pre-line leading-snug">{p.bio}</p>}

                {p.events && p.events.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
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
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs font-semibold text-neutral-500">{t("print.memories")}</p>
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
              </article>
            );
          })}
        </div>
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
