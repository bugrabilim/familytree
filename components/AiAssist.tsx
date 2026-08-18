"use client";

import { useState } from "react";
import type { Person } from "@/types/family";
import { useLang, useT } from "@/lib/i18n";
import { SUGGEST_MODES, type SuggestMode } from "@/lib/ai-suggest";

/**
 * AI asistanı (Gemini) — kullanıcı bir ÖNERİ TÜRÜ seçer (biyografi, tek cümle
 * özet, eksik bilgiler, zaman çizelgesi); model yalnız ağaçtaki gerçeklerden
 * üretir. Sonucu yalnız gösterir (otomatik kaydetmez) ve kopyalanabilir. AI
 * bağlı değilse (GEMINI_API_KEY yok) kibar bir uyarı gösterir.
 */
export default function AiAssist({ person }: { person: Person }) {
  const t = useT();
  const { lang } = useLang();
  const [mode, setMode] = useState<SuggestMode | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = async (m: SuggestMode) => {
    setMode(m);
    setBusy(true);
    setError("");
    setText(null);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, mode: m, lang: lang === "en" ? "en" : "tr" }),
      });
      const data = await res.json();
      if (res.status === 503) {
        setError(t("ai.story.notConfigured"));
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? t("ai.story.failed"));
      setText(data.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* yoksay */
    }
  };

  return (
    <div>
      <p className="text-xs text-text-muted leading-relaxed mb-2">{t("ai.assist.intro")}</p>

      {/* Öneri türü seçimi — sohbet gerektirmeden tek tıkla ilerlenir */}
      <div className="flex flex-wrap gap-1.5">
        {SUGGEST_MODES.map((m) => (
          <button
            key={m}
            onClick={() => run(m)}
            disabled={busy}
            aria-pressed={mode === m}
            className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
              mode === m
                ? "border-primary bg-primary-soft text-primary"
                : "border-primary/40 bg-primary-soft/50 text-primary hover:bg-primary/15"
            }`}
          >
            {t(`ai.assist.mode.${m}`)}
          </button>
        ))}
      </div>

      {busy && <p className="text-[11px] text-text-subtle mt-3">{t("ai.story.generating")}</p>}

      {text && !busy && (
        <div className="mt-3">
          <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{text}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={copy} className="text-[11px] font-medium text-primary hover:underline">
              {copied ? t("ai.story.copied") : t("ai.story.copy")}
            </button>
            {mode && (
              <button
                onClick={() => run(mode)}
                disabled={busy}
                className="text-[11px] text-text-subtle hover:text-text disabled:opacity-50"
              >
                {t("ai.story.again")}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-danger mt-2">{error}</p>}
      <p className="text-[10px] text-text-subtle mt-2">{t("ai.story.note")}</p>
    </div>
  );
}
