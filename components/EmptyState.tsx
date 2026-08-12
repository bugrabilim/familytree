"use client";

import Button from "./ui/Button";
import { useReadOnly } from "./ReadOnlyContext";
import { useT } from "@/lib/i18n";

interface Props {
  onAdd: () => void;
  onImport: () => void;
  onDemo: () => void;
  demoLoading?: boolean;
}

export default function EmptyState({ onAdd, onImport, onDemo, demoLoading }: Props) {
  const { readOnly } = useReadOnly();
  const t = useT();
  return (
    <div className="h-full grid place-items-center px-6 py-10 overflow-y-auto">
      <div className="w-full max-w-md text-center">
        {/* Küçük dekoratif ağaç */}
        <svg
          viewBox="0 0 120 100"
          className="w-32 h-28 mx-auto mb-6"
          fill="none"
          aria-hidden
        >
          <circle cx="60" cy="16" r="10" stroke="var(--primary)" strokeWidth="2.5" />
          <path d="M60 26v16" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
          <path
            d="M28 42h64M28 42v10M92 42v10M60 42v10"
            stroke="var(--border-strong)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="28" cy="62" r="9" stroke="var(--male)" strokeWidth="2.5" />
          <circle cx="60" cy="62" r="9" stroke="var(--female)" strokeWidth="2.5" />
          <circle cx="92" cy="62" r="9" stroke="var(--neutral)" strokeWidth="2.5" strokeDasharray="3 3" />
        </svg>

        <h1 className="font-serif text-2xl font-semibold text-text mb-2">
          {t("empty.title")}
        </h1>
        <p className="text-sm text-text-muted leading-relaxed mb-7">
          {t("empty.bodyBefore")}{" "}
          <span className="inline-flex w-4 h-4 rounded-full bg-primary text-primary-text items-center justify-center text-[9px] align-middle font-bold">
            +
          </span>{" "}
          {t("empty.bodyAfter")}
        </p>

        {readOnly ? (
          // Görüntüleme modu açıkken ekleme/içe aktarma aksiyonları gizlenir.
          <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border text-sm text-text-muted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.9" />
            </svg>
            {t("empty.readOnlyNote")}
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
              <Button size="lg" onClick={onAdd}>
                {t("empty.addSelf")}
              </Button>
              <Button size="lg" variant="secondary" onClick={onImport}>
                {t("empty.haveGedcom")}
              </Button>
            </div>

            <button
              onClick={onDemo}
              disabled={demoLoading}
              className="mt-4 text-xs text-text-muted hover:text-primary underline underline-offset-4 disabled:opacity-50"
            >
              {demoLoading ? t("empty.demoLoading") : t("empty.tryDemo")}
            </button>
          </>
        )}

        <div className="mt-10 grid gap-3 text-left">
          {[
            { icon: "🌳", key: "views" },
            { icon: "👨‍👩‍👧", key: "kinship" },
            { icon: "📄", key: "data" },
          ].map((f) => (
            <div key={f.key} className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-border">
              <span className="text-lg shrink-0" aria-hidden>{f.icon}</span>
              <div>
                <p className="text-sm font-medium text-text leading-tight">{t(`empty.feature.${f.key}.title`)}</p>
                <p className="text-xs text-text-muted leading-relaxed mt-0.5">{t(`empty.feature.${f.key}.desc`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
