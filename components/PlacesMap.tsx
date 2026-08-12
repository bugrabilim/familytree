"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import Avatar from "./ui/Avatar";
import { fullName } from "@/lib/name";
import { usePrivacy } from "./PrivacyContext";
import { aggregatePlaces, projectEquirectangular } from "@/lib/places";
import { LAND_PATHS } from "@/lib/world-map";
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  onSelect: (id: string) => void;
}

/** SVG çizim tuvali boyutu (viewBox birimleri). */
const VW = 1000;
const VH = 620;

export default function PlacesMap({ people, onSelect }: Props) {
  const { view } = usePrivacy();
  const t = useT();
  const [activePlace, setActivePlace] = useState<string | null>(null);

  // GİZLİLİK: kişileri görüntü katmanından geçir; maskeli (gizli yaşayan)
  // kişide `birthPlace` bulunmadığından doğum yeri sızmaz.
  const aggregates = useMemo(
    () => aggregatePlaces(people.map((p) => view(p))),
    [people, view]
  );

  const located = useMemo(() => aggregates.filter((a) => a.coords), [aggregates]);
  const unlocated = useMemo(() => aggregates.filter((a) => !a.coords), [aggregates]);

  const maxCount = useMemo(
    () => located.reduce((m, a) => Math.max(m, a.count), 1),
    [located]
  );

  // id → kişi (maskeli) — yan listede göstermek için
  const byId = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of people) m.set(p.id, view(p));
    return m;
  }, [people, view]);

  const active = useMemo(
    () => located.find((a) => a.place === activePlace) ?? null,
    [located, activePlace]
  );

  /** Nokta yarıçapı — kişi sayısına göre ölçekli (√ ile alan orantılı). */
  const radiusOf = (count: number) => 9 + 20 * Math.sqrt(count / maxCount);

  // Enlem/boylam ızgara çizgileri (soyut arka plan — gerçek kıyı çizgisi yok).
  const lngLines = useMemo(() => {
    const out: number[] = [];
    for (let lng = -60; lng <= 40; lng += 20) out.push(lng);
    return out;
  }, []);
  const latLines = useMemo(() => {
    const out: number[] = [];
    for (let lat = -20; lat <= 50; lat += 20) out.push(lat);
    return out;
  }, []);

  if (people.length === 0 || aggregates.length === 0) {
    return (
      <div className="h-full grid place-items-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-3">🗺️</p>
          <h2 className="font-serif text-xl font-semibold text-text mb-1.5">{t("map.emptyTitle")}</h2>
          <p className="text-sm text-text-muted">
            {t("map.emptyBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="font-serif text-xl font-semibold text-text">{t("map.title")}</h1>
            <p className="text-sm text-text-muted">
              {t("map.subtitle", { located: located.length, total: aggregates.length })}
            </p>
          </div>
          <p className="text-[11px] text-text-subtle shrink-0 hidden sm:block">
            {t("map.dotHint")}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Harita tuvali */}
          <div className="rounded-2xl border border-border bg-surface p-2 sm:p-3 overflow-auto">
            <svg
              viewBox={`0 0 ${VW} ${VH}`}
              className="w-full h-auto"
              role="img"
              aria-label={t("map.ariaMap")}
              style={{ minWidth: 480 }}
            >
              {/* Zemin (deniz) */}
              <rect
                x={0}
                y={0}
                width={VW}
                height={VH}
                rx={16}
                fill="var(--surface-2)"
                stroke="var(--border)"
              />

              {/* Kara parçaları — gömülü, basitleştirilmiş dünya sınırları
                  (Natural Earth 110m, dış istek yok). Noktalarla aynı izdüşüm. */}
              <g clipPath="url(#map-clip)">
                {LAND_PATHS.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    fill="var(--surface-3)"
                    stroke="var(--border-strong)"
                    strokeWidth={0.8}
                    strokeLinejoin="round"
                  />
                ))}
              </g>
              <clipPath id="map-clip">
                <rect x={0} y={0} width={VW} height={VH} rx={16} />
              </clipPath>

              {/* Enlem/boylam ızgarası — soluk */}
              <g stroke="var(--border)" strokeWidth={1} opacity={0.35}>
                {lngLines.map((lng) => {
                  const { x } = projectEquirectangular(0, lng, VW, VH);
                  return <line key={`lng-${lng}`} x1={x} y1={0} x2={x} y2={VH} />;
                })}
                {latLines.map((lat) => {
                  const { y } = projectEquirectangular(lat, 0, VW, VH);
                  return <line key={`lat-${lat}`} x1={0} y1={y} x2={VW} y2={y} />;
                })}
              </g>

              {/* Ekvator/0-boylam vurgusu */}
              <g stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="4 5" opacity={0.5}>
                {(() => {
                  const { y } = projectEquirectangular(0, 0, VW, VH);
                  const { x } = projectEquirectangular(0, 0, VW, VH);
                  return (
                    <>
                      <line x1={0} y1={y} x2={VW} y2={y} />
                      <line x1={x} y1={0} x2={x} y2={VH} />
                    </>
                  );
                })()}
              </g>

              {/* Noktalar */}
              {located.map((a) => {
                const { x, y } = projectEquirectangular(a.coords!.lat, a.coords!.lng, VW, VH);
                const r = radiusOf(a.count);
                const isActive = a.place === activePlace;
                return (
                  <g
                    key={a.place}
                    className="cursor-pointer"
                    onClick={() => setActivePlace(isActive ? null : a.place)}
                    role="button"
                    aria-label={t("map.placeAria", { place: a.place, count: a.count })}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill="var(--primary)"
                      fillOpacity={isActive ? 0.55 : 0.28}
                      stroke="var(--primary)"
                      strokeWidth={isActive ? 2.5 : 1.5}
                    />
                    <circle cx={x} cy={y} r={2.5} fill="var(--primary)" />
                    <text
                      x={x}
                      y={y - r - 5}
                      textAnchor="middle"
                      fontSize={13}
                      fontWeight={600}
                      fill="var(--text)"
                    >
                      {a.place.split(",")[0]}
                    </text>
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={700}
                      fill="var(--primary-text)"
                      style={{ pointerEvents: "none" }}
                    >
                      {a.count}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Yan panel */}
          <div className="space-y-6">
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
                <p className="text-sm text-text-muted">
                  {t("map.clickHint")}
                </p>
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
                      onClick={() => a.coords && setActivePlace(a.place)}
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
                <p className="text-[11px] text-text-subtle mb-3">
                  {t("map.unlocatedBody")}
                </p>
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
