"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitch from "./LanguageSwitch";
import { usePrivacy } from "./PrivacyContext";
import { useReadOnly } from "./ReadOnlyContext";
import { useT } from "@/lib/i18n";

export type ViewKey = "agac" | "soy" | "yelpaze" | "liste" | "harita" | "panel";

/** Simgeler ve anahtarlar sabit; etiket/ipucu metinleri i18n sözlüğünden okunur. */
export const VIEWS: Array<{ key: ViewKey; icon: string }> = [
  { key: "agac", icon: "M12 3v18M12 8L6 12M12 8l6 4M12 14l-4 3M12 14l4 3" },
  { key: "soy", icon: "M12 21V3M12 3L5 8M12 3l7 5M5 8v8M19 8v8" },
  { key: "yelpaze", icon: "M12 21a9 9 0 019-9M12 21a9 9 0 00-9-9M12 21V10M12 21l5.5-4M12 21l-5.5-4" },
  { key: "liste", icon: "M4 6h16M4 12h16M4 18h16" },
  { key: "harita", icon: "M12 21s6-5.6 6-10.4A6 6 0 006 10.6C6 15.4 12 21 12 21z M12 8.4a2.1 2.1 0 100 4.2 2.1 2.1 0 000-4.2z" },
  { key: "panel", icon: "M4 13h6V4H4v9zm10 7h6v-9h-6v9zM4 20h6v-4H4v4zm10-11h6V4h-6v5z" },
];

interface Props {
  familyName?: string;
  view: ViewKey;
  onViewChange: (v: ViewKey) => void;
  onSearch: () => void;
  onImportExport: () => void;
  peopleCount: number;
}

export default function TopBar({
  familyName,
  view,
  onViewChange,
  onSearch,
  onImportExport,
  peopleCount,
}: Props) {
  const router = useRouter();
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const { hideLiving, setHideLiving } = usePrivacy();
  const { readOnly, setReadOnly } = useReadOnly();

  return (
    <header className="relative z-30 shrink-0 bg-bg-elevated/85 backdrop-blur-xl border-b border-border">
      <div className="h-14 px-3 sm:px-4 flex items-center gap-3">
        {/* Marka */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary grid place-items-center shrink-0 shadow-soft">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 22V11M12 11L7.5 7.5M12 11l4.5-3.5"
                stroke="var(--primary-text)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="12" cy="4.5" r="2.6" stroke="var(--primary-text)" strokeWidth="2" />
              <circle cx="5.5" cy="9" r="2.4" stroke="var(--primary-text)" strokeWidth="2" />
              <circle cx="18.5" cy="9" r="2.4" stroke="var(--primary-text)" strokeWidth="2" />
            </svg>
          </div>
          <div className="min-w-0 hidden xs:block sm:block">
            <p className="font-serif font-semibold text-[15px] leading-tight text-text truncate">
              {familyName ? `${familyName}` : t("topbar.appName")}
            </p>
            <p className="text-[11px] leading-tight text-text-subtle">
              {t("common.peopleCount", { count: peopleCount })}
            </p>
          </div>
        </div>

        {/* Görünüm seçici — segmented control */}
        <nav
          className="mx-auto flex items-center gap-0.5 p-1 rounded-xl bg-surface-2 border border-border"
          aria-label={t("topbar.viewAria")}
        >
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => onViewChange(v.key)}
              title={t(`view.${v.key}.hint`)}
              aria-current={view === v.key}
              className={`
                flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-lg text-xs font-medium
                transition-all duration-150
                ${
                  view === v.key
                    ? "bg-bg-elevated text-text shadow-soft"
                    : "text-text-muted hover:text-text"
                }
              `}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d={v.icon} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{t(`view.${v.key}.label`)}</span>
            </button>
          ))}
        </nav>

        {/* Sağ aksiyonlar */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onSearch}
            className="flex items-center gap-2 h-9 pl-2.5 pr-2 md:pr-3 rounded-lg border border-border bg-surface hover:bg-surface-2 hover:border-border-strong text-text-muted transition-colors"
            aria-label={t("topbar.search")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.9" />
              <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
            <span className="hidden md:inline text-xs">{t("topbar.search")}</span>
            <kbd className="hidden md:inline text-[10px] font-sans px-1.5 py-0.5 rounded border border-border bg-surface-2 text-text-subtle">
              ⌘K
            </kbd>
          </button>

          {/* Yaşayanları gizle — KVKK/GDPR dostu görüntü katmanı */}
          <button
            onClick={() => setHideLiving(!hideLiving)}
            aria-label={t("topbar.hideLiving")}
            aria-pressed={hideLiving}
            title={hideLiving ? t("topbar.hideLivingOn") : t("topbar.hideLivingOff")}
            className={`flex items-center gap-2 h-9 pl-2.5 pr-2 md:pr-3 rounded-lg border transition-colors ${
              hideLiving
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-surface hover:bg-surface-2 hover:border-border-strong text-text-muted"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              {hideLiving ? (
                <path
                  d="M6 10V8a6 6 0 0112 0v2M5 10h14v10H5V10z"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M6 10V8a6 6 0 0111.5-2.4M5 10h14v10H5V10z"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
            <span className="hidden md:inline text-xs">{t("topbar.hideLiving")}</span>
          </button>

          {/* Görüntüleme modu — arayüz düzeyinde salt-okunur katman (sunucu izni değil) */}
          <button
            onClick={() => setReadOnly(!readOnly)}
            aria-label={t("topbar.readOnly")}
            aria-pressed={readOnly}
            title={readOnly ? t("topbar.readOnlyOn") : t("topbar.readOnlyOff")}
            className={`flex items-center gap-2 h-9 pl-2.5 pr-2 md:pr-3 rounded-lg border transition-colors ${
              readOnly
                ? "border-primary bg-primary-soft text-primary"
                : "border-border bg-surface hover:bg-surface-2 hover:border-border-strong text-text-muted"
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              {readOnly ? (
                // Göz — görüntüleme modu açık
                <>
                  <path
                    d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.9" />
                </>
              ) : (
                // Açık kilit — düzenleme serbest
                <path
                  d="M7 10V7a5 5 0 019.6-2M6 10h12v10H6V10z"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
            <span className="hidden md:inline text-xs">{t("topbar.readOnly")}</span>
          </button>

          <LanguageSwitch />

          <ThemeToggle />

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={t("topbar.menu")}
              aria-expanded={menuOpen}
              className="w-9 h-9 grid place-items-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="5" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="12" cy="19" r="1.7" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-border bg-bg-elevated shadow-float overflow-hidden animate-scale-in origin-top-right">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onImportExport();
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-text hover:bg-surface-2 transition-colors text-left"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-text-muted">
                      <path d="M12 3v12M12 15l-4-4M12 15l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t("common.gedcom")}
                  </button>
                  <div className="h-px bg-border" />
                  <button
                    onClick={async () => {
                      setMenuOpen(false);
                      await signOut({ redirect: false });
                      router.push("/login");
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-text hover:bg-surface-2 transition-colors text-left"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-text-muted">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t("topbar.signOut")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
