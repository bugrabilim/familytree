"use client";

import { useEffect, type ReactNode } from "react";
import useEscapeKey from "@/lib/useEscapeKey";

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const WIDTHS = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export default function Modal({ title, subtitle, onClose, children, footer, size = "md" }: Props) {
  useEscapeKey(onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        className={`
          relative z-10 w-full ${WIDTHS[size]}
          bg-bg-elevated border border-border
          rounded-t-3xl sm:rounded-2xl shadow-modal
          flex flex-col max-h-[93vh] sm:max-h-[86vh]
          animate-slide-up sm:animate-scale-in
        `}
      >
        {/* Mobil tutamaç */}
        <div className="sm:hidden pt-2.5 pb-1 grid place-items-center shrink-0">
          <div className="w-9 h-1 rounded-full bg-border-strong" />
        </div>

        {(title || subtitle) && (
          <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3.5 border-b border-border shrink-0">
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold text-text truncate">{title}</h2>}
              {subtitle && <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Kapat"
              className="w-8 h-8 shrink-0 grid place-items-center rounded-lg text-text-subtle hover:text-text hover:bg-surface-2 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </header>
        )}

        <div className="overflow-y-auto flex-1 px-5 py-4 overscroll-contain">{children}</div>

        {footer && (
          <footer className="px-5 py-3.5 border-t border-border bg-surface-2/50 rounded-b-2xl shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
