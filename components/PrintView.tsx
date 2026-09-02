"use client";

import nextDynamic from "next/dynamic";
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
import { computeStats } from "@/lib/relations";
import { usePrivacy } from "./PrivacyContext";
import { useT, useLang } from "@/lib/i18n";
import { aggregatePlaces } from "@/lib/places";
import { generatePreface } from "@/lib/preface";
import { computeAlmanac } from "@/lib/book-stats";
import { ASSOCIATION_TYPES } from "@/types/family";
import { resolveAssociations } from "@/lib/associates";
import BookMap from "./BookMap";
import TreeSchema from "./TreeSchema";
import RelationMatrix from "./RelationMatrix";

/**
 * `qrcode` yalnız sesli anı olan bir sayfa çizilirken yüklensin — ana
 * pakete girmesi için hiçbir sebep yok.
 */
const AudioQr = nextDynamic(() => import("./AudioQr"), { ssr: false });

interface Props {
  people: Person[];
  /** TÜM kişiler (üye + çevre) — "Yakınları" bağlarını çözmek için. */
  allPeople?: Person[];
  familyName?: string;
  /** Aile kitabı kapak fotoğrafı — yazdırma kapağında da görünsün (#1). */
  coverPhoto?: string;
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
export default function PrintView({ people, allPeople, familyName, coverPhoto, onClose }: Props) {
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
  const maskedAll = useMemo(() => (allPeople ?? people).map((p) => view(p)), [allPeople, people, view]);
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

  // — Rakamlarla Aile (Madde 12) — Panel'deki sayısal detaylar kitaba taşınır.
  const stats = useMemo(() => computeStats(masked), [masked]);
  const almanac = useMemo(() => computeAlmanac(masked), [masked]);
  const placeAgg = useMemo(() => {
    const aggs = aggregatePlaces(masked);
    const located = aggs.filter((a) => a.coords);
    const maxCount = located.reduce((m, a) => Math.max(m, a.count), 1);
    return { located, maxCount, total: aggs.length };
  }, [masked]);

  const names = (list: Person[]) => list.map((p) => fullName(p)).join(", ");
  const portraitOf = (p: Person) => p.photo || p.photos?.[0];

  // Almanak listelerini (kimlik→maskeli kişi) çöz.
  const eldestPeople = almanac.eldest.map((id) => idx.get(id)).filter((x): x is Person => !!x);
  const livingOldestRows = almanac.livingOldest
    .map((r) => ({ p: idx.get(r.id), age: r.age }))
    .filter((x): x is { p: Person; age: number } => !!x.p);
  const longestLivedRows = almanac.longestLived
    .map((r) => ({ p: idx.get(r.id), age: r.age }))
    .filter((x): x is { p: Person; age: number } => !!x.p);

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
          {coverPhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={coverPhoto}
              alt=""
              className="print-cover-photo w-auto max-w-full max-h-[45vh] object-contain rounded-lg mb-8"
            />
          ) : (
            <p className="text-6xl mb-6">🌳</p>
          )}
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

        {/* — Rakamlarla Aile (Madde 12) — */}
        <section className="print-section break-before-page">
          <h2 className="text-center text-2xl font-bold mb-6">{t("book.almanacTitle")}</h2>

          {/* Ana sayılar */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <PrintStat label={t("book.stat.people")} value={stats.total} />
            <PrintStat label={t("book.stat.generations")} value={generations} />
            <PrintStat label={t("book.stat.living")} value={stats.living} />
            <PrintStat label={t("book.stat.deceased")} value={stats.deceased} />
            <PrintStat label={t("book.stat.male")} value={stats.male} />
            <PrintStat label={t("book.stat.female")} value={stats.female} />
          </div>

          {/* İkincil sayılar */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm mb-7">
            <Row k={t("panel.mini.marriages")} v={String(stats.marriages)} />
            <Row k={t("panel.mini.divorces")} v={String(stats.divorces)} />
            {stats.avgLifespan !== undefined && (
              <Row k={t("panel.mini.avgLifespan")} v={t("panel.mini.avgLifespanValue", { years: stats.avgLifespan })} />
            )}
            <Row k={t("panel.mini.largestSibship")} v={String(stats.largestSibship)} />
            {stats.oldestBirthYear !== undefined && (
              <Row k={t("panel.mini.oldestBirth")} v={String(stats.oldestBirthYear)} />
            )}
            {stats.topBirthPlace && (
              <Row k={t("panel.mini.topBirthPlace")} v={`${stats.topBirthPlace.name} (${stats.topBirthPlace.count})`} />
            )}
          </dl>

          {/* Kuşak dağılımı */}
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-2">{t("book.perGeneration")}</h3>
          <ul className="mb-7 space-y-1">
            {almanac.perGeneration.map((g) => (
              <li key={g.gen} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-neutral-600">{t("print.generation", { n: g.gen })}</span>
                <span className="flex-1 h-3 rounded-full bg-neutral-100 overflow-hidden">
                  <span
                    className="block h-full bg-neutral-400"
                    style={{ width: `${Math.round((g.count / Math.max(1, stats.total)) * 100)}%` }}
                  />
                </span>
                <span className="w-10 text-right tabular-nums text-neutral-700">{g.count}</span>
              </li>
            ))}
          </ul>

          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
            {/* En eski kuşak */}
            {eldestPeople.length > 0 && (
              <div className="break-inside-avoid">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-2">{t("book.eldestTitle")}</h3>
                <ul className="space-y-0.5">
                  {eldestPeople.map((p) => (
                    <PersonLine key={p.id} name={fullName(p)} meta={lifeSpan(p.birthDate, p.deathDate)} />
                  ))}
                </ul>
              </div>
            )}
            {/* En uzun yaşamışlar */}
            {longestLivedRows.length > 0 && (
              <div className="break-inside-avoid">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-2">{t("book.longestLivedTitle")}</h3>
                <ul className="space-y-0.5">
                  {longestLivedRows.map(({ p, age }) => (
                    <PersonLine key={p.id} name={fullName(p)} meta={t("print.ageYears", { age })} />
                  ))}
                </ul>
              </div>
            )}
            {/* Yaşayan en yaşlılar */}
            {livingOldestRows.length > 0 && (
              <div className="break-inside-avoid">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-2">{t("book.livingOldestTitle")}</h3>
                <ul className="space-y-0.5">
                  {livingOldestRows.map(({ p, age }) => (
                    <PersonLine key={p.id} name={fullName(p)} meta={t("print.ageYears", { age })} />
                  ))}
                </ul>
              </div>
            )}
            {/* Soyadları */}
            {stats.surnames.length > 0 && (
              <div className="break-inside-avoid">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-2">{t("book.surnamesTitle")}</h3>
                <ul className="space-y-0.5">
                  {stats.surnames.map((s) => (
                    <PersonLine key={s.name} name={s.name} meta={String(s.count)} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* — Aile Coğrafyası — doğum yerleri haritası (Madde 11; düz/portre) — */}
        {placeAgg.located.length > 0 && (
          <section className="print-section break-before-page flex flex-col">
            <h2 className="text-center text-2xl font-bold mb-1">{t("book.placesTitle")}</h2>
            <p className="text-center text-xs text-neutral-500 mb-3">
              {t("book.placesSubtitle", { located: placeAgg.located.length, total: placeAgg.total })}
            </p>
            <div className="h-[150mm] max-h-[68vh] flex">
              <BookMap located={placeAgg.located} maxCount={placeAgg.maxCount} />
            </div>
          </section>
        )}

        {/* — Soy Ağacı Şeması — diyagram (Madde 11; düz/portre) — */}
        {masked.length > 1 && (
          <section className="print-section break-before-page flex flex-col">
            <h2 className="text-center text-2xl font-bold mb-3">{t("book.schemaTitle")}</h2>
            <div className="h-[150mm] max-h-[68vh] flex">
              <TreeSchema people={masked} />
            </div>
          </section>
        )}

        {/* — Çapraz İlişki Rehberi (Madde 14) — */}
        {masked.length > 1 && (
          <section className="print-section break-before-page">
            <h2 className="text-center text-2xl font-bold mb-1">{t("book.matrixTitle")}</h2>
            <p className="text-center text-xs text-neutral-500 mb-4 max-w-md mx-auto leading-relaxed">{t("book.matrixIntro")}</p>
            <RelationMatrix people={masked} />
          </section>
        )}

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
                      {(() => {
                        const circle = resolveAssociations(p, maskedAll);
                        return circle.length > 0 ? (
                          <Row
                            k={t("drawer.associations")}
                            v={circle.map((c) => `${fullName(c.person)} (${ASSOCIATION_TYPES[c.type]?.label ?? c.type})`).join(", ")}
                            wide
                          />
                        ) : null;
                      })()}
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

                    {/* Anılar. Sesin KENDİSİ basılamaz ama ona giden yol basılır:
                       sesli anının yanındaki QR okutulunca kayıt açılır. Bu yüzden
                       yalnız sesli bırakılmış anılar da artık sayfaya giriyor. */}
                    {p.memories?.some((m) => m.text || m.audio) && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t("print.memories")}</p>
                        {p.memories
                          .filter((m) => m.text || m.audio)
                          .map((m) => (
                            <div key={m.id} className="text-sm flex gap-2 items-start">
                              <div className="min-w-0 flex-1">
                                {m.prompt && <p className="text-neutral-500 italic leading-snug">{m.prompt}</p>}
                                {m.text ? (
                                  <p className="text-neutral-700 whitespace-pre-line leading-snug">{m.text}</p>
                                ) : (
                                  <p className="text-neutral-500 italic leading-snug">{t("book.audioOnly")}</p>
                                )}
                              </div>
                              {m.audio && (
                                <span className="shrink-0 text-center">
                                  <AudioQr url={m.audio} />
                                  <span className="block text-[7px] uppercase tracking-wide text-neutral-400 mt-0.5">
                                    {t("book.listen")}
                                  </span>
                                </span>
                              )}
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

/** "Rakamlarla Aile" ana sayı kutusu. */
function PrintStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3 text-center break-inside-avoid">
      <p className="text-2xl font-bold tabular-nums leading-none text-neutral-900">{value.toLocaleString("tr")}</p>
      <p className="text-[11px] uppercase tracking-wide text-neutral-500 mt-1">{label}</p>
    </div>
  );
}

/** İsim + kısa açıklama (yaş ya da yaşam aralığı) satırı. */
function PersonLine({ name, meta }: { name: string; meta?: string | null }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-neutral-800 truncate min-w-0">{name}</span>
      {meta && <span className="text-neutral-500 tabular-nums shrink-0">{meta}</span>}
    </li>
  );
}
