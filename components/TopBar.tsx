"use client";

import { useRef, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitch from "./LanguageSwitch";
import TreeSwitcher from "./TreeSwitcher";
import { usePrivacy } from "./PrivacyContext";
import { useReadOnly } from "./ReadOnlyContext";
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
  onImportExport: () => void;
  /** Açık görünümü (ağaç/harita/soy/panel) yazdır (Madde 8). */
  onPrintView: () => void;
  /** Yalnız yönetici (admin) için — verilmezse üye yönetimi menüsü gizli. */
  onManageMembers?: () => void;
  /** Yalnız yönetici (admin) için — herkese açık paylaşım bağlantısı. */
  onShare?: () => void;
  /** Yalnız yönetici (admin) için — hesaplar arası ağaç eşleştirme. */
  onPair?: () => void;
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
  onImportExport,
  onPrintView,
  onManageMembers,
  onShare,
  onPair,
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
  const { hideLiving, setHideLiving, forced: privacyForced } = usePrivacy();
  const { readOnly, setReadOnly, forced } = useReadOnly();

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
                <div className="absolute right-0 top-11 z-20 w-60 max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-bg-elevated shadow-float animate-scale-in origin-top-right">
                  {/* ── AYARLAR ── */}
                  <div className="px-3.5 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                    {t("menu.settings")}
                  </div>

                  {/* Yaşayanları gizle (toggle) */}
                  <MenuSwitch
                    label={t("topbar.hideLiving")}
                    on={hideLiving}
                    disabled={privacyForced}
                    onClick={() => setHideLiving(!hideLiving)}
                    icon={<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 9.4a2.6 2.6 0 100 5.2 2.6 2.6 0 000-5.2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
                  />

                  {/* Tema */}
                  <div className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-text">
                    <span className="flex items-center gap-2.5">
                      <MenuIcon><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6L4.5 4.5M19.5 19.5L18 18M6 18l-1.5 1.5M19.5 4.5L18 6M12 8a4 4 0 100 8 4 4 0 000-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></MenuIcon>
                      {t("menu.theme")}
                    </span>
                    <ThemeToggle />
                  </div>

                  {/* Dil */}
                  <div className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-text">
                    <span className="flex items-center gap-2.5">
                      <MenuIcon><path d="M4 5h10M9 3v2M11 5c0 5-3 9-7 11M6 9c0 3 3 5 7 6M13 21l4-9 4 9M15 17h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></MenuIcon>
                      {t("menu.language")}
                    </span>
                    <LanguageSwitch />
                  </div>

                  {/* İçe / dışa aktar */}
                  <MenuBtn
                    label={t("common.gedcom")}
                    onClick={() => { setMenuOpen(false); onImportExport(); }}
                    icon={<path d="M12 3v12M12 15l-4-4M12 15l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />}
                  />

                  {/* Tablo — toplu düzenle & sil */}
                  <MenuBtn
                    label={t("view.tablo.label")}
                    onClick={() => { setMenuOpen(false); onViewChange("tablo"); }}
                    icon={<path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
                  />

                  {/* Bağlı ağaçlar */}
                  {onPair && (
                    <MenuBtn
                      label={t("pair.menu")}
                      onClick={() => { setMenuOpen(false); onPair(); }}
                      icon={<path d="M8 7a3 3 0 100 6 3 3 0 000-6zm8-2a3 3 0 100 6 3 3 0 000-6zM11 10h2M3 20v-1a4 4 0 014-4h2M14 20v-1a4 4 0 014-4h1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
                    />
                  )}

                  <div className="h-px bg-border my-1" />

                  {/* ── PAYLAŞ ── */}
                  <div className="px-3.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                    {t("menu.share")}
                  </div>

                  {onShare && (
                    <MenuBtn
                      label={t("share.menu")}
                      onClick={() => { setMenuOpen(false); onShare(); }}
                      icon={<path d="M15 8a3 3 0 10-2.8-4M15 8a3 3 0 01-2.8 4M6 12a3 3 0 100 6 3 3 0 000-6zm0 0l6-2m0 8l-6-2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />}
                    />
                  )}

                  {/* Görüntüleme modu (salt-okunur) */}
                  <MenuSwitch
                    label={t("topbar.readOnly")}
                    on={readOnly || forced}
                    disabled={forced}
                    onClick={() => setReadOnly(!readOnly)}
                    icon={<path d="M7 10V7a5 5 0 0110 0v3M6 10h12v10H6V10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
                  />

                  {onManageMembers && (
                    <MenuBtn
                      label={t("members.menu")}
                      onClick={() => { setMenuOpen(false); onManageMembers(); }}
                      icon={<path d="M16 20v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19 8v6M22 11h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
                    />
                  )}

                  <div className="h-px bg-border my-1" />

                  {/* ── Genel ── */}
                  <MenuBtn
                    label={t("topbar.home")}
                    onClick={() => { setMenuOpen(false); router.push("/tanitim"); }}
                    icon={<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />}
                  />
                  <MenuBtn
                    label={t("print.currentView")}
                    onClick={() => { setMenuOpen(false); onPrintView(); }}
                    icon={<path d="M3 5h18v12H3zM3 19h18M9 9l3 3 3-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
                  />
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

function MenuSwitch({
  label,
  on,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 text-sm text-text hover:bg-surface-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-left"
    >
      <span className="flex items-center gap-2.5">
        <MenuIcon>{icon}</MenuIcon>
        {label}
      </span>
      <span
        className={`w-9 h-5 rounded-full flex items-center px-0.5 shrink-0 transition-colors ${
          on ? "bg-primary justify-end" : "bg-surface-2 border border-border justify-start"
        }`}
      >
        <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
      </span>
    </button>
  );
}
