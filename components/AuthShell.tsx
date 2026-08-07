import type { ReactNode } from "react";
import ThemeToggle from "./ThemeToggle";

export const authField =
  "w-full h-11 px-3.5 rounded-xl bg-surface border border-border text-text text-sm placeholder:text-text-subtle " +
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

export const authLabel = "block text-xs font-medium text-text-muted mb-1.5";

const HIGHLIGHTS = [
  { icon: "🌳", title: "Dört görünüm", body: "Ağaç, soy çizgisi, liste ve özet paneli." },
  { icon: "👨‍👩‍👧‍👦", title: "Türkçe akrabalık", body: "Amca mı dayı mı — uygulama hesaplar." },
  { icon: "📄", title: "GEDCOM uyumlu", body: "Verini dilediğin an dışa aktar." },
];

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
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Tanıtım paneli */}
      <aside className="hidden lg:flex flex-col justify-between w-[46%] max-w-2xl p-12 bg-primary text-[var(--primary-text)] relative overflow-hidden">
        {/* Dekoratif desen */}
        <svg
          className="absolute -right-24 -bottom-24 w-[520px] h-[520px] opacity-[0.07]"
          viewBox="0 0 200 200"
          fill="none"
          aria-hidden
        >
          <circle cx="100" cy="26" r="16" stroke="currentColor" strokeWidth="3" />
          <path d="M100 42v28M40 70h120M40 70v26M160 70v26M100 70v26" stroke="currentColor" strokeWidth="3" />
          <circle cx="40" cy="112" r="16" stroke="currentColor" strokeWidth="3" />
          <circle cx="100" cy="112" r="16" stroke="currentColor" strokeWidth="3" />
          <circle cx="160" cy="112" r="16" stroke="currentColor" strokeWidth="3" />
          <path d="M40 128v20M100 128v20M20 148h100M20 148v22M120 148v22" stroke="currentColor" strokeWidth="3" />
          <circle cx="20" cy="186" r="15" stroke="currentColor" strokeWidth="3" />
          <circle cx="120" cy="186" r="15" stroke="currentColor" strokeWidth="3" />
        </svg>

        <div className="relative">
          <div className="flex items-center gap-2.5 mb-14">
            <div className="w-9 h-9 rounded-xl bg-white/15 grid place-items-center backdrop-blur">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 22V11M12 11L7.5 7.5M12 11l4.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="4.5" r="2.6" stroke="currentColor" strokeWidth="2" />
                <circle cx="5.5" cy="9" r="2.4" stroke="currentColor" strokeWidth="2" />
                <circle cx="18.5" cy="9" r="2.4" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <span className="font-serif text-lg font-semibold">Soy Ağacı</span>
          </div>

          <h2 className="font-serif text-4xl font-semibold leading-[1.15] max-w-md">
            Ailenin hikâyesi,
            <br />
            kuşaklar boyu.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed opacity-80 max-w-sm">
            Adları, tarihleri ve anıları tek bir yerde topla. Ağacı birlikte büyütün,
            hiçbir hikâye kaybolmasın.
          </p>
        </div>

        <ul className="relative space-y-4 mt-12">
          {HIGHLIGHTS.map((h) => (
            <li key={h.title} className="flex items-start gap-3">
              <span className="text-lg shrink-0 leading-none mt-0.5" aria-hidden>{h.icon}</span>
              <div>
                <p className="text-sm font-medium leading-tight">{h.title}</p>
                <p className="text-[13px] opacity-70 leading-snug mt-0.5">{h.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* Form paneli */}
      <main className="flex-1 flex flex-col bg-bg">
        <div className="flex justify-end p-4">
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center px-5 pb-14">
          <div className="w-full max-w-[360px]">
            <div className="text-center mb-8">
              {icon ? (
                <div className="text-4xl mb-3">{icon}</div>
              ) : (
                <div className="lg:hidden w-12 h-12 rounded-2xl bg-primary grid place-items-center mx-auto mb-4 shadow-card">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M12 22V11M12 11L7.5 7.5M12 11l4.5-3.5" stroke="var(--primary-text)" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="12" cy="4.5" r="2.6" stroke="var(--primary-text)" strokeWidth="2" />
                    <circle cx="5.5" cy="9" r="2.4" stroke="var(--primary-text)" strokeWidth="2" />
                    <circle cx="18.5" cy="9" r="2.4" stroke="var(--primary-text)" strokeWidth="2" />
                  </svg>
                </div>
              )}
              <h1 className="font-serif text-2xl font-semibold text-text">{title}</h1>
              {subtitle && (
                <p className="text-sm text-text-muted mt-1.5 leading-relaxed">{subtitle}</p>
              )}
            </div>

            {children}

            {footer && <div className="mt-6 text-center text-sm text-text-muted">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
