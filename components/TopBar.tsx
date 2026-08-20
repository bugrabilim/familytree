"use client";

import { useRef, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import TreeSwitcher from "./TreeSwitcher";
import { useT, type TFunction } from "@/lib/i18n";
import useClickOutside from "@/lib/useClickOutside";
import type { TreeMeta } from "@/lib/trees";

export type ViewKey = "agac" | "soy" | "yelpaze" | "zaman" | "liste" | "tablo" | "harita" | "panel" | "kitap";

/** Simgeler ve anahtarlar sabit; etiket/ipucu metinleri i18n sözlüğünden okunur. */
export const VIEWS: Array<{ key: ViewKey; icon: string }> = [
  { key: "agac", icon: "M12 3v18M12 8L6 12M12 8l6 4M12 14l-4 3M12 14l4 3" },
  { key: "soy", icon: "M12 21V3M12 3L5 8M12 3l7 5M5 8v8M19 8v8" },
  { key: "yelpaze", icon: "M12 21a9 9 0 019-9M12 21a9 9 0 00-9-9M12 21V10M12 21l5.5-4M12 21l-5.5-4" },
  { key: "zaman", icon: "M4 7h11M4 12h16M4 17h7M18 15l3 2-3 2" },
  { key: "liste", icon: "M4 6h16M4 12h16M4 18h16" },
  { key: "harita", icon: "M12 21s6-5.6 6-10.4A6 6 0 006 10.6C6 15.4 12 21 12 21z M12 8.4a2.1 2.1 0 100 4.2 2.1 2.1 0 000-4.2z" },
  { key: "panel", icon: "M4 13h6V4H4v9zm10 7h6v-9h-6v9zM4 20h6v-4H4v4zm10-11h6V4h-6v5z" },
  { key: "kitap", icon: "M4 5a2 2 0 012-2h5v16H6a2 2 0 00-2 2V5zM20 5a2 2 0 00-2-2h-5v16h5a2 2 0 012 2V5z" },
];

/** Görünüm sekmeleri — masaüstünde ortalanmış nav, mobilde tam-genişlik satır
 *  için ortak render. Mobilde eşit paylaşımla (flex-1) yeterli dokunma hedefi;
 *  taşarsa yatay kaydırılabilir. */
function ViewTabs({
  view,
  onViewChange,
  t,
}: {
  view: ViewKey;
  onViewChange: (v: ViewKey) => void;
  t: TFunction;
}) {
  return (
    <>
      {VIEWS.map((v) => (
        <button
          key={v.key}
          onClick={() => onViewChange(v.key)}
          title={t(`view.${v.key}.hint`)}
          aria-current={view === v.key}
          className={`
            flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-1.5
            h-9 sm:h-8 px-2 sm:px-3 rounded-lg text-xs font-medium
            transition-all duration-150 min-w-0
            ${
              view === v.key
                ? "bg-bg-elevated text-text shadow-soft"
                : "text-text-muted hover:text-text"
            }
          `}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
            <path d={v.icon} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">{t(`view.${v.key}.label`)}</span>
        </button>
      ))}
    </>
  );
}

interface Props {
  familyName?: string;
  view: ViewKey;
  onViewChange: (v: ViewKey) => void;
  onSearch: () => void;
  /** ⋮ menüsünden Ayarlar / Paylaş hub'larını açar. */
  onOpenSettings: () => void;
  onOpenShare: () => void;
  /** Yapay zekâ soru-cevap penceresini açar (düzenleyici + AI bağlıysa). */
  onAiChat?: () => void;
  peopleCount: number;
  /** Çoklu ağaç (yalnız founder). Verilmezse marka adı statik gösterilir. */
  trees?: Array<TreeMeta & { home: boolean }>;
  activeTreeId?: string;
  isFounder?: boolean;
  /** Herkese açık salt-okunur görünüm: sahip menüsü/çıkış gizlenir, kayıt CTA'sı gösterilir. */
  publicView?: boolean;
}

export default function TopBar({
  familyName,
  view,
  onViewChange,
  onSearch,
  onOpenSettings,
  onOpenShare,
  onAiChat,
  peopleCount,
  trees,
  activeTreeId,
  isFounder,
  publicView,
}: Props) {
  const showSwitcher = !!(isFounder && trees && trees.length > 0 && activeTreeId);
  const router = useRouter();
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  return (
    <header className="relative z-[45] shrink-0 bg-bg-elevated/85 backdrop-blur-xl border-b border-border">
      <div className="h-14 px-3 sm:px-4 flex items-center gap-2 sm:gap-3">
        {/* Marka */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
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
          {showSwitcher ? (
            <div className="min-w-0 hidden sm:block">
              <TreeSwitcher trees={trees!} activeTreeId={activeTreeId!} peopleCount={peopleCount} />
            </div>
          ) : (
            <div className="min-w-0 hidden sm:block">
              <p className="font-serif font-semibold text-[15px] leading-tight text-text truncate">
                {familyName ? `${familyName}` : t("topbar.appName")}
              </p>
              <p className="text-[11px] leading-tight text-text-subtle">
                {t("common.peopleCount", { count: peopleCount })}
              </p>
            </div>
          )}
        </div>

        {/* Görünüm seçici — segmented control (masaüstü: ortalanmış).
            Mobilde bu satırda yer olmadığından aşağıdaki tam-genişlik satıra taşınır. */}
        <nav
          className="hidden sm:flex mx-auto items-center gap-0.5 p-1 rounded-xl bg-surface-2 border border-border"
          aria-label={t("topbar.viewAria")}
        >
          <ViewTabs view={view} onViewChange={onViewChange} t={t} />
        </nav>

        {/* Sağ aksiyonlar */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 ml-auto sm:ml-0">
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

          {/* Yapay zekâya sor — üst çubukta görünür düğme (Madde 5) */}
          {onAiChat && (
            <button
              onClick={onAiChat}
              title={t("ai.chat.menu")}
              aria-label={t("ai.chat.menu")}
              className="flex items-center gap-1.5 h-9 pl-2.5 pr-2 md:pr-3 rounded-lg border border-primary/30 bg-primary-soft text-primary hover:brightness-105 transition-all"
            >
              <span className="text-sm leading-none" aria-hidden>✨</span>
              <span className="hidden md:inline text-xs font-medium">{t("ai.chat.short")}</span>
            </button>
          )}

          {publicView ? (
            <a
              href="/register"
              className="flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-text text-xs font-medium hover:brightness-110 transition-all whitespace-nowrap"
            >
              {t("public.createOwn")}
            </a>
          ) : (
          <div className="relative" ref={menuRef}>
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
                <div className="absolute right-0 top-11 z-20 w-48 rounded-xl border border-border bg-bg-elevated shadow-float animate-scale-in origin-top-right py-1">
                  <MenuBtn
                    label={t("menu.share")}
                    onClick={() => { setMenuOpen(false); onOpenShare(); }}
                    icon={<path d="M15 8a3 3 0 10-2.8-4M15 8a3 3 0 01-2.8 4M6 12a3 3 0 100 6 3 3 0 000-6zm0 0l6-2m0 8l-6-2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />}
                  />
                  <MenuBtn
                    label={t("menu.settings")}
                    onClick={() => { setMenuOpen(false); onOpenSettings(); }}
                    icon={<path d="M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 13a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 004 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 002.6 13H2.5a2 2 0 110-4h.1A1.7 1.7 0 004.6 6.1L4.5 6a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 2.6V2.5a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9h.1a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
                  />
                  <div className="h-px bg-border my-1" />
                  <MenuBtn
                    label={t("topbar.signOut")}
                    onClick={async () => { setMenuOpen(false); await signOut({ redirect: false }); router.push("/login"); }}
                    icon={<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />}
                  />
                </div>
              </>
            )}
          </div>
          )}
        </div>
      </div>

      {/* Görünüm seçici — mobil satır: tam genişlik, taşarsa yatay kaydırılabilir.
          Masaüstünde gizli (nav yukarıda ortalanmış gösterilir). */}
      <div className="sm:hidden px-3 pb-2">
        <nav
          className="flex items-center gap-0.5 p-1 rounded-xl bg-surface-2 border border-border overflow-x-auto no-scrollbar"
          aria-label={t("topbar.viewAria")}
        >
          <ViewTabs view={view} onViewChange={onViewChange} t={t} />
        </nav>
      </div>
    </header>
  );
}

/* ── Menü (⋮) yardımcıları — Ayarlar/Paylaş dropdown'ı ── */

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-text-muted shrink-0">
      {children}
    </svg>
  );
}

function MenuBtn({ label, onClick, icon }: { label: string; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-text hover:bg-surface-2 transition-colors text-left"
    >
      <MenuIcon>{icon}</MenuIcon>
      {label}
    </button>
  );
}

