"use client";

import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitch from "./LanguageSwitch";
import { useT } from "@/lib/i18n";

/** Basit, herkese açık yasal metin sayfası (Gizlilik / Şartlar). */
export default function LegalPage({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const t = useT();
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary grid place-items-center shadow-soft">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 22V11M12 11L7.5 7.5M12 11l4.5-3.5" stroke="var(--primary-text)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="4.5" r="2.6" stroke="var(--primary-text)" strokeWidth="2" />
                <circle cx="5.5" cy="9" r="2.4" stroke="var(--primary-text)" strokeWidth="2" />
                <circle cx="18.5" cy="9" r="2.4" stroke="var(--primary-text)" strokeWidth="2" />
              </svg>
            </div>
            <span className="font-serif text-lg font-semibold">{t("auth.brand")}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold">{t(titleKey)}</h1>
        <p className="text-xs text-text-subtle mt-2">{t("legal.updated")}</p>

        <div className="mt-8 text-[15px] text-text leading-relaxed whitespace-pre-line">
          {t(bodyKey)}
        </div>

        <p className="mt-10 pt-6 border-t border-border text-sm text-text-muted">{t("legal.operator")}</p>

        <div className="mt-8">
          <Link href="/" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border bg-surface hover:bg-surface-2 text-sm font-medium transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t("legal.back")}
          </Link>
        </div>
      </main>
    </div>
  );
}
