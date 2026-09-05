"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { mutationHeaders } from "@/lib/actions";
import Modal from "./ui/Modal";
import Button from "./ui/Button";

/**
 * HİKÂYE TALEPLERİ — ağaç sahibinin görünümü (madde 49/50).
 *
 * İki yarısı var ve ikisi de burada olmak zorunda:
 *
 *  1. **Soru gönder** — bağlantı üretir. Bağlantı YALNIZ üretildiği an
 *     görünüyor; depoda özeti duruyor ve yeniden gösterilemiyor. Ekran bunu
 *     açıkça söylüyor, yoksa kullanıcı "sonra bakarım" der ve bulamaz.
 *
 *  2. **Onay kuyruğu** — girişsiz gelen yanıtlar. Onay burada, çünkü ağaç
 *     sahibinde: her aile kendi ağacına gireni kendi onaylar.
 *
 * İkisi ayrı ekrana bölünseydi, kuyruk kolayca "sonra bakılacak bir yer"
 * olurdu — ve onaylanmayan katkı, hiç gönderilmemiş katkıya eşit.
 */

interface Props {
  people: Array<{ id: string; name: string }>;
  editable: boolean;
  onClose: () => void;
  /** Onaydan sonra ağacı tazelemek için — anı kişinin kaydına girdi. */
  onApplied?: () => void;
}

interface Request {
  id: string;
  personId: string;
  question: string;
  subject: string;
  sentTo?: string;
  expiresAt: string;
  closed?: boolean;
}

interface Contribution {
  id: string;
  personId: string;
  subject: string;
  question: string;
  authorName: string;
  text: string;
  at: string;
  status: "bekliyor" | "onaylandi" | "reddedildi";
}

export default function StoriesDialog({ people, editable, onClose, onApplied }: Props) {
  const t = useT();
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [queue, setQueue] = useState<Contribution[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [sentTo, setSentTo] = useState("");
  /** Yeni üretilen bağlantı — bir kez gösteriliyor, saklanmıyor. */
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  /*
   * Okuma iki yerde: ilk açılışta (effect) ve her işlemden sonra (`yukle`).
   * İkisi ayrı yazılıyor çünkü `useCallback`i effect'ten çağırmak, deponun
   * lint kuralının (`react-hooks/set-state-in-effect`) eş zamanlı setState
   * saydığı bir desen — `GatheringsDialog` ve `HistoryDialog` da bu biçimde.
   */
  const uygula = useCallback((d: { requests: Request[]; contributions: Contribution[] }) => {
    setRequests(d.requests);
    setQueue(d.contributions.filter((c) => c.status === "bekliyor"));
  }, []);

  const yukle = useCallback(async () => {
    try {
      const res = await fetch("/api/family/stories", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? t("stories.failed"));
      uygula(d);
    } catch (e) {
      setError((e as Error).message);
      setRequests([]);
    }
  }, [t, uygula]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/family/stories", { cache: "no-store" });
        const d = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(d?.error ?? t("stories.failed"));
        uygula(d);
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
        setRequests([]);
      }
    })();
    return () => { alive = false; };
  }, [t, uygula]);

  const olustur = async () => {
    setBusy(true);
    setError("");
    setLink("");
    try {
      const res = await fetch("/api/family/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, question, sentTo }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? t("stories.failed"));
      setLink(d.link as string);
      setQuestion("");
      setSentTo("");
      await yukle();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const karar = async (id: string, k: "onayla" | "reddet") => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/family/stories", {
        method: "PATCH",
        // Onay kişinin kaydına YAZIYOR; sürüm başlığı olmadan iyimser kilit
        // sessizce kapalı kalır.
        headers: mutationHeaders(),
        body: JSON.stringify({ id, karar: k }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? t("stories.failed"));
      await yukle();
      if (k === "onayla") onApplied?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const kapat = async (requestId: string) => {
    setBusy(true);
    try {
      await fetch("/api/family/stories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      await yukle();
    } catch {
      setError(t("stories.failed"));
    } finally {
      setBusy(false);
    }
  };

  const acik = (requests ?? []).filter((r) => !r.closed);

  return (
    <Modal title={t("stories.section")} onClose={onClose}>
      <div className="space-y-5">
        {editable && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-text">{t("stories.newTitle")}</h3>

            <div>
              <label className="text-[11px] text-text-subtle block mb-1" htmlFor="s-kisi">
                {t("stories.person")}
              </label>
              <select
                id="s-kisi"
                className="w-full text-sm px-3 py-2 rounded-xl bg-surface border border-border"
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-text-subtle block mb-1" htmlFor="s-soru">
                {t("stories.question")}
              </label>
              <input
                id="s-soru"
                className="w-full text-sm px-3 py-2 rounded-xl bg-surface border border-border"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t("stories.questionPlaceholder")}
                maxLength={500}
              />
            </div>

            <div>
              <label className="text-[11px] text-text-subtle block mb-1" htmlFor="s-kime">
                {t("stories.sentTo")}
              </label>
              <input
                id="s-kime"
                className="w-full text-sm px-3 py-2 rounded-xl bg-surface border border-border"
                value={sentTo}
                onChange={(e) => setSentTo(e.target.value)}
              />
            </div>

            <Button size="sm" onClick={olustur} disabled={busy || !question.trim() || !personId}>
              {busy ? t("stories.creating") : t("stories.create")}
            </Button>

            {link && (
              <div className="rounded-xl border border-border p-3 space-y-2">
                {/* Bağlantı bir kez görünüyor — depoda yalnız özeti var. */}
                <p className="text-[11px] text-text-subtle leading-relaxed">{t("stories.linkOnce")}</p>
                <code className="block text-[11px] break-all text-text">{link}</code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(link);
                    setCopied(true);
                  }}
                >
                  {copied ? t("stories.copied") : t("stories.copy")}
                </Button>
              </div>
            )}
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-medium text-text">{t("stories.queue")}</h3>
          <p className="text-[11px] text-text-subtle leading-relaxed">{t("stories.approvedNote")}</p>
          {queue.length === 0 && <p className="text-[11px] text-text-subtle">{t("stories.noQueue")}</p>}
          {queue.map((c) => (
            <div key={c.id} className="rounded-xl border border-border p-3 space-y-1.5">
              <p className="text-[11px] text-text-subtle">
                {c.subject} · {c.question}
              </p>
              <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{c.text}</p>
              <p className="text-[11px] text-text-subtle">
                — {c.authorName} ({c.at.slice(0, 10)})
              </p>
              {editable && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => karar(c.id, "onayla")} disabled={busy}>
                    {t("stories.approve")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => karar(c.id, "reddet")} disabled={busy}>
                    {t("stories.reject")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-medium text-text">{t("stories.open")}</h3>
          {acik.length === 0 && <p className="text-[11px] text-text-subtle">{t("stories.noOpen")}</p>}
          {acik.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <p className="text-sm text-text leading-snug">{r.question}</p>
                <p className="text-[11px] text-text-subtle">
                  {r.subject}
                  {r.sentTo ? ` · ${r.sentTo}` : ""} · {r.expiresAt.slice(0, 10)}
                </p>
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => kapat(r.id)}
                  disabled={busy}
                  className="text-[11px] text-text-subtle hover:text-danger shrink-0"
                >
                  {t("stories.close")}
                </button>
              )}
            </div>
          ))}
        </section>

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2 rounded-xl">{error}</p>}
      </div>
    </Modal>
  );
}
