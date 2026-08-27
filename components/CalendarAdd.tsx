"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import useClickOutside from "@/lib/useClickOutside";
import {
  buildICS,
  googleCalendarUrl,
  yahooCalendarUrl,
  outlookCalendarUrl,
  type CalEvent,
} from "@/lib/calendar";

/**
 * "Takvime ekle" — tek tuşla açılan küçük menü (#5). Apple/iOS ve Outlook
 * masaüstü için .ics indirir; Google, Yahoo ve Outlook.com için doğrudan
 * bağlantı açar. Doğum günü gibi olaylar her yıl tekrar eder.
 */
export default function CalendarAdd({ event, className = "" }: { event: CalEvent; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const downloadIcs = () => {
    try {
      const blob = new Blob([buildICS(event)], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${event.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "etkinlik"}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* yoksay */
    }
    setOpen(false);
  };

  const item =
    "block w-full text-left px-3 py-2 text-xs text-text hover:bg-surface-2 transition-colors";

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={t("cal.add")}
        aria-label={t("cal.add")}
        aria-expanded={open}
        className={`w-7 h-7 grid place-items-center rounded-lg text-text-subtle hover:text-primary hover:bg-surface-2 transition-colors ${className}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 9h17M8 3v3M16 3v3M12 12v4M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-30 w-40 rounded-xl border border-border bg-bg-elevated shadow-float overflow-hidden py-1 animate-scale-in origin-top-right"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-subtle">
            {t("cal.add")}
          </p>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setOpen(false)}>
            Google Takvim
          </a>
          <a href={outlookCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setOpen(false)}>
            Outlook
          </a>
          <a href={yahooCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={item} onClick={() => setOpen(false)}>
            Yahoo
          </a>
          <button className={item} onClick={downloadIcs}>
            {t("cal.apple")}
          </button>
        </div>
      )}
    </div>
  );
}
