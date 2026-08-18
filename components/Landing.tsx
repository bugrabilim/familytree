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
 * Hero görseli — motto: eski profil fotoğrafını restore et + kısa videoyla
 * canlandır. İki "polaroid": arkada eski (sepya, çizik), önde restore edilmiş
 * renkli + oynatma rozeti. Altta e-Devlet ve açıklama.
 */
function RestorePreview({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <div className="rounded-3xl border border-border bg-surface shadow-card p-6 sm:p-8">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary-soft text-primary mb-4">
        <span aria-hidden>🏛️</span> {t("land.hero.badge")}
      </span>

      <div className="relative h-56 sm:h-64">
        {/* Önce — eski, sepya, çizik */}
        <figure className="absolute left-2 top-3 w-36 sm:w-40 -rotate-6 rounded-xl bg-[#efe6d4] p-2 pb-6 shadow-lg border border-black/10">
          <div className="relative aspect-[4/5] rounded-md overflow-hidden grid place-items-center" style={{ background: "linear-gradient(145deg,#cbb48c,#9c815a)" }}>
            <span className="text-6xl" style={{ filter: "sepia(0.7) contrast(1.05) brightness(0.95)" }} aria-hidden>👵</span>
            {/* çizikler */}
            <span className="absolute inset-0" style={{ background: "repeating-linear-gradient(115deg, transparent, transparent 22px, rgba(60,40,20,0.10) 23px, transparent 24px)" }} aria-hidden />
            <span className="absolute -top-1 right-2 w-6 h-6 bg-[#efe6d4] rotate-45" aria-hidden />
          </div>
          <figcaption className="absolute bottom-1 left-0 right-0 text-center text-[11px] font-medium text-neutral-600">{t("land.hero.before")}</figcaption>
        </figure>

        {/* Sonra — restore edilmiş, renkli, oynatma rozeti */}
        <figure className="absolute right-2 top-6 w-40 sm:w-44 rotate-3 rounded-xl bg-white p-2 pb-6 shadow-xl border border-black/10 z-10">
          <div className="relative aspect-[4/5] rounded-md overflow-hidden grid place-items-center" style={{ background: "linear-gradient(145deg,#f6ede0,#e7cfa6)" }}>
            <span className="text-6xl" aria-hidden>👵</span>
            {/* oynatma rozeti + süre */}
            <span className="absolute inset-0 grid place-items-center">
              <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur grid place-items-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
            <span className="absolute bottom-1.5 right-1.5 text-[10px] font-semibold text-white bg-black/50 px-1.5 py-0.5 rounded">0:14</span>
          </div>
          <figcaption className="absolute bottom-1 left-0 right-0 text-center text-[11px] font-medium text-neutral-700">{t("land.hero.after")}</figcaption>
        </figure>
      </div>

      <p className="text-sm text-text-muted leading-relaxed mt-3">{t("land.hero.restoreCap")}</p>
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
              <RestorePreview t={t} />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Aile kitabı (flipbook) — ikinci sıra ---- */}
      <section className="bg-surface border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1" style={{ perspective: "1400px" }}>
            <div
              className="relative mx-auto max-w-md rounded-lg shadow-2xl"
              style={{ transform: "rotateX(6deg) rotateY(-12deg)", transformStyle: "preserve-3d" }}
            >
              <div className="flex h-64 sm:h-72">
                {/* Sol sayfa — solgun parşömen */}
                <div className="flex-1 rounded-l-lg p-5 font-serif" style={{ background: "linear-gradient(145deg,#e7d7b4,#d9c398)", color: "#5a4a34", boxShadow: "inset 0 0 60px rgba(120,80,30,0.22)" }}>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-60 text-center mb-2">3. Kuşak</p>
                  <p className="font-semibold">Ayşe Yıldız</p>
                  <p className="text-xs italic opacity-70 mb-2">1928 – 2011</p>
                  <p className="text-[11px] leading-relaxed opacity-80">Köyün ebesiydi; kırk yıl boyunca doğumlara girdi. Sesi güzeldi, düğünlerde türkü söylerdi…</p>
                </div>
                {/* Cilt */}
                <div className="w-1.5 bg-gradient-to-r from-black/25 via-black/10 to-black/25" aria-hidden />
                {/* Sağ sayfa — temiz kâğıt + kıvrılan köşe */}
                <div className="relative flex-1 rounded-r-lg p-5 font-serif" style={{ background: "linear-gradient(145deg,#faf6ec,#f0e6d2)", color: "#2b2117", boxShadow: "inset 0 0 40px rgba(120,80,30,0.10)" }}>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 text-center mb-2">6. Kuşak</p>
                  <p className="font-semibold">Bade Acar</p>
                  <p className="text-xs italic opacity-60 mb-2">2025 –</p>
                  <p className="text-[11px] leading-relaxed opacity-80">Ailenin en küçüğü. Beşinci kuşağı; büyük büyük büyük anneannesi onu kucağına aldı.</p>
                  {/* kıvrılan sayfa köşesi */}
                  <div className="absolute bottom-0 right-0 w-10 h-10 rounded-tl-xl" style={{ background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.10) 50%, #efe4cc 52%)", boxShadow: "-2px -2px 6px rgba(0,0,0,0.12)" }} aria-hidden />
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 text-center lg:text-left">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-1 rounded-full bg-accent-soft text-accent">
              📖 {t("land.book.badge")}
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold mt-4">{t("land.book.title")}</h2>
            <p className="text-text-muted mt-4 leading-relaxed max-w-md mx-auto lg:mx-0">{t("land.book.body")}</p>
            <button
              onClick={startDemo}
              disabled={demoLoading}
              className="mt-6 h-11 inline-flex items-center justify-center px-6 rounded-xl bg-primary text-primary-text font-medium hover:brightness-110 transition-all disabled:opacity-60"
            >
              {demoLoading ? t("land.demo.loading") : t("land.book.cta")}
            </button>
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
