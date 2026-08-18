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

/**
 * Hero görseli — motto'yu yansıtır: e-Devlet'ten içe aktarılmış bir profil,
 * fotoğraf + ses/video/hikâye ile zenginleştirilmiş. Arkada soluk bir soy ağacı.
 */
function EnrichPreview({ t }: { t: ReturnType<typeof useT> }) {
  const chips = [
    { icon: "📷", key: "photo" },
    { icon: "🎧", key: "audio" },
    { icon: "🎬", key: "video" },
    { icon: "📖", key: "story" },
  ] as const;
  return (
    <div className="rounded-3xl border border-border bg-surface shadow-card p-5 sm:p-7">
      {/* Soluk ağaç filigranı */}
      <svg viewBox="0 0 400 200" className="w-full h-auto opacity-[0.12]" aria-hidden>
        <g stroke="var(--text-subtle)" strokeWidth="2" fill="none">
          <path d="M70 40 V80 H330 V40 M200 80 V120" />
        </g>
        {[70, 200, 330].map((x) => (
          <circle key={x} cx={x} cy={30} r={16} fill="var(--surface-2)" stroke="var(--border)" strokeWidth="1.5" />
        ))}
        <circle cx={200} cy={140} r={20} fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2.5" />
      </svg>

      {/* Zenginleştirilmiş profil kartı */}
      <div className="-mt-24 relative rounded-2xl border border-border bg-bg-elevated shadow-float p-4">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary-soft text-primary mb-3">
          <span aria-hidden>🏛️</span> {t("land.hero.badge")}
        </span>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-accent-soft grid place-items-center text-2xl shrink-0" aria-hidden>👵</div>
          <div className="min-w-0">
            <p className="font-serif font-semibold text-text leading-tight">Ayşe Yıldız</p>
            <p className="text-xs text-text-subtle">1928 – 2011 · Kastamonu</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-surface-2 text-text">
              <span aria-hidden>{c.icon}</span> {t(`land.hero.chip.${c.key}`)}
            </span>
          ))}
        </div>
      </div>
    </div>
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
  const year = new Date().getFullYear();

  const startDemo = () => {
    setDemoLoading(true);
    demoGirisi().catch(() => setDemoLoading(false));
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* ---- Üst çubuk ---- */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary grid place-items-center shadow-soft">
              <BrandMark stroke="var(--primary-text)" />
            </div>
            <span className="font-serif text-lg font-semibold">{t("auth.brand")}</span>
          </div>

          <nav className="hidden md:flex items-center gap-1 mx-auto text-sm">
            <a href="#ozellikler" className="px-3 py-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">{t("land.nav.features")}</a>
            <a href="#nasil" className="px-3 py-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">{t("land.nav.how")}</a>
            <a href="#sss" className="px-3 py-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">{t("land.nav.faq")}</a>
          </nav>

          <div className="ml-auto md:ml-0 flex items-center gap-2">
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

      {/* ---- Hero (iki kolon) ---- */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="absolute -top-40 -left-24 w-[680px] h-[560px] rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 68%)" }}
          aria-hidden
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-1 rounded-full bg-primary-soft text-primary">
              {t("land.hero.kicker")}
            </span>
            <h1 className="font-serif text-[2rem] sm:text-4xl xl:text-5xl font-semibold leading-[1.12] mt-5">
              {t("land.hero.title")}
            </h1>
            <p className="text-base sm:text-lg text-text-muted mt-5 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              {t("land.hero.body")}
            </p>
            <div className="flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3 mt-8">
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

          <div className="relative">
            <div
              className="absolute -inset-6 rounded-[2rem] opacity-30 blur-2xl pointer-events-none"
              style={{ background: "radial-gradient(circle at 70% 30%, var(--accent), transparent 65%)" }}
              aria-hidden
            />
            <div className="relative">
              <EnrichPreview t={t} />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Özellikler ---- */}
      <section id="ozellikler" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="font-serif text-3xl sm:text-4xl font-semibold">{t("land.features.title")}</h2>
          <p className="text-text-muted mt-3 max-w-lg mx-auto">{t("land.features.subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.key} className="rounded-2xl border border-border bg-surface p-5 hover:border-border-strong transition-colors">
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
      <section id="nasil" className="scroll-mt-20 bg-surface border-y border-border">
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
      <section id="sss" className="scroll-mt-20 max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
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

      {/* ---- Alt bilgi (çok kolon) ---- */}
      <footer className="border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            {/* Marka */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary grid place-items-center">
                  <BrandMark stroke="var(--primary-text)" className="scale-90" />
                </div>
                <span className="font-serif font-semibold">{t("auth.brand")}</span>
              </div>
              <p className="text-sm text-text-muted leading-relaxed max-w-[16rem]">{t("land.footer.tagline")}</p>
            </div>

            {/* Ürün */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-3">{t("land.footer.product")}</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#ozellikler" className="text-text-muted hover:text-text transition-colors">{t("land.nav.features")}</a></li>
                <li><a href="#nasil" className="text-text-muted hover:text-text transition-colors">{t("land.nav.how")}</a></li>
                <li><button onClick={startDemo} className="text-text-muted hover:text-text transition-colors">{t("land.demo.cta")}</button></li>
              </ul>
            </div>

            {/* Hesap */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-3">{t("land.footer.account")}</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/login" className="text-text-muted hover:text-text transition-colors">{t("land.nav.signin")}</Link></li>
                <li><Link href="/register" className="text-text-muted hover:text-text transition-colors">{t("land.final.ctaRegister")}</Link></li>
              </ul>
            </div>

            {/* Kaynaklar */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-3">{t("land.footer.resources")}</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#sss" className="text-text-muted hover:text-text transition-colors">{t("land.nav.faq")}</a></li>
                <li><div className="pt-1"><LanguageSwitch /></div></li>
              </ul>
            </div>

            {/* Yasal */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-3">{t("land.footer.legal")}</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy" className="text-text-muted hover:text-text transition-colors">{t("land.footer.privacy")}</Link></li>
                <li><Link href="/terms" className="text-text-muted hover:text-text transition-colors">{t("land.footer.terms")}</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-text-subtle">
            <p>© 2024–{year} {t("auth.brand")}</p>
            <p>{t("land.footer.madeby")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
