"use client";

import { useMemo } from "react";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import Avatar, { genderTone } from "./ui/Avatar";
import { indexPeople } from "@/lib/relations";
import { usePrivacy } from "./PrivacyContext";
import { buildTimeline, axisStep, axisTicks, livingByYear } from "@/lib/timeline";
import { useT } from "@/lib/i18n";

interface Props {
  people: Person[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

/**
 * Aile geneli tarihsel zaman çizelgesi (Madde 4) — her kişinin yaşam aralığı
 * bir çubuk; "kim hangi yıllarda yaşadı". Konumlandırma yüzde tabanlı
 * (responsive). Gizlilik: maskeli kopya üzerinden çalışır; tarihi olmayan
 * (gizli yaşayan dâhil) kişiler listelenmez.
 */
export default function TimelineView({ people, selectedId, onSelect }: Props) {
  const { view } = usePrivacy();
  const t = useT();

  const masked = useMemo(() => people.map(view), [people, view]);
  const idx = useMemo(() => indexPeople(masked), [masked]);

  const now = new Date().getFullYear();
  const tl = useMemo(() => buildTimeline(masked, now), [masked, now]);

  const span = Math.max(1, tl.maxYear - tl.minYear);
  const step = axisStep(span);
  const ticks = useMemo(() => axisTicks(tl.minYear, tl.maxYear, step), [tl.minYear, tl.maxYear, step]);

  const pct = (year: number) => ((year - tl.minYear) / span) * 100;
  const hidden = masked.length - tl.rows.length;

  // #3 — Genel görünüm: her yıl hayatta olan aile üyesi sayısı. Aile zaman
  // içinde nasıl büyüdü/küçüldü, tek bakışta okunur.
  const series = useMemo(() => livingByYear(tl.rows, tl.minYear, tl.maxYear), [tl]);
  const peak = useMemo(
    () => series.reduce((m, d) => (d.count > m.count ? d : m), { year: tl.minYear, count: 0 }),
    [series, tl.minYear]
  );
  const peakCount = Math.max(peak.count, 1);
  const overview = useMemo(() => {
    if (series.length === 0) return { area: "", line: "" };
    const pts = series.map(
      (d) => `${pct(d.year).toFixed(2)},${(100 - (d.count / peakCount) * 100).toFixed(2)}`
    );
    return { area: `M0,100 L${pts.join(" L")} L100,100 Z`, line: `M${pts.join(" L")}` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, peakCount]);

  if (tl.rows.length === 0) {
    return (
      <div className="h-full grid place-items-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-3">📅</p>
          <h2 className="font-serif text-xl font-semibold text-text mb-1.5">{t("timeline.emptyTitle")}</h2>
          <p className="text-sm text-text-muted">{t("timeline.emptyBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Başlık */}
      <div className="shrink-0 border-b border-border bg-bg-elevated/60 px-4 sm:px-6 py-2.5 flex items-baseline justify-between gap-3">
        <h1 className="font-serif text-base font-semibold text-text">{t("timeline.title")}</h1>
        <span className="text-xs text-text-subtle tabular-nums">
          {tl.minYear}–{tl.maxYear} · {t("common.peopleCount", { count: tl.rows.length })}
        </span>
      </div>

      {/* Yalnız dikey kaydırma: aşağı inerken sağa kaymayı önler. Çubuklar
          yüzde tabanlı olduğundan eksen genişliğe sığar; yıllar üstte yapışık
          kalır (yukarıdan kaymaz). */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-w-0">
          {/* Genel görünüm — zaman içinde yaşayan üye sayısı (alan grafiği) */}
          <div className="flex border-b border-border bg-surface-2/40">
            <div className="w-28 sm:w-40 shrink-0 border-r border-border/60 px-3 py-2 flex flex-col justify-center">
              <span className="text-[11px] font-medium text-text-muted leading-tight">
                {t("timeline.overview")}
              </span>
              <span className="text-[10px] text-text-subtle tabular-nums leading-tight mt-0.5">
                {t("timeline.peak", { count: peak.count, year: peak.year })}
              </span>
            </div>
            <div className="relative flex-1 h-24">
              {/* On yıl ızgarası */}
              {ticks.map((y) => (
                <span
                  key={y}
                  className="absolute top-0 bottom-0 w-px bg-border/40"
                  style={{ left: `${pct(y)}%` }}
                  aria-hidden
                />
              ))}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full"
                aria-hidden
              >
                <path d={overview.area} fill="var(--primary)" fillOpacity={0.14} />
                <path
                  d={overview.line}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  strokeOpacity={0.65}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          </div>

          {/* Yıl ekseni (yapışkan) */}
          <div className="sticky top-0 z-10 flex bg-bg/95 backdrop-blur border-b border-border">
            <div className="w-28 sm:w-40 shrink-0 border-r border-border" />
            <div className="relative flex-1 h-7">
              {ticks.map((y, i) => {
                // Uç etiketleri içeride tut: ilki sağa açılır, sonuncusu sola —
                // böylece hiçbir yıl kırpılmaz, yatay kaydırma oluşmaz (#4).
                const anchor = i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2";
                return (
                  <span
                    key={y}
                    className={`absolute top-1 ${anchor} text-[10px] text-text-subtle tabular-nums`}
                    style={{ left: `${pct(y)}%` }}
                  >
                    {y}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Satırlar */}
          <ul>
            {tl.rows.map((r) => {
              const p = idx.get(r.id);
              if (!p) return null;
              const tone = genderTone(p.gender);
              const isSel = r.id === selectedId;
              const left = pct(r.startYear);
              const width = Math.max(pct(r.endYear) - left, 0);
              return (
                <li key={r.id}>
                  <button
                    onClick={() => onSelect(r.id)}
                    className={`w-full flex items-stretch text-left border-b border-border/60 hover:bg-surface-2/60 transition-colors ${
                      isSel ? "bg-primary-soft" : ""
                    }`}
                  >
                    <span className="w-28 sm:w-40 shrink-0 px-3 py-1.5 border-r border-border/60 min-w-0 flex items-center gap-2">
                      <Avatar person={p} size="xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-text truncate leading-tight">{fullName(p)}</span>
                        <span className="block text-[10px] text-text-subtle tabular-nums leading-tight">
                          {r.startYear}
                          {r.living ? `–${t("timeline.living")}` : `–${r.endYear}`}
                        </span>
                      </span>
                    </span>
                    <span className="relative flex-1 my-1.5">
                      {/* On yıl ızgara çizgileri */}
                      {ticks.map((y) => (
                        <span
                          key={y}
                          className="absolute top-0 bottom-0 w-px bg-border/40"
                          style={{ left: `${pct(y)}%` }}
                          aria-hidden
                        />
                      ))}
                      {/* Yaşam çubuğu */}
                      <span
                        className="absolute top-1/2 -translate-y-1/2 h-3 rounded-full"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          minWidth: 4,
                          background: tone.css,
                          opacity: isSel ? 1 : 0.85,
                        }}
                        title={`${r.startYear}${r.living ? " · " + t("common.living") : "–" + r.endYear}`}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {hidden > 0 && (
        <div className="shrink-0 border-t border-border px-4 sm:px-6 py-1.5">
          <p className="text-[11px] text-text-subtle">{t("timeline.hiddenNote", { count: hidden })}</p>
        </div>
      )}
    </div>
  );
}
