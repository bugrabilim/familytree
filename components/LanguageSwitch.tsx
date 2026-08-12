"use client";

import { useLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

/**
 * Kompakt TR / EN dil değiştirici — segmented control. Üst çubukta ve kimlik
 * ekranlarında (AuthShell) kullanılır. Gizlilik/salt-okunur düğmeleriyle aynı
 * görsel dili kullanır.
 */
export default function LanguageSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  const options: Array<{ v: Lang; l: string }> = [
    { v: "tr", l: "TR" },
    { v: "en", l: "EN" },
  ];
  return (
    <div
      role="group"
      aria-label="Language"
      className={`flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-2 border border-border ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setLang(o.v)}
          aria-pressed={lang === o.v}
          className={`h-7 px-2 rounded-md text-[11px] font-semibold tabular-nums transition-colors ${
            lang === o.v
              ? "bg-bg-elevated text-text shadow-soft"
              : "text-text-muted hover:text-text"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
