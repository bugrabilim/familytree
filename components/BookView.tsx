"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import { calcAge, lifeSpan } from "@/lib/date";
import { getChildren, getParents, getSpouses, getFormerSpouses, indexPeople } from "@/lib/relations";
import { aggregatePlaces, projectEquirectangular } from "@/lib/places";
import { COUNTRIES, WORLD_VIEWBOX } from "@/lib/world-map";
import { EDUCATION_LEVELS, LIFE_EVENT_TYPES } from "@/types/family";
import { usePrivacy } from "./PrivacyContext";
import useEscapeKey from "@/lib/useEscapeKey";
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  familyName?: string;
  onClose: () => void;
  /** "Yazdır / PDF" — bası görünümünü (PrintView) açar (Madde 5). */
  onPrint?: () => void;
}

type Page =
  | { kind: "cover" }
  | { kind: "foreword" }
  | { kind: "places" }
  | { kind: "person"; gen: number; person: Person };

/**
 * Sayfa çevirme sesi (Madde 2) — kısa, sentezlenmiş "kâğıt hışırtısı".
 * Dış ses dosyası yok: Web Audio ile filtrelenmiş gürültü patlaması üretilir
 * (CSP güvenli). AudioContext ilk kullanımda, kullanıcı etkileşimiyle açılır.
 */
let _actx: AudioContext | null = null;
function playFlip() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!_actx) _actx = new AC();
    const ctx = _actx;
    if (ctx.state === "suspended") void ctx.resume();
    const dur = 0.22;
    const rate = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(rate * dur), rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      // Zarf: hızlı yüksel, yavaş sön — sayfanın "fışş" sesi.
      const env = Math.pow(1 - t, 2.2) * Math.min(1, t * 12);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.28;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start();
  } catch {
    /* ses üretilemezse sessizce geç */
  }
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
 * Nostaljik aile kitabı (ekran) — açık kitap gibi YAN YANA İKİ SAYFA (dar
 * ekranda tek). Eski kuşaklar parşömen, yeni kuşaklar temiz kâğıt; kenarda
 * okunan/kalan sayfalar yığın gibi görünür (kitap kalınlığı). Sayfalar sağdan
 * sola çevrilir. Gizlilik: maskeli kopya (`view`).
 */
export default function BookView({ people, familyName, onClose, onPrint }: Props) {
  const { view } = usePrivacy();
  const t = useT();
  const [index, setIndex] = useState(0);
  const [wide, setWide] = useState(false);
  const [muted, setMuted] = useState(false);
  const [goTo, setGoTo] = useState(false); // "sayfaya git" / arama panosu açık mı
  const [query, setQuery] = useState("");
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

  // Doğum yerleri — kitaba statik dünya haritası sayfası (Madde 8). Gizlilik:
  // maskeli kopyadan türetildiği için gizli yaşayanların doğum yeri sızmaz.
  const placeAgg = useMemo(() => {
    const aggs = aggregatePlaces(masked);
    const located = aggs.filter((a) => a.coords);
    const maxCount = located.reduce((m, a) => Math.max(m, a.count), 1);
    return { located, maxCount, total: aggs.length };
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
    if (placeAgg.located.length > 0) p.push({ kind: "places" });
    for (const person of ordered) p.push({ kind: "person", gen: genOf.get(person.id) ?? 1, person });
    return p;
  }, [masked, genOf, placeAgg.located.length]);

  const total = pages.length;
  const step = wide ? 2 : 1;

  // Ada ya da yıla göre ara → sayfa numarasını bul (Madde 4).
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
    if (!muted) playFlip();
    if (leafTimer.current) window.clearTimeout(leafTimer.current);
    leafTimer.current = window.setTimeout(() => setLeaf(null), 620);
  };

  // Belirli bir sayfaya atla (Madde 3/4) — çift-sayfa modunda çift indekse hizala.
  // Sayfaya atlarken çevirme animasyonu yok; varsa süren yaprak temizlenir
  // (bekleyen zamanlayıcı zararsızca sönümlenir).
  const jump = (target: number) => {
    const clamped = Math.min(total - 1, Math.max(0, target));
    const aligned = wide ? clamped - (clamped % 2) : clamped;
    if (aligned === index) return;
    setLeaf(null);
    setIndex(aligned);
    if (!muted) playFlip();
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
          {pg.kind === "places" && (
            <div className="font-serif h-full flex flex-col">
              <h2 className="text-center text-2xl font-bold mb-1">{t("book.placesTitle")}</h2>
              <p className="text-center text-sm opacity-60 mb-4">
                {t("book.placesSubtitle", { located: placeAgg.located.length, total: placeAgg.total })}
              </p>
              <BookMap located={placeAgg.located} maxCount={placeAgg.maxCount} />
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
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Sayfaya git / ara (Madde 3-4) */}
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
          {/* Sayfa çevirme sesi aç/kapat (Madde 2) */}
          <button
            onClick={() => setMuted((m) => !m)}
            aria-pressed={!muted}
            title={muted ? t("book.soundOff") : t("book.soundOn")}
            className="h-9 w-9 grid place-items-center rounded-xl border border-white/20 text-sm hover:bg-white/10 transition-colors"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              {muted ? (
                <path d="M17 9l4 6M21 9l-4 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M16.5 8.5a5 5 0 010 7M18.5 6a8 8 0 010 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
          {/* Yazdır / PDF (Madde 5) */}
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
                      if (Number.isFinite(n)) jump(n - 1);
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
                        onClick={() => { jump(m.index); setGoTo(false); setQuery(""); }}
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

/**
 * Kitap içi statik doğum-yeri haritası (Madde 8). Etkileşimsiz; noktaları
 * çevreleyen kırpma kutusuyla ilgili bölgeye odaklanır. Gömülü Natural Earth
 * sınırları (lib/world-map) — dış istek yok.
 */
function BookMap({
  located,
  maxCount,
}: {
  located: ReturnType<typeof aggregatePlaces>;
  maxCount: number;
}) {
  const VW = WORLD_VIEWBOX.w;
  const VH = WORLD_VIEWBOX.h;
  const dots = located
    .filter((a) => a.coords)
    .map((a) => {
      const { x, y } = projectEquirectangular(a.coords!.lat, a.coords!.lng, VW, VH);
      return { a, x, y };
    });

  // En büyük 8 yer etiketlenir (kalabalık olmasın).
  const labelSet = new Set(
    [...located].sort((a, b) => b.count - a.count).slice(0, 8).map((a) => a.place)
  );

  // Noktaları çevreleyen kırpma kutusu — kenar payıyla bölgeye odaklan.
  let minX: number = VW, minY: number = VH, maxX = 0, maxY = 0;
  for (const d of dots) {
    minX = Math.min(minX, d.x); minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x); maxY = Math.max(maxY, d.y);
  }
  if (dots.length === 0) { minX = 0; minY = 0; maxX = VW; maxY = VH; }
  const padX = Math.max(70, (maxX - minX) * 0.3);
  const padY = Math.max(50, (maxY - minY) * 0.4);
  const bx = Math.max(0, minX - padX);
  const by = Math.max(0, minY - padY);
  const bw = Math.min(VW - bx, maxX - minX + padX * 2);
  const bh = Math.min(VH - by, maxY - minY + padY * 2);
  const scale = bw / VW; // etiket/çizgi ölçeğini kutuyla orantıla
  const rOf = (c: number) => (3 + 7 * Math.sqrt(c / maxCount)) * Math.max(0.5, scale);

  return (
    <div
      className="flex-1 min-h-0 rounded-lg overflow-hidden border border-black/15"
      style={{ background: "rgba(120,150,170,0.14)" }}
    >
      <svg viewBox={`${bx} ${by} ${bw} ${bh}`} className="w-full h-full block" role="img">
        <g fill="rgba(120,95,60,0.30)" stroke="rgba(90,70,45,0.55)" strokeWidth={0.6 * scale} strokeLinejoin="round">
          {COUNTRIES.map((c, i) => (
            <path key={i} d={c.d} />
          ))}
        </g>
        {dots.map(({ a, x, y }) => {
          const r = rOf(a.count);
          return (
            <g key={a.place}>
              <circle cx={x} cy={y} r={r} fill="rgba(150,40,30,0.5)" stroke="rgba(120,30,20,0.9)" strokeWidth={0.5 * scale} />
              <circle cx={x} cy={y} r={Math.max(0.6, 1.4 * scale)} fill="rgba(90,20,15,0.95)" />
              {labelSet.has(a.place) && (
                <text
                  x={x}
                  y={y - r - 3 * scale}
                  textAnchor="middle"
                  fontSize={9 * scale}
                  fontWeight={600}
                  fill="rgba(74,58,40,0.95)"
                >
                  {a.place.split(",")[0]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
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
