"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import { fullName } from "@/lib/name";
import { usePrivacy } from "./PrivacyContext";
import {
  aggregatePlaces,
  projectEquirectangular,
  GAZETTEER,
} from "@/lib/places";
import { COUNTRIES, WORLD_VIEWBOX } from "@/lib/world-map";
import { useLang, useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  onSelect: (id: string) => void;
}

/** SVG tuval boyutu — TÜM DÜNYA penceresi (lib/world-map.ts ile birebir). */
const VW = WORLD_VIEWBOX.w; // 1000
const VH = WORLD_VIEWBOX.h; // 403

/** Zoom sınırları: k = VW / view.w (k=1 → tüm dünya). */
const MIN_W = VW / 14; // en fazla ~14× yakınlaşma
const MAX_W = VW; // tüm dünyadan daha fazla uzaklaşma yok

/** GAZETTEER'de şehir değil, ülke yedeği olan anahtarlar (nokta basma). */
const COUNTRY_FALLBACK_KEYS = new Set([
  "Almanya",
  "Somali",
  "Sudan",
  "Venezuela",
  "Gana",
  "Kenya",
  "Brezilya",
]);

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL: Box = { x: 0, y: 0, w: VW, h: VH };

export default function PlacesMap({ people, onSelect }: Props) {
  const { view: priv } = usePrivacy();
  const t = useT();
  const { lang } = useLang();
  const [activePlace, setActivePlace] = useState<string | null>(null);
  const [showMigration, setShowMigration] = useState(false);

  // Doğum yılı sınırları + dönem (era) süzgeci — haritayı zamanda daralt.
  const yearBounds = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const p of people) {
      const y = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : NaN;
      if (Number.isFinite(y)) { mn = Math.min(mn, y); mx = Math.max(mx, y); }
    }
    return mn === Infinity || mn === mx ? null : { min: mn, max: mx };
  }, [people]);

  const [era, setEra] = useState<[number, number] | null>(null);
  const a0 = era ? era[0] : yearBounds?.min ?? null;
  const a1 = era ? era[1] : yearBounds?.max ?? null;

  // Dönem süzgeci uygulanmış kişiler (tarihsizler daima dâhil).
  const eraFiltered = useMemo(() => {
    if (a0 === null || a1 === null || !yearBounds || (a0 <= yearBounds.min && a1 >= yearBounds.max))
      return people;
    return people.filter((p) => {
      const y = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : NaN;
      return !Number.isFinite(y) || (y >= a0 && y <= a1);
    });
  }, [people, a0, a1, yearBounds]);

  // GİZLİLİK: kişileri görüntü katmanından geçir; maskeli (gizli yaşayan)
  // kişide `birthPlace` bulunmadığından doğum yeri sızmaz.
  const aggregates = useMemo(
    () => aggregatePlaces(eraFiltered.map((p) => priv(p))),
    [eraFiltered, priv]
  );

  const located = useMemo(() => aggregates.filter((a) => a.coords), [aggregates]);
  const unlocated = useMemo(() => aggregates.filter((a) => !a.coords), [aggregates]);

  // Kişi → doğum yeri koordinatı (maskeli aggregate'lerden → gizlilik korunur).
  const personCoord = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const a of located) if (a.coords) for (const id of a.personIds) m.set(id, a.coords);
    return m;
  }, [located]);

  // Göç yolları — ebeveyn doğum yeri → çocuk doğum yeri (farklıysa). Yinelenen
  // aynı yol kalınlaşır. Gizli kişiler koordinatsız olduğundan otomatik dışlanır.
  const migrations = useMemo(() => {
    const map = new Map<string, { from: { lat: number; lng: number }; to: { lat: number; lng: number }; n: number }>();
    for (const p of eraFiltered) {
      const c = personCoord.get(p.id);
      if (!c) continue;
      for (const pid of p.parentIds ?? []) {
        const pc = personCoord.get(pid);
        if (!pc || (pc.lat === c.lat && pc.lng === c.lng)) continue;
        const key = `${pc.lat},${pc.lng}>${c.lat},${c.lng}`;
        const e = map.get(key);
        if (e) e.n++;
        else map.set(key, { from: pc, to: c, n: 1 });
      }
    }
    return [...map.values()];
  }, [eraFiltered, personCoord]);

  const maxCount = useMemo(
    () => located.reduce((m, a) => Math.max(m, a.count), 1),
    [located]
  );

  // id → kişi (maskeli) — yan listede göstermek için
  const byId = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of people) m.set(p.id, priv(p));
    return m;
  }, [people, priv]);

  const active = useMemo(
    () => located.find((a) => a.place === activePlace) ?? null,
    [located, activePlace]
  );

  // Referans şehirler (GAZETTEER) — ülke yedekleri hariç, önceden projeksiyonlu.
  const refCities = useMemo(() => {
    return Object.entries(GAZETTEER)
      .filter(([name]) => !COUNTRY_FALLBACK_KEYS.has(name))
      .map(([name, c]) => {
        const { x, y } = projectEquirectangular(c.lat, c.lng, VW, VH);
        return { name, x, y };
      });
  }, []);

  // Doğum yeri noktaları — önceden projeksiyonlu.
  const dots = useMemo(
    () =>
      located.map((a) => {
        const { x, y } = projectEquirectangular(a.coords!.lat, a.coords!.lng, VW, VH);
        return { a, x, y };
      }),
    [located]
  );

  /* ---------------- Zoom + Pan durumu ---------------- */
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [box, setBox] = useState<Box>(FULL);
  const boxRef = useRef<Box>(FULL);
  // Olay işleyicileri (zoom/pan) güncel kutuyu okuyabilsin diye ref'i senkronla.
  useEffect(() => {
    boxRef.current = box;
  }, [box]);

  const k = VW / box.w; // yakınlaşma katsayısı
  /** viewBox birimini sabit ekran boyutuna çevir (px tabanı / k). */
  const s = useCallback((px: number) => px / k, [k]);

  const clamp = useCallback((b: Box): Box => {
    const w = Math.min(MAX_W, Math.max(MIN_W, b.w));
    const h = w * (VH / VW);
    const x = Math.min(Math.max(0, b.x), VW - w);
    const y = Math.min(Math.max(0, b.y), VH - h);
    return { x, y, w, h };
  }, []);

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const b = boxRef.current;
      const targetW = b.w / factor;
      const w = Math.min(MAX_W, Math.max(MIN_W, targetW));
      const h = w * (VH / VW);
      // İmleç altındaki dünya noktası sabit kalsın.
      const wx = b.x + px * b.w;
      const wy = b.y + py * b.h;
      setBox(clamp({ x: wx - px * w, y: wy - py * h, w, h }));
    },
    [clamp]
  );

  // Fare tekerleği — sayfayı kaydırmadan yakınlaştır (passive:false gerekir).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const factor = Math.exp(-e.deltaY * 0.0015);
      zoomAt(factor, Math.min(1, Math.max(0, px)), Math.min(1, Math.max(0, py)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Sürükleyerek gezinme (pan) — pointer olayları (fare + dokunma).
  const drag = useRef<{ id: number; sx: number; sy: number; moved: boolean } | null>(
    null
  );
  const didPan = useRef(false);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    didPan.current = false;
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 3) {
      d.moved = true;
      didPan.current = true;
    }
    if (!d.moved) return;
    d.sx = e.clientX;
    d.sy = e.clientY;
    const b = boxRef.current;
    setBox(
      clamp({
        ...b,
        x: b.x - (dx / rect.width) * b.w,
        y: b.y - (dy / rect.height) * b.h,
      })
    );
  };
  const endPan = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id === e.pointerId) {
      svgRef.current?.releasePointerCapture?.(e.pointerId);
      drag.current = null;
    }
  };

  const zoomButton = (factor: number) => {
    zoomAt(factor, 0.5, 0.5);
  };
  const resetView = () => setBox(FULL);

  // Bir yeri merkeze alıp yakınlaştır (yan panelden seçince).
  const focusPlace = useCallback(
    (place: string) => {
      setActivePlace(place);
      const d = dots.find((x) => x.a.place === place);
      if (!d) return;
      const w = Math.max(MIN_W, VW / 5);
      const h = w * (VH / VW);
      setBox(clamp({ x: d.x - w / 2, y: d.y - h / 2, w, h }));
    },
    [dots, clamp]
  );

  /* ---------------- Kademeli detay eşikleri ---------------- */
  const showCountryNames = k >= 1.9;
  const showCities = k >= 3.5;
  // Zoom arttıkça daha çok (küçük) ülke etiketi görünür.
  const nameRankMax = k < 2.6 ? 2 : k < 3.5 ? 3 : k < 5 ? 5 : 9;

  const radiusOf = (count: number) => 5 + 9 * Math.sqrt(count / maxCount); // ekran px tabanı

  if (people.length === 0 || aggregates.length === 0) {
    return (
      <div className="h-full grid place-items-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-3">🗺️</p>
          <h2 className="font-serif text-xl font-semibold text-text mb-1.5">{t("map.emptyTitle")}</h2>
          <p className="text-sm text-text-muted">{t("map.emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold text-text">{t("map.title")}</h1>
            <p className="text-sm text-text-muted">
              {t("map.subtitle", { located: located.length, total: aggregates.length })}
            </p>
          </div>
          <p className="text-[11px] text-text-subtle shrink-0 hidden sm:block">
            {t("map.navHint")}
          </p>
        </div>

        {/* Denetimler — göç yolları + dönem süzgeci */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={() => setShowMigration((v) => !v)}
            aria-pressed={showMigration}
            className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
              showMigration
                ? "border-accent bg-accent-soft text-accent"
                : "border-border bg-surface hover:bg-surface-2 text-text-muted"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 19c6-1 8-13 14-14M13 5h6v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("map.migration")}
            {showMigration && migrations.length > 0 && <span className="tabular-nums">· {migrations.length}</span>}
          </button>

          {yearBounds && a0 !== null && a1 !== null && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="shrink-0">{t("map.era")}</span>
              <input
                type="range"
                min={yearBounds.min}
                max={yearBounds.max}
                value={a0}
                onChange={(e) => setEra([Math.min(Number(e.target.value), a1), a1])}
                className="w-20 accent-[var(--primary)]"
                aria-label={t("map.eraFrom")}
              />
              <span className="tabular-nums w-[5.5rem] text-center text-text">{a0}–{a1}</span>
              <input
                type="range"
                min={yearBounds.min}
                max={yearBounds.max}
                value={a1}
                onChange={(e) => setEra([a0, Math.max(Number(e.target.value), a0)])}
                className="w-20 accent-[var(--primary)]"
                aria-label={t("map.eraTo")}
              />
              {(a0 > yearBounds.min || a1 < yearBounds.max) && (
                <button onClick={() => setEra(null)} className="text-[11px] text-text-subtle hover:text-text">
                  {t("map.eraAll")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Madde 9 — harita tam genişlik, yan paneller altta. */}
        <div className="space-y-6">
          {/* Harita tuvali — zoom + pan */}
          <div className="relative rounded-2xl border border-border bg-surface p-2 sm:p-3">
            <div className="relative rounded-xl overflow-hidden">
              <svg
                ref={svgRef}
                viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
                className="w-full h-auto block select-none cursor-grab active:cursor-grabbing max-h-[72vh]"
                role="img"
                aria-label={t("map.ariaMap")}
                style={{ touchAction: "none" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPan}
                onPointerCancel={endPan}
              >
                {/* Zemin (deniz) — tüm dünya */}
                <rect x={0} y={0} width={VW} height={VH} fill="var(--surface-2)" />

                {/* Enlem/boylam ızgarası — soluk (coğrafi, pan/zoom ile hareket eder) */}
                <g stroke="var(--border)" strokeWidth={s(0.5)} opacity={0.3}>
                  {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lng) => {
                    const { x } = projectEquirectangular(0, lng, VW, VH);
                    return <line key={`lng-${lng}`} x1={x} y1={0} x2={x} y2={VH} />;
                  })}
                  {[-30, 0, 30, 60].map((lat) => {
                    const { y } = projectEquirectangular(lat, 0, VW, VH);
                    return <line key={`lat-${lat}`} x1={0} y1={y} x2={VW} y2={y} />;
                  })}
                </g>

                {/* Kara + ülke sınırları — Natural Earth 110m (gömülü, dış istek yok) */}
                <g
                  fill="var(--surface-3)"
                  stroke="var(--border-strong)"
                  strokeWidth={s(0.6)}
                  strokeLinejoin="round"
                >
                  {COUNTRIES.map((c, i) => (
                    <path key={i} d={c.d} />
                  ))}
                </g>

                {/* Ekvator vurgusu */}
                <g stroke="var(--border-strong)" strokeWidth={s(0.7)} strokeDasharray={`${s(4)} ${s(5)}`} opacity={0.4}>
                  {(() => {
                    const { y } = projectEquirectangular(0, 0, VW, VH);
                    return <line x1={0} y1={y} x2={VW} y2={y} />;
                  })()}
                </g>

                {/* Ülke adları — orta zoom (rank filtreli) */}
                {showCountryNames && (
                  <g fill="var(--text-muted)" style={{ pointerEvents: "none" }}>
                    {COUNTRIES.filter((c) => c.r <= nameRankMax).map((c, i) => (
                      <text
                        key={i}
                        x={c.lx}
                        y={c.ly}
                        textAnchor="middle"
                        fontSize={s(11)}
                        fontWeight={500}
                        opacity={0.85}
                      >
                        {lang === "en" ? c.en : c.tr}
                      </text>
                    ))}
                  </g>
                )}

                {/* Referans şehirler (GAZETTEER) — yüksek zoom */}
                {showCities && (
                  <g style={{ pointerEvents: "none" }}>
                    {refCities.map((c) => (
                      <g key={c.name}>
                        <circle cx={c.x} cy={c.y} r={s(1.6)} fill="var(--text-subtle)" opacity={0.6} />
                        <text
                          x={c.x}
                          y={c.y - s(4)}
                          textAnchor="middle"
                          fontSize={s(8.5)}
                          fill="var(--text-subtle)"
                          opacity={0.75}
                        >
                          {c.name}
                        </text>
                      </g>
                    ))}
                  </g>
                )}

                {/* Göç yolları — ebeveyn → çocuk doğum yeri (hafif yay) */}
                {showMigration && (
                  <g fill="none" stroke="var(--accent)" strokeLinecap="round" style={{ pointerEvents: "none" }}>
                    {migrations.map((mg, i) => {
                      const p1 = projectEquirectangular(mg.from.lat, mg.from.lng, VW, VH);
                      const p2 = projectEquirectangular(mg.to.lat, mg.to.lng, VW, VH);
                      const mx = (p1.x + p2.x) / 2;
                      const my = (p1.y + p2.y) / 2;
                      const dx = p2.x - p1.x;
                      const dy = p2.y - p1.y;
                      const len = Math.hypot(dx, dy) || 1;
                      const off = Math.min(len * 0.15, VH * 0.08);
                      const cx = mx - (dy / len) * off;
                      const cy = my + (dx / len) * off;
                      return (
                        <path
                          key={i}
                          d={`M${p1.x} ${p1.y} Q${cx} ${cy} ${p2.x} ${p2.y}`}
                          strokeWidth={s(0.6 + Math.min(mg.n, 5) * 0.28)}
                          strokeOpacity={0.5}
                        />
                      );
                    })}
                  </g>
                )}

                {/* Doğum yeri noktaları — HER ZAMAN, karaların üstünde */}
                {dots.map(({ a, x, y }) => {
                  const isActive = a.place === activePlace;
                  const r = s(radiusOf(a.count));
                  const showLabel = showCities || isActive;
                  return (
                    <g
                      key={a.place}
                      className="cursor-pointer"
                      onClick={() => {
                        if (didPan.current) return; // sürükleme tıklama sayılmaz
                        setActivePlace(isActive ? null : a.place);
                      }}
                      role="button"
                      aria-label={t("map.placeAria", { place: a.place, count: a.count })}
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={r}
                        fill="var(--primary)"
                        fillOpacity={isActive ? 0.55 : 0.3}
                        stroke="var(--primary)"
                        strokeWidth={s(isActive ? 2 : 1.3)}
                      />
                      <circle cx={x} cy={y} r={s(1.8)} fill="var(--primary)" />
                      {showLabel && (
                        <text
                          x={x}
                          y={y - r - s(4)}
                          textAnchor="middle"
                          fontSize={s(11)}
                          fontWeight={600}
                          fill="var(--text)"
                          style={{ pointerEvents: "none" }}
                        >
                          {a.place.split(",")[0]}
                        </text>
                      )}
                      {(showCities || isActive) && r > s(7) && (
                        <text
                          x={x}
                          y={y + s(3.5)}
                          textAnchor="middle"
                          fontSize={s(10)}
                          fontWeight={700}
                          fill="var(--primary-text)"
                          style={{ pointerEvents: "none" }}
                        >
                          {a.count}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Zoom denetimleri */}
              <div className="no-print absolute top-2 right-2 flex flex-col gap-1">
                <button
                  onClick={() => zoomButton(1.6)}
                  aria-label={t("map.zoomIn")}
                  className="w-8 h-8 grid place-items-center rounded-lg bg-surface/90 border border-border text-text hover:bg-surface-2 text-lg leading-none shadow-sm"
                >
                  +
                </button>
                <button
                  onClick={() => zoomButton(1 / 1.6)}
                  aria-label={t("map.zoomOut")}
                  className="w-8 h-8 grid place-items-center rounded-lg bg-surface/90 border border-border text-text hover:bg-surface-2 text-lg leading-none shadow-sm"
                >
                  −
                </button>
              </div>
              {k > 1.02 && (
                <button
                  onClick={resetView}
                  className="no-print absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-surface/90 border border-border text-[11px] text-text hover:bg-surface-2 shadow-sm"
                >
                  {t("map.reset")}
                </button>
              )}
            </div>
          </div>

          {/* Yan paneller — harita altında ızgara (Madde 9) */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-start">
            {/* Seçili yerin kişileri */}
            {active ? (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h2 className="font-serif text-base font-semibold text-text truncate">
                    {active.place}
                  </h2>
                  <button
                    onClick={() => setActivePlace(null)}
                    className="text-[11px] text-text-subtle hover:text-text shrink-0"
                  >
                    {t("map.close")}
                  </button>
                </div>
                <PersonList ids={active.personIds} byId={byId} onSelect={onSelect} />
              </section>
            ) : (
              <section className="rounded-2xl border border-border bg-surface-2/60 p-4">
                <p className="text-sm text-text-muted">{t("map.clickHint")}</p>
              </section>
            )}

            {/* En sık doğum yerleri */}
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="font-serif text-base font-semibold text-text mb-3">
                {t("map.topPlaces")}
              </h2>
              <ul className="space-y-1">
                {aggregates.slice(0, 8).map((a) => (
                  <li key={a.place}>
                    <button
                      onClick={() => a.coords && focusPlace(a.place)}
                      className={`w-full flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-lg text-left transition-colors ${
                        a.coords ? "hover:bg-surface-2" : "cursor-default"
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          background: a.coords ? "var(--primary)" : "var(--text-subtle)",
                          opacity: a.coords ? 0.7 : 0.4,
                        }}
                      />
                      <span className="text-sm text-text truncate flex-1 min-w-0">
                        {a.place}
                        {!a.coords && (
                          <span className="text-text-subtle">{t("map.noLocation")}</span>
                        )}
                      </span>
                      <span className="text-xs text-text-muted tabular-nums shrink-0">
                        {a.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Konumu bilinmeyen yerler */}
            {unlocated.length > 0 && (
              <section className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h2 className="font-serif text-base font-semibold text-text">
                    {t("map.unlocatedTitle")}
                  </h2>
                  <span className="text-[11px] text-text-subtle shrink-0">
                    {unlocated.length}
                  </span>
                </div>
                <p className="text-[11px] text-text-subtle mb-3">{t("map.unlocatedBody")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {unlocated.map((a) => (
                    <span
                      key={a.place}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 text-xs text-text"
                    >
                      {a.place}
                      <span className="text-text-subtle tabular-nums">{a.count}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function PersonList({
  ids,
  byId,
  onSelect,
}: {
  ids: string[];
  byId: Map<string, Person>;
  onSelect: (id: string) => void;
}) {
  const coll = new Intl.Collator("tr");
  const people = ids
    .map((id) => byId.get(id))
    .filter((p): p is Person => !!p)
    .sort((a, b) => coll.compare(fullName(a), fullName(b)));

  return (
    <ul className="max-h-80 overflow-y-auto space-y-0.5 pr-0.5">
      {people.map((p) => (
        <li key={p.id}>
          <button
            onClick={() => onSelect(p.id)}
            className="w-full flex items-center gap-2.5 px-2 py-1.5 -mx-1 rounded-lg hover:bg-surface-2 transition-colors text-left"
          >
            <Avatar person={p} size="xs" />
            <span className="text-sm text-text truncate flex-1 min-w-0">{fullName(p)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
