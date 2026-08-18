"use client";

import { useState } from "react";
import type { Person } from "@/types/family";
import { useLang, useT } from "@/lib/i18n";

/**
 * AI biyografi (Gemini) — kişi verisinden kısa bir anlatı üretir. Kullanıcı
 * tetikli; sonucu yalnız gösterir (otomatik kaydetmez). AI bağlı değilse
 * (GEMINI_API_KEY yok) kibar bir uyarı gösterir.
 */
export default function AiStory({ person }: { person: Person }) {
  const t = useT();
  const { lang } = useLang();
  const [story, setStory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, lang: lang === "en" ? "en" : "tr" }),
      });
      const data = await res.json();
      if (res.status === 503) {
        setError(t("ai.story.notConfigured"));
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? t("ai.story.failed"));
      setStory(data.story);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!story) return;
    try {
      await navigator.clipboard.writeText(story);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* yoksay */
    }
  };

  return (
    <div>
      {story ? (
        <>
          <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{story}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={copy} className="text-[11px] font-medium text-primary hover:underline">
              {copied ? t("ai.story.copied") : t("ai.story.copy")}
            </button>
            <button onClick={generate} disabled={busy} className="text-[11px] text-text-subtle hover:text-text disabled:opacity-50">
              {busy ? t("ai.story.generating") : t("ai.story.again")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-text-muted leading-relaxed mb-2">{t("ai.story.intro")}</p>
          <button
            onClick={generate}
            disabled={busy}
            className="h-9 px-3 rounded-lg border border-primary/40 bg-primary-soft text-primary text-xs font-medium hover:bg-primary/15 disabled:opacity-50"
          >
            {busy ? t("ai.story.generating") : t("ai.story.generate")}
          </button>
        </>
      )}
      {error && <p className="text-[11px] text-danger mt-2">{error}</p>}
      <p className="text-[10px] text-text-subtle mt-2">{t("ai.story.note")}</p>
    </div>
  );
}
