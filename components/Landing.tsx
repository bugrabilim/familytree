"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitch from "./LanguageSwitch";
import { useT } from "@/lib/i18n";
import { demoGirisi } from "@/app/login/actions";

/** Marka simgesi (üç kuşaklık düğüm). */
function BrandMark({ className, stroke = "currentColor" }: { className?: string; stroke?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M12 22V11M12 11L7.5 7.5M12 11l4.5-3.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="4.5" r="2.6" stroke={stroke} strokeWidth="2" />
      <circle cx="5.5" cy="9" r="2.4" stroke={stroke} strokeWidth="2" />
      <circle cx="18.5" cy="9" r="2.4" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

const FEATURES = [
  { icon: "🌳", key: "views" },
  { icon: "👪", key: "kinship" },
  { icon: "🔒", key: "privacy" },
  { icon: "🖼️", key: "media" },
  { icon: "✨", key: "ai" },
  { icon: "🔄", key: "import" },
  { icon: "🤝", key: "sharing" },
  { icon: "🗺️", key: "map" },
  { icon: "📖", key: "book" },
] as const;

const STEPS = ["1", "2", "3"] as const;
const FAQS = ["1", "2", "3", "4"] as const;

export default function Landing() {
  const t = useT();
  const [demoLoading, setDemoLoading] = useState(false);

  const startDemo = () => {
    setDemoLoading(true);
    demoGirisi().catch(() => setDemoLoading(false));
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* ---- Üst çubuk ---- */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary grid place-items-center shadow-soft">
              <BrandMark stroke="var(--primary-text)" />
            </div>
            <span className="font-serif text-lg font-semibold">{t("auth.brand")}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden sm:inline-flex h-9 items-center px-3.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium transition-colors"
            >
              {t("land.nav.signin")}
            </Link>
            <button
              onClick={startDemo}
              disabled={demoLoading}
              className="h-9 inline-flex items-center px-3.5 rounded-lg bg-primary text-primary-text text-sm font-medium hover:brightness-110 transition-all disabled:opacity-60"
            >
              {demoLoading ? t("land.demo.loading") : t("land.nav.demo")}
            </button>
          </div>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[560px] rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 68%)" }}
          aria-hidden
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-14 text-center">
          <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-1 rounded-full bg-primary-soft text-primary">
            {t("land.hero.kicker")}
          </span>
          <h1 className="font-serif text-4xl sm:text-6xl font-semibold leading-[1.08] mt-5 max-w-3xl mx-auto">
            {t("land.hero.title")}
          </h1>
          <p className="text-base sm:text-lg text-text-muted mt-5 max-w-xl mx-auto leading-relaxed">
            {t("land.hero.body")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <button
              onClick={startDemo}
              disabled={demoLoading}
              className="w-full sm:w-auto h-12 inline-flex items-center justify-center px-7 rounded-xl bg-primary text-primary-text font-medium hover:brightness-110 transition-all disabled:opacity-60 shadow-card"
            >
              {demoLoading ? t("land.demo.loading") : t("land.hero.ctaDemo")}
            </button>
            <Link
              href="/login"
              className="w-full sm:w-auto h-12 inline-flex items-center justify-center px-7 rounded-xl border border-border bg-surface hover:bg-surface-2 font-medium transition-colors"
            >
              {t("land.hero.ctaSignin")}
            </Link>
          </div>
          <p className="text-xs text-text-subtle mt-5">{t("land.hero.trust")}</p>
        </div>
      </section>

      {/* ---- Özellikler ---- */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="font-serif text-3xl sm:text-4xl font-semibold">{t("land.features.title")}</h2>
          <p className="text-text-muted mt-3 max-w-lg mx-auto">{t("land.features.subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.key} className="rounded-2xl border border-border bg-surface p-5">
              <div className="w-11 h-11 rounded-xl bg-primary-soft grid place-items-center text-xl mb-3" aria-hidden>
                {f.icon}
              </div>
              <h3 className="font-semibold text-[15px]">{t(`land.feat.${f.key}.t`)}</h3>
              <p className="text-sm text-text-muted leading-relaxed mt-1">{t(`land.feat.${f.key}.b`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Nasıl çalışır ---- */}
      <section className="bg-surface border-y border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-center mb-12">
            {t("land.how.title")}
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map((n) => (
              <div key={n} className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary text-primary-text font-serif text-xl font-semibold grid place-items-center mx-auto mb-4 shadow-soft">
                  {n}
                </div>
                <h3 className="font-semibold text-lg">{t(`land.step.${n}.t`)}</h3>
                <p className="text-sm text-text-muted leading-relaxed mt-2 max-w-xs mx-auto">{t(`land.step.${n}.b`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Demo şeridi ---- */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div
          className="rounded-3xl p-8 sm:p-12 text-center text-[var(--primary-text)] relative overflow-hidden"
          style={{ background: "linear-gradient(150deg, var(--primary), var(--primary-hover))" }}
        >
          <div
            className="absolute -top-20 -right-16 w-80 h-80 rounded-full opacity-25 blur-3xl pointer-events-none"
            style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
            aria-hidden
          />
          <h2 className="relative font-serif text-3xl sm:text-4xl font-semibold">{t("land.demo.title")}</h2>
          <p className="relative opacity-85 mt-3 max-w-lg mx-auto">{t("land.demo.body")}</p>
          <button
            onClick={startDemo}
            disabled={demoLoading}
            className="relative mt-7 h-12 inline-flex items-center justify-center px-8 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur font-medium transition-colors disabled:opacity-60"
          >
            {demoLoading ? t("land.demo.loading") : t("land.demo.cta")}
          </button>
        </div>
      </section>

      {/* ---- SSS ---- */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
        <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-center mb-10">{t("land.faq.title")}</h2>
        <div className="space-y-3">
          {FAQS.map((n) => (
            <details key={n} className="group rounded-2xl border border-border bg-surface p-5 open:bg-surface-2 transition-colors">
              <summary className="flex items-center justify-between gap-3 cursor-pointer font-medium list-none">
                {t(`land.faq.${n}.q`)}
                <span className="text-text-subtle group-open:rotate-45 transition-transform text-xl leading-none" aria-hidden>+</span>
              </summary>
              <p className="text-sm text-text-muted leading-relaxed mt-3">{t(`land.faq.${n}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---- Son CTA ---- */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 text-center">
        <h2 className="font-serif text-3xl sm:text-4xl font-semibold max-w-2xl mx-auto">{t("land.final.title")}</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-7">
          <button
            onClick={startDemo}
            disabled={demoLoading}
            className="w-full sm:w-auto h-12 inline-flex items-center justify-center px-7 rounded-xl bg-primary text-primary-text font-medium hover:brightness-110 transition-all disabled:opacity-60 shadow-card"
          >
            {demoLoading ? t("land.demo.loading") : t("land.final.ctaDemo")}
          </button>
          <Link
            href="/register"
            className="w-full sm:w-auto h-12 inline-flex items-center justify-center px-7 rounded-xl border border-border bg-surface hover:bg-surface-2 font-medium transition-colors"
          >
            {t("land.final.ctaRegister")}
          </Link>
        </div>
      </section>

      {/* ---- Alt bilgi ---- */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary grid place-items-center">
              <BrandMark stroke="var(--primary-text)" className="scale-90" />
            </div>
            <span className="font-serif font-semibold">{t("auth.brand")}</span>
          </div>
          <p className="text-xs text-text-subtle">{t("land.footer.rights")}</p>
        </div>
      </footer>
    </div>
  );
}
