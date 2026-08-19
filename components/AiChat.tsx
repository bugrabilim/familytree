"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import useEscapeKey from "@/lib/useEscapeKey";
import { useLang, useT } from "@/lib/i18n";

type Msg = { role: "user" | "ai"; text: string };

/**
 * Ağaç hakkında AI soru-cevap penceresi (madde 3). Kullanıcı soru yazar; yanıt
 * yalnız ağaç verisinden üretilir. Geçmiş istemci tarafında tutulur (tek-tur
 * sorgular). AI bağlı değilse kibar uyarı.
 */
export default function AiChat({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { lang } = useLang();
  useEscapeKey(onClose);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setError("");
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    // yanıt gelince en alta kaydır
    requestAnimationFrame(() => listRef.current?.scrollTo(0, listRef.current.scrollHeight));
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, lang: lang === "en" ? "en" : "tr" }),
      });
      const data = await res.json();
      if (res.status === 503) throw new Error(t("ai.story.notConfigured"));
      if (!res.ok) throw new Error(data?.error ?? t("ai.story.failed"));
      setMessages((m) => [...m, { role: "ai", text: data.answer ?? "" }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollTo(0, listRef.current.scrollHeight));
    }
  };

  const examples = [t("ai.chat.ex1"), t("ai.chat.ex2"), t("ai.chat.ex3")];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Arka plan — tıklayınca kapanır */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] animate-fade-in" onClick={onClose} aria-hidden />

      {/* Yandan kayan sohbet paneli (Madde 5) */}
      <aside className="relative w-full max-w-md h-full bg-bg-elevated border-l border-border shadow-modal flex flex-col animate-slide-in-right">
        <header className="shrink-0 flex items-center justify-between gap-3 px-4 h-14 border-b border-border">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text flex items-center gap-1.5">
              <span aria-hidden>✨</span> {t("ai.chat.title")}
            </p>
            <p className="text-[11px] text-text-subtle truncate">{t("ai.chat.subtitle")}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("book.close")}
            className="w-9 h-9 grid place-items-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 min-h-0 flex flex-col p-4">
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5">
        {messages.length === 0 ? (
          <div className="py-2">
            <p className="text-sm text-text-muted mb-3">{t("ai.chat.intro")}</p>
            <div className="flex flex-wrap gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => ask(ex)}
                  className="h-8 px-3 rounded-lg border border-border bg-surface hover:bg-surface-2 text-xs text-text transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-text rounded-br-md"
                    : "bg-surface-2 text-text rounded-bl-md"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))
        )}
        {busy && <p className="text-xs text-text-subtle">{t("ai.chat.thinking")}</p>}
        {error && <p className="text-[11px] text-danger">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2 mt-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("ai.chat.placeholder")}
          className="flex-1 h-11 px-3.5 rounded-xl bg-surface border border-border text-sm text-text placeholder:text-text-subtle focus:outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="h-11 px-4 rounded-xl bg-primary text-primary-text text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {t("ai.chat.send")}
        </button>
      </form>
      <p className="text-[10px] text-text-subtle mt-2">{t("ai.story.note")}</p>
        </div>
      </aside>
    </div>,
    document.body
  );
}
