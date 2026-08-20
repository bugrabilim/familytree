"use client";

import { useState } from "react";
import type { Person } from "@/types/family";
import { useLang, useT } from "@/lib/i18n";
import { buildWebSearchUrl, recordSearchName, type RecordHint } from "@/lib/records";

/**
 * Tarihsel kayıt ipucu (Record Matches ince dilimi) — Wikidata'da ada göre
 * olası kişileri arar. Kullanıcı-tetikli (gizlilik: dış servise yalnız ad,
 * yalnız tıklayınca gider). Otomatik veri yazmaz; yalnız bağlantı önerir.
 */
export default function RecordHints({ person }: { person: Person }) {
  const t = useT();
  const { lang } = useLang();
  const [results, setResults] = useState<RecordHint[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const living = !person.deathDate;
  const webUrl = buildWebSearchUrl(recordSearchName(person), person.birthDate?.slice(0, 4));

  const search = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/records/search?name=${encodeURIComponent(recordSearchName(person))}&lang=${lang === "en" ? "en" : "tr"}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("records.failed"));
      setResults(data.results ?? []);
    } catch (e) {
      setError((e as Error).message);
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-xs text-text-muted leading-relaxed mb-2">{living ? t("records.introLiving") : t("records.intro")}</p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {results === null && (
          <button
            onClick={search}
            disabled={busy}
            className="h-9 px-3 rounded-lg border border-border bg-surface hover:bg-surface-2 text-xs font-medium text-text disabled:opacity-50"
          >
            {busy ? t("records.searching") : t("records.search")}
          </button>
        )}
        {/* Normal web araması (Google) — yaşayanlar dâhil herkes için (Madde 3). */}
        <a
          href={webUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface hover:bg-surface-2 text-xs font-medium text-text"
        >
          {t("records.google")}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="text-text-subtle">
            <path d="M14 5h5v5M19 5l-9 9M11 5H6a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
      {results === null ? null : results.length === 0 ? (
        <p className="text-sm text-text-subtle">{t("records.none")}</p>
      ) : (
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={r.id}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-text truncate">{r.label}</span>
                  {r.description && (
                    <span className="block text-[11px] text-text-subtle truncate">{r.description}</span>
                  )}
                </span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="text-text-subtle mt-1 shrink-0">
                  <path d="M14 5h5v5M19 5l-9 9M11 5H6a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1v-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[11px] text-danger mt-2">{error}</p>}
      <p className="text-[10px] text-text-subtle mt-2">{t("records.source")}</p>
    </div>
  );
}
