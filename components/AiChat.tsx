"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import useEscapeKey from "@/lib/useEscapeKey";
import { useLang, useT } from "@/lib/i18n";
import { importAnyFile } from "@/lib/import-client";

export type AiMsg = { role: "user" | "ai"; text: string };

const isLetter = (ch: string) => /\p{L}/u.test(ch);

/**
 * AI yanıtındaki kişi adlarını, ağaçta o kişiye gitmek için tıklanabilir
 * bağlantılara çevirir (kullanıcı isteği). En uzun ad önce eşleşir; harf
 * sınırına bakılır ki ad ortasından yanlış eşleşme olmasın.
 */
function linkifyAnswer(
  text: string,
  entries: Array<{ name: string; lower: string; id: string }>,
  onGo: (id: string) => void
): React.ReactNode[] {
  if (entries.length === 0) return [text];
  const lower = text.toLocaleLowerCase("tr");
  const out: React.ReactNode[] = [];
  let buf = "";
  let i = 0;
  let key = 0;
  while (i < text.length) {
    let hit: { name: string; id: string } | null = null;
    for (const e of entries) {
      if (lower.startsWith(e.lower, i)) {
        const before = i === 0 ? " " : text[i - 1];
        const after = text[i + e.name.length] ?? " ";
        if (!isLetter(before) && !isLetter(after)) { hit = e; break; }
      }
    }
    if (hit) {
      if (buf) { out.push(buf); buf = ""; }
      const label = text.slice(i, i + hit.name.length);
      const id = hit.id;
      out.push(
        <button
          key={`lnk-${key++}`}
          onClick={() => onGo(id)}
          className="font-semibold text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          {label}
        </button>
      );
      i += hit.name.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Ağaç hakkında AI soru-cevap paneli — yandan kayan sohbet. Sohbet geçmişi
 * üst bileşende (Workspace) tutulur, böylece panel kapanıp yeniden açılınca
 * konuşma korunur. Yanıttaki kişi adları ağaca gitmek için tıklanabilir.
 */
export default function AiChat({
  onClose,
  messages,
  setMessages,
  people,
  onGoToPerson,
  onImported,
}: {
  onClose: () => void;
  messages: AiMsg[];
  setMessages: React.Dispatch<React.SetStateAction<AiMsg[]>>;
  people: Person[];
  onGoToPerson: (id: string) => void;
  /** Dosyadan içe aktarma başarılı olunca ağacı tazele. */
  onImported: (count: number) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  useEscapeKey(onClose);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Kişi adı dizini — en uzun ad önce (alt-ad yanlış eşleşmesin). 3 harften kısa
  // adlar (ör. kısaltmalar) atlanır; gürültüyü azaltır.
  const nameEntries = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ name: string; lower: string; id: string }> = [];
    for (const p of people) {
      const name = fullName(p).trim();
      if (name.length < 3) continue;
      const lower = name.toLocaleLowerCase("tr");
      if (seen.has(lower)) continue;
      seen.add(lower);
      list.push({ name, lower, id: p.id });
    }
    return list.sort((a, b) => b.name.length - a.name.length);
  }, [people]);

  const scrollToEnd = () =>
    requestAnimationFrame(() => listRef.current?.scrollTo(0, listRef.current.scrollHeight));

  // Açılışta (geçmiş varsa) en alta kaydır.
  useEffect(() => { scrollToEnd(); }, []);

  // "Dışa aktar / yedek / GEDCOM indir" gibi istekleri modele göndermeden,
  // yerelde nereden yapılacağını tarif ederek yanıtla (2C).
  const EXPORT_RE =
    /(dış[ae]?r?ı?\s*(aktar|çıkar)|dışarı aktar|export|yedek|(gedcom|csv|json)['’]?\s*(indir|al|kaydet)|indir.*(gedcom|csv|json|dosya|yedek))/i;

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setError("");
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    scrollToEnd();

    if (EXPORT_RE.test(question)) {
      setMessages((m) => [...m, { role: "ai", text: t("ai.chat.exportHelp") }]);
      scrollToEnd();
      return;
    }

    setBusy(true);
    try {
      // Takip sorularının bağlamı için önceki konuşmayı gönder (son 8 sıra).
      // AiMsg rolü "ai" → sunucunun beklediği "assistant".
      const history = messages
        .slice(-8)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, lang: lang === "en" ? "en" : "tr", history }),
      });
      const data = await res.json();
      if (res.status === 503) throw new Error(t("ai.story.notConfigured"));
      if (!res.ok) throw new Error(data?.error ?? t("ai.story.failed"));
      setMessages((m) => [...m, { role: "ai", text: data.answer ?? "" }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  };

  // Sohbete dosya eklenince (seç ya da sürükle-bırak) anlayıp içe aktarmayı
  // başlat (2C/9). Dosya türüne göre normal içe aktarma ya da yapay zekâ.
  const importFile = async (file: File) => {
    if (busy) return;
    setError("");
    setMessages((m) => [...m, { role: "user", text: `📎 ${file.name}` }]);
    setBusy(true);
    scrollToEnd();
    try {
      const count = await importAnyFile(file, {
        mode: "merge",
        lang: lang === "en" ? "en" : "tr",
        aiNotConfigured: t("ai.story.notConfigured"),
        emptyMessage: t("gedcom.importEmpty"),
      });
      setMessages((m) => [...m, { role: "ai", text: t("ai.chat.importDone", { count }) }]);
      onImported(count);
    } catch (err) {
      setMessages((m) => [...m, { role: "ai", text: (err as Error).message }]);
    } finally {
      setBusy(false);
      scrollToEnd();
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importFile(file);
  };

  const [dragOver, setDragOver] = useState(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) importFile(file);
  };

  const examples = [t("ai.chat.ex1"), t("ai.chat.ex2"), t("ai.chat.ex3")];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Arka plan — tıklayınca kapanır (geçmiş korunur) */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] animate-fade-in" onClick={onClose} aria-hidden />

      {/* Yandan kayan sohbet paneli */}
      <aside
        className="relative w-full max-w-md h-full bg-bg-elevated border-l border-border shadow-modal flex flex-col animate-slide-in-right"
        onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-primary-soft/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-l-2xl pointer-events-none">
            <p className="text-sm font-medium text-primary">{t("ai.chat.dropHere")}</p>
          </div>
        )}
        <header className="shrink-0 flex items-center justify-between gap-3 px-4 h-14 border-b border-border">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text flex items-center gap-1.5">
              <span aria-hidden>✨</span> {t("ai.chat.title")}
            </p>
            <p className="text-[11px] text-text-subtle truncate">{t("ai.chat.subtitle")}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="h-8 px-2.5 rounded-lg text-[11px] text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
              >
                {t("ai.chat.clear")}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={t("book.close")}
              className="w-9 h-9 grid place-items-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
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
                    {m.role === "ai" ? linkifyAnswer(m.text, nameEntries, onGoToPerson) : m.text}
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
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              title={t("ai.chat.attach")}
              aria-label={t("ai.chat.attach")}
              className="h-11 w-11 shrink-0 grid place-items-center rounded-xl border border-border bg-surface text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-50 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M21 11.5l-8.5 8.5a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.6 1.6 0 01-2.3-2.3l7.8-7.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={handleAttach} />
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
          {messages.length > 0 && (
            <p className="text-[10px] text-text-subtle mt-2">{t("ai.chat.goHint")}</p>
          )}
          <p className="text-[10px] text-text-subtle mt-1">{t("ai.story.note")}</p>
        </div>
      </aside>
    </div>,
    document.body
  );
}
