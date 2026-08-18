"use client";

import { useEffect, useRef, useState } from "react";
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
 * Görünür olunca 0'dan hedefe sayan rakam. IntersectionObserver + rAF; harici
 * kütüphane yok. Hareket azaltma tercihinde anında hedefe atlar.
 */
function useCountUp(target: number, ms = 1300) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        // Hareket azaltma tercihinde animasyon yok — doğrudan hedef değer.
        if (reduced) { setN(target); return; }
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / ms);
          // easeOutCubic — hızlı başlar, yumuşak durur
          setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, ms]);
  return { ref, n };
}

function Stat({ value, label, suffix = "" }: { value: number; label: string; suffix?: string }) {
  const { ref, n } = useCountUp(value);
  return (
    <div>
      <p className="font-serif text-3xl sm:text-4xl font-semibold tabular-nums leading-none text-text">
        <span ref={ref}>{n.toLocaleString("tr-TR")}</span>
        {suffix}
      </p>
      <p className="text-[11px] sm:text-xs text-text-subtle mt-1.5 leading-tight">{label}</p>
    </div>
  );
}

/** Hero — kendini çizen soy ağacı (yüklenince akar). */
function AnimatedTree() {
  const edges = [
    "M60 46 V78 H200 V46",
    "M200 46 V78 H340 V46",
    "M130 78 V112",
    "M270 78 V112",
    "M130 140 V172 H270 V140",
    "M200 172 V196",
  ];
  const tops = [60, 200, 340];
  return (
    <svg viewBox="0 0 400 240" className="w-full h-auto" role="img" aria-label="Soy ağacı">
      <g stroke="var(--tree-edge)" strokeWidth="2.5" fill="none" strokeLinecap="round">
        {edges.map((d, i) => (
          <path key={d} d={d} className="draw-line" style={{ animationDelay: `${0.25 + i * 0.12}s` }} />
        ))}
      </g>
      {tops.map((x, i) => (
        <g key={x} className="node-pop" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
          <circle cx={x} cy={30} r={17} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="2" />
          <circle cx={x} cy={26} r={5.5} fill="var(--text-subtle)" opacity="0.55" />
          <path d={`M${x - 8} ${36} a 8 8 0 0 1 16 0`} fill="var(--text-subtle)" opacity="0.55" />
        </g>
      ))}
      {[
        { x: 130, y: 126, fill: "var(--male-soft)", stroke: "var(--male)", d: 0.9 },
        { x: 270, y: 126, fill: "var(--female-soft)", stroke: "var(--female)", d: 1.0 },
      ].map((c) => (
        <g key={c.x} className="node-pop" style={{ animationDelay: `${c.d}s` }}>
          <circle cx={c.x} cy={c.y} r={19} fill={c.fill} stroke={c.stroke} strokeWidth="2.2" />
          <circle cx={c.x} cy={c.y - 4} r={6} fill={c.stroke} opacity="0.75" />
          <path d={`M${c.x - 9} ${c.y + 7} a 9 9 0 0 1 18 0`} fill={c.stroke} opacity="0.75" />
        </g>
      ))}
      <g className="node-pop" style={{ animationDelay: "1.35s" }}>
        <circle cx={200} cy={210} r={22} fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="3" />
        <circle cx={200} cy={205} r={7} fill="var(--primary)" opacity="0.85" />
        <path d="M190 219 a 10 10 0 0 1 20 0" fill="var(--primary)" opacity="0.85" />
      </g>
    </svg>
  );
}

/** Hero yan kart — eski foto → restore + kısa video. */
function RestoreCard({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <div className="relative h-52 sm:h-56">
      <figure
        className="absolute left-0 top-2 w-32 sm:w-36 rounded-xl bg-[#efe6d4] p-2 pb-6 shadow-lg border border-black/10 float-soft"
        style={{ ["--tilt" as string]: "-7deg", animationDelay: "0.4s" }}
      >
        <div className="relative aspect-[4/5] rounded-md overflow-hidden grid place-items-center" style={{ background: "linear-gradient(145deg,#cbb48c,#9c815a)" }}>
          <span className="text-5xl" style={{ filter: "sepia(0.75) contrast(1.05) brightness(0.92)" }} aria-hidden>👵</span>
          <span className="absolute inset-0" style={{ background: "repeating-linear-gradient(115deg, transparent, transparent 20px, rgba(60,40,20,0.12) 21px, transparent 22px)" }} aria-hidden />
          <span className="absolute -top-1 right-2 w-6 h-6 bg-[#efe6d4] rotate-45" aria-hidden />
        </div>
        <figcaption className="absolute bottom-1 inset-x-0 text-center text-[10px] font-medium text-neutral-600">{t("land.hero.before")}</figcaption>
      </figure>

      <figure
        className="absolute right-0 top-7 w-36 sm:w-40 rounded-xl bg-white p-2 pb-6 shadow-xl border border-black/10 z-10 float-soft"
        style={{ ["--tilt" as string]: "4deg", animationDelay: "1.1s" }}
      >
        <div className="sheen relative aspect-[4/5] rounded-md overflow-hidden grid place-items-center" style={{ background: "linear-gradient(145deg,#f6ede0,#e7cfa6)" }}>
          <span className="text-5xl" aria-hidden>👵</span>
          <span className="absolute inset-0 grid place-items-center">
            <span className="w-10 h-10 rounded-full bg-black/45 backdrop-blur grid place-items-center pulse-ring">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            </span>
          </span>
          <span className="absolute bottom-1.5 right-1.5 text-[10px] font-semibold text-white bg-black/55 px-1.5 py-0.5 rounded">0:14</span>
        </div>
        <figcaption className="absolute bottom-1 inset-x-0 text-center text-[10px] font-medium text-neutral-700">{t("land.hero.after")}</figcaption>
      </figure>
    </div>
  );
}

/* Bento — büyük döşemeler öne çıkan yetenekler. */
const BENTO = [
  { key: "views", icon: "🌳", span: "sm:col-span-2" },
  { key: "ai", icon: "✨", span: "" },
  { key: "import", icon: "🔄", span: "" },
  { key: "book", icon: "📖", span: "sm:col-span-2" },
  { key: "kinship", icon: "👪", span: "" },
  { key: "media", icon: "🎞️", span: "" },
  { key: "privacy", icon: "🔒", span: "" },
  { key: "sharing", icon: "🤝", span: "" },
  { key: "map", icon: "🗺️", span: "" },
  { key: "quality", icon: "🧭", span: "" },
  { key: "records", icon: "🏛️", span: "" },
  { key: "multi", icon: "🗂️", span: "" },
] as const;

const TICKER = [
  "🌳 Ağaç", "🧬 Soy çizgisi", "🌀 Yelpaze", "🕰️ Zaman çizelgesi", "🗺️ Harita", "📊 Panel", "📖 Aile kitabı",
  "🎞️ Video", "🎧 Ses", "🖼️ Fotoğraf", "📜 Belge", "✨ Yapay zekâ", "🏛️ e-Devlet", "📂 GEDCOM",
  "🔒 Gizlilik", "🤝 Paylaşım", "🧭 Tutarlılık", "🖨️ PDF", "🌍 TR / EN", "🌙 Koyu tema",
];

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
            <Link href="/login" className="hidden sm:inline-flex h-9 items-center px-3.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium transition-colors">
              {t("land.nav.signin")}
            </Link>
            <button onClick={startDemo} disabled={demoLoading} className="h-9 inline-flex items-center px-3.5 rounded-lg bg-primary text-primary-text text-sm font-medium hover:brightness-110 transition-all disabled:opacity-60">
              {demoLoading ? t("land.demo.loading") : t("land.nav.demo")}
            </button>
          </div>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden">
        {/* Aurora — yavaşça devinen renk sisi */}
        <div className="absolute -top-52 -left-40 w-[760px] h-[620px] rounded-full opacity-[0.22] blur-3xl pointer-events-none aurora"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 66%)" }} aria-hidden />
        <div className="absolute -top-24 right-0 w-[560px] h-[520px] rounded-full opacity-[0.16] blur-3xl pointer-events-none aurora"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 68%)", animationDelay: "-7s" }} aria-hidden />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-12 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-1 rounded-full bg-primary-soft text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-ring" aria-hidden />
              {t("land.hero.kicker")}
            </span>

            <h1 className="font-serif text-[2.7rem] sm:text-6xl xl:text-7xl font-semibold leading-[1.02] tracking-tight mt-6">
              {t("land.hero.h1")}
            </h1>

            <p className="text-lg sm:text-xl text-text mt-6 max-w-xl mx-auto lg:mx-0 leading-snug font-medium">
              {t("land.hero.sub")}
            </p>
            <p className="text-sm sm:text-base text-text-muted mt-3 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              {t("land.hero.body")}
            </p>

            <div className="flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-3 mt-8">
              <button onClick={startDemo} disabled={demoLoading}
                className="w-full sm:w-auto py-3.5 inline-flex items-center justify-center px-8 rounded-xl bg-primary text-primary-text font-semibold hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60 shadow-card">
                {demoLoading ? t("land.demo.loading") : t("land.hero.ctaDemo")}
              </button>
              <Link href="/register"
                className="w-full sm:w-auto py-3.5 inline-flex items-center justify-center px-8 rounded-xl border border-border-strong bg-surface hover:bg-surface-2 font-semibold transition-colors">
                {t("land.final.ctaRegister")}
              </Link>
            </div>
            <p className="text-xs text-text-subtle mt-4">{t("land.hero.trust")}</p>
          </div>

          <div className="relative">
            <div className="rounded-3xl border border-border bg-surface/80 backdrop-blur shadow-card p-5 sm:p-7">
              <AnimatedTree />
              <div className="mt-2">
                <RestoreCard t={t} />
              </div>
              <p className="text-xs text-text-muted leading-relaxed mt-2">{t("land.hero.restoreCap")}</p>
            </div>
          </div>
        </div>

        {/* Sayılarla — özgül rakamlar (görününce sayar) */}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pb-14">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-4 rounded-2xl border border-border bg-surface/70 backdrop-blur px-6 py-6 text-center sm:text-left">
            <Stat value={346} label={t("land.stat.people")} />
            <Stat value={17} label={t("land.stat.gen")} />
            <Stat value={505} label={t("land.stat.years")} />
            <Stat value={7} label={t("land.stat.views")} />
          </div>
        </div>
      </section>

      {/* ---- Yetenek şeridi ---- */}
      <section className="border-y border-border bg-surface py-6 overflow-hidden marquee-wrap">
        <p className="text-center text-[11px] uppercase tracking-[0.18em] text-text-subtle mb-4">{t("land.ticker.label")}</p>
        <div className="marquee-mask">
          <div className="marquee-track flex gap-3 w-max">
            {[...TICKER, ...TICKER].map((item, i) => (
              <span key={i} className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-bg text-sm text-text">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Aile kitabı (flipbook) ---- */}
      <section className="bg-bg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1 sd-reveal" style={{ perspective: "1400px" }}>
            <div className="relative mx-auto max-w-md rounded-lg shadow-2xl" style={{ transform: "rotateX(6deg) rotateY(-12deg)", transformStyle: "preserve-3d" }}>
              <div className="flex h-64 sm:h-72">
                <div className="flex-1 rounded-l-lg p-5 font-serif" style={{ background: "linear-gradient(145deg,#e7d7b4,#d9c398)", color: "#5a4a34", boxShadow: "inset 0 0 60px rgba(120,80,30,0.22)" }}>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-60 text-center mb-2">3. Kuşak</p>
                  <p className="font-semibold">Ayşe Yıldız</p>
                  <p className="text-xs italic opacity-70 mb-2">1928 – 2011</p>
                  <p className="text-[11px] leading-relaxed opacity-80">Köyün ebesiydi; kırk yıl boyunca doğumlara girdi. Sesi güzeldi, düğünlerde türkü söylerdi…</p>
                </div>
                <div className="w-1.5 bg-gradient-to-r from-black/25 via-black/10 to-black/25" aria-hidden />
                <div className="relative flex-1 rounded-r-lg p-5 font-serif" style={{ background: "linear-gradient(145deg,#faf6ec,#f0e6d2)", color: "#2b2117", boxShadow: "inset 0 0 40px rgba(120,80,30,0.10)" }}>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-50 text-center mb-2">6. Kuşak</p>
                  <p className="font-semibold">Bade Acar</p>
                  <p className="text-xs italic opacity-60 mb-2">2025 –</p>
                  <p className="text-[11px] leading-relaxed opacity-80">Ailenin en küçüğü. Beşinci kuşağı; büyük büyük büyük anneannesi onu kucağına aldı.</p>
                  <div className="absolute bottom-0 right-0 w-10 h-10 rounded-tl-xl" style={{ background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.10) 50%, #efe4cc 52%)", boxShadow: "-2px -2px 6px rgba(0,0,0,0.12)" }} aria-hidden />
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 text-center lg:text-left sd-reveal">
            <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] px-3 py-1 rounded-full bg-accent-soft text-accent">
              📖 {t("land.book.badge")}
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl font-semibold mt-4 leading-[1.08]">{t("land.book.title")}</h2>
            <p className="text-text-muted mt-4 leading-relaxed max-w-md mx-auto lg:mx-0">{t("land.book.body")}</p>
            <button onClick={startDemo} disabled={demoLoading}
              className="mt-6 h-11 inline-flex items-center justify-center px-6 rounded-xl bg-primary text-primary-text font-medium hover:brightness-110 hover:-translate-y-0.5 transition-all disabled:opacity-60">
              {demoLoading ? t("land.demo.loading") : t("land.book.cta")}
            </button>
          </div>
        </div>
      </section>

      {/* ---- Yapay zekâ — sinematik koyu bant ---- */}
      <section className="relative overflow-hidden text-[var(--primary-text)]" style={{ background: "linear-gradient(150deg, #12241b, #1f6b47 55%, #175036)" }}>
        <div className="absolute -bottom-32 -right-20 w-[520px] h-[520px] rounded-full opacity-30 blur-3xl pointer-events-none aurora"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }} aria-hidden />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="sd-reveal">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] px-3 py-1 rounded-full bg-white/15 backdrop-blur">
              ✨ {t("land.ai.badge")}
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl font-semibold mt-4 leading-[1.08]">{t("land.ai.title")}</h2>
            <p className="opacity-85 mt-4 leading-relaxed max-w-md">{t("land.ai.body")}</p>
            <ul className="mt-6 space-y-2.5">
              {["b1", "b2", "b3"].map((k) => (
                <li key={k} className="flex items-start gap-2.5 text-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-0.5 shrink-0">
                    <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.16)" />
                    <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t(`land.ai.${k}`)}
                </li>
              ))}
            </ul>
          </div>

          {/* Sohbet önizlemesi */}
          <div className="sd-reveal rounded-2xl bg-white/10 backdrop-blur border border-white/15 p-4 sm:p-5 shadow-2xl">
            <div className="flex justify-end mb-3">
              <span className="max-w-[85%] rounded-2xl rounded-br-md bg-white/90 text-[#12241b] px-3.5 py-2 text-sm font-medium">
                {t("land.ai.chat.q")}
              </span>
            </div>
            <div className="flex justify-start">
              <span className="max-w-[90%] rounded-2xl rounded-bl-md bg-black/25 px-3.5 py-2 text-sm leading-relaxed">
                {t("land.ai.chat.a")}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <span className="flex-1 h-10 rounded-xl bg-white/10 border border-white/15 px-3 grid items-center text-xs opacity-60">
                {t("ai.chat.placeholder")}
              </span>
              <span className="h-10 px-4 rounded-xl bg-white/90 text-[#12241b] text-sm font-semibold grid place-items-center">
                {t("ai.chat.send")}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Özellikler (bento) ---- */}
      <section id="ozellikler" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12 sd-reveal">
          <h2 className="font-serif text-3xl sm:text-5xl font-semibold leading-[1.08]">{t("land.features.title")}</h2>
          <p className="text-text-muted mt-4 max-w-lg mx-auto">{t("land.features.subtitle")}</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sd-stagger">
          {BENTO.map((f) => (
            <div key={f.key}
              className={`${f.span} group rounded-2xl border border-border bg-surface p-5 sm:p-6 hover:border-primary/40 hover:shadow-card hover:-translate-y-1 transition-all duration-300`}>
              <div className="w-12 h-12 rounded-xl bg-primary-soft grid place-items-center text-2xl mb-4 group-hover:scale-110 transition-transform duration-300" aria-hidden>
                {f.icon}
              </div>
              <h3 className="font-semibold text-base">{t(`land.feat.${f.key}.t`)}</h3>
              <p className="text-sm text-text-muted leading-relaxed mt-1.5">{t(`land.feat.${f.key}.b`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Nasıl çalışır ---- */}
      <section id="nasil" className="scroll-mt-20 bg-surface border-y border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <h2 className="font-serif text-3xl sm:text-5xl font-semibold text-center mb-14 leading-[1.08] sd-reveal">{t("land.how.title")}</h2>
          <div className="grid sm:grid-cols-3 gap-8 sd-stagger">
            {STEPS.map((n) => (
              <div key={n} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary text-primary-text font-serif text-2xl font-semibold grid place-items-center mx-auto mb-5 shadow-soft">
                  {n}
                </div>
                <h3 className="font-semibold text-lg">{t(`land.step.${n}.t`)}</h3>
                <p className="text-sm text-text-muted leading-relaxed mt-2 max-w-xs mx-auto">{t(`land.step.${n}.b`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- SSS ---- */}
      <section id="sss" className="scroll-mt-20 max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <h2 className="font-serif text-3xl sm:text-5xl font-semibold text-center mb-12 leading-[1.08] sd-reveal">{t("land.faq.title")}</h2>
        <div className="space-y-3 sd-stagger">
          {FAQS.map((n) => (
            <details key={n} className="group rounded-2xl border border-border bg-surface p-5 open:bg-surface-2 hover:border-border-strong transition-colors">
              <summary className="flex items-center justify-between gap-3 cursor-pointer font-medium list-none">
                {t(`land.faq.${n}.q`)}
                <span className="text-text-subtle group-open:rotate-45 transition-transform duration-300 text-xl leading-none" aria-hidden>+</span>
              </summary>
              <p className="text-sm text-text-muted leading-relaxed mt-3">{t(`land.faq.${n}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---- Son CTA ---- */}
      <section className="relative overflow-hidden border-t border-border bg-surface">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[720px] h-[420px] rounded-full opacity-[0.18] blur-3xl pointer-events-none aurora"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 66%)" }} aria-hidden />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center sd-reveal">
          <h2 className="font-serif text-3xl sm:text-5xl font-semibold max-w-2xl mx-auto leading-[1.08]">{t("land.final.title")}</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <button onClick={startDemo} disabled={demoLoading}
              className="w-full sm:w-auto py-3.5 inline-flex items-center justify-center px-8 rounded-xl bg-primary text-primary-text font-semibold hover:brightness-110 hover:-translate-y-0.5 transition-all disabled:opacity-60 shadow-card">
              {demoLoading ? t("land.demo.loading") : t("land.final.ctaDemo")}
            </button>
            <Link href="/register"
              className="w-full sm:w-auto py-3.5 inline-flex items-center justify-center px-8 rounded-xl border border-border-strong bg-bg hover:bg-surface-2 font-semibold transition-colors">
              {t("land.final.ctaRegister")}
            </Link>
          </div>
          <p className="text-xs text-text-subtle mt-5">{t("land.hero.trust")}</p>
        </div>
      </section>

      {/* ---- Alt bilgi ---- */}
      <footer className="border-t border-border bg-bg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary grid place-items-center">
                  <BrandMark stroke="var(--primary-text)" className="scale-90" />
                </div>
                <span className="font-serif font-semibold">{t("auth.brand")}</span>
              </div>
              <p className="text-sm text-text-muted leading-relaxed max-w-[16rem]">{t("land.footer.tagline")}</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-3">{t("land.footer.product")}</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#ozellikler" className="text-text-muted hover:text-text transition-colors">{t("land.nav.features")}</a></li>
                <li><a href="#nasil" className="text-text-muted hover:text-text transition-colors">{t("land.nav.how")}</a></li>
                <li><button onClick={startDemo} className="text-text-muted hover:text-text transition-colors">{t("land.demo.cta")}</button></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-3">{t("land.footer.account")}</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/login" className="text-text-muted hover:text-text transition-colors">{t("land.nav.signin")}</Link></li>
                <li><Link href="/register" className="text-text-muted hover:text-text transition-colors">{t("land.final.ctaRegister")}</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-3">{t("land.footer.resources")}</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#sss" className="text-text-muted hover:text-text transition-colors">{t("land.nav.faq")}</a></li>
                <li><div className="pt-1"><LanguageSwitch /></div></li>
              </ul>
            </div>

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
