"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitch from "./LanguageSwitch";
import { useT } from "@/lib/i18n";

export const authField =
  "w-full h-11 px-3.5 rounded-xl bg-surface border border-border text-text text-sm placeholder:text-text-subtle " +
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

export const authLabel = "block text-xs font-medium text-text-muted mb-1.5";

/** Marka simgesi (üç kuşaklık düğüm) — hero ve mobil başlıkta ortak. */
function BrandMark({ className, stroke = "currentColor" }: { className?: string; stroke?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M12 22V11M12 11L7.5 7.5M12 11l4.5-3.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="4.5" r="2.6" stroke={stroke} strokeWidth="2" />
      <circle cx="5.5" cy="9" r="2.4" stroke={stroke} strokeWidth="2" />
      <circle cx="18.5" cy="9" r="2.4" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

/** Simge + i18n anahtarı; metinler render sırasında çevrilir. */
const HIGHLIGHTS = [
  { icon: "🌳", key: "views" },
  { icon: "👪", key: "kinship" },
  { icon: "🔒", key: "privacy" },
  { icon: "✨", key: "ai" },
  { icon: "🔗", key: "sharing" },
  { icon: "📄", key: "gedcom" },
] as const;

export default function AuthShell({
  title,
  subtitle,
  icon,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ---- Tanıtım paneli (büyük soy ağacı siteleri düzeni) ---- */}
      <aside
        className="hidden lg:flex flex-col justify-between w-[48%] max-w-2xl p-12 xl:p-14 relative overflow-hidden text-[var(--primary-text)]"
        style={{ background: "linear-gradient(155deg, var(--primary), var(--primary-hover))" }}
      >
        {/* Yumuşak altın ışıma */}
        <div
          className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
          aria-hidden
        />
        {/* Çok kuşaklı ağaç filigranı */}
        <svg
          className="absolute -right-20 -bottom-24 w-[560px] h-[560px] opacity-[0.09] pointer-events-none"
          viewBox="0 0 200 220"
          fill="none"
          aria-hidden
        >
          <circle cx="100" cy="20" r="14" stroke="currentColor" strokeWidth="3" />
          <path d="M100 34v24M50 58h100M50 58v22M150 58v22M100 58v22" stroke="currentColor" strokeWidth="3" />
          <circle cx="50" cy="96" r="14" stroke="currentColor" strokeWidth="3" />
          <circle cx="100" cy="96" r="14" stroke="currentColor" strokeWidth="3" />
          <circle cx="150" cy="96" r="14" stroke="currentColor" strokeWidth="3" />
          <path d="M50 110v18M100 110v18M150 110v18M25 128h150M25 128v20M75 128v20M125 128v20M175 128v20" stroke="currentColor" strokeWidth="3" />
          <circle cx="25" cy="164" r="12" stroke="currentColor" strokeWidth="3" />
          <circle cx="75" cy="164" r="12" stroke="currentColor" strokeWidth="3" />
          <circle cx="125" cy="164" r="12" stroke="currentColor" strokeWidth="3" />
          <circle cx="175" cy="164" r="12" stroke="currentColor" strokeWidth="3" />
          <path d="M25 176v16M75 176v16M12 192h50M112 192h50M12 192v18M62 192v18M112 192v18M162 192v18" stroke="currentColor" strokeWidth="3" />
        </svg>

        <div className="relative">
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-9 h-9 rounded-xl bg-white/15 grid place-items-center backdrop-blur">
              <BrandMark />
            </div>
            <span className="font-serif text-lg font-semibold">{t("auth.brand")}</span>
          </div>

          <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-1 rounded-full bg-white/10 backdrop-blur">
            {t("auth.kicker")}
          </span>
          <h2 className="font-serif text-[2.6rem] xl:text-5xl font-semibold leading-[1.1] max-w-lg mt-5">
            {t("auth.heroTitle1")}
            <br />
            {t("auth.heroTitle2")}
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed opacity-85 max-w-md">{t("auth.heroBody")}</p>
        </div>

        {/* Özellik ızgarası */}
        <ul className="relative grid grid-cols-2 gap-x-6 gap-y-5 mt-12">
          {HIGHLIGHTS.map((h) => (
            <li key={h.key} className="flex items-start gap-3">
              <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-white/10 text-base leading-none" aria-hidden>
                {h.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{t(`auth.highlight.${h.key}.title`)}</p>
                <p className="text-[12.5px] opacity-75 leading-snug mt-0.5">{t(`auth.highlight.${h.key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Güven şeridi */}
        <div className="relative mt-11 pt-5 border-t border-white/15">
          <p className="flex items-center gap-2 text-[12.5px] opacity-80">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
              <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("auth.trust")}
          </p>
        </div>
      </aside>

      {/* ---- Form paneli ---- */}
      <main className="flex-1 flex flex-col bg-bg">
        <div className="flex justify-between items-center gap-2 p-4">
          {/* Tanıtım (ana sayfa) sayfasına dön (Madde 8) */}
          <Link
            href="/tanitim"
            className="inline-flex items-center gap-1.5 h-9 pl-2 pr-3 rounded-lg text-sm text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("topbar.home")}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 pb-14">
          <div className="w-full max-w-[380px]">
            <div className="text-center mb-7">
              {icon ? (
                <div className="text-4xl mb-3">{icon}</div>
              ) : (
                <div className="lg:hidden w-12 h-12 rounded-2xl bg-primary grid place-items-center mx-auto mb-4 shadow-card">
                  <BrandMark stroke="var(--primary-text)" />
                </div>
              )}
              <h1 className="font-serif text-2xl font-semibold text-text">{title}</h1>
              {subtitle && <p className="text-sm text-text-muted mt-1.5 leading-relaxed">{subtitle}</p>}
            </div>

            {/* Kart — daha "premium" his; büyük soy ağacı siteleri gibi */}
            <div className="rounded-2xl border border-border bg-surface/70 backdrop-blur shadow-card p-6 sm:p-7">
              {children}
            </div>

            {footer && <div className="mt-6 text-center text-sm text-text-muted">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
