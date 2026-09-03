"use client";

import { useEffect, useState } from "react";
import type { Gathering } from "@/types/gathering";
import { tally } from "@/lib/gathering";
import { SITE_URL } from "@/lib/site";
import { useT } from "@/lib/i18n";
import Modal from "./ui/Modal";
import Button from "./ui/Button";

/**
 * Aile etkinlikleri — düzenleyici görünümü.
 *
 * Anonim taraftan farkı burada görülüyor: katılımcı listesi ve davet
 * bağlantısı YALNIZ burada. Davetlinin gördüğü yanıt ikisini de taşımıyor.
 *
 * "Katılım bildirimi açık" ayrı ve bilinçli bir anahtar — etkinlik
 * oluşturmak, herkese açık bir yazma ucu açmakla aynı şey değil. Yanındaki
 * açıklama bunu açıkça söylüyor.
 */

interface Props {
  treeId: string;
  editable: boolean;
  onClose: () => void;
}

type Draft = Pick<Gathering, "title" | "when" | "place" | "description"> & { id?: string };

const bosDraft = (): Draft => ({ title: "", when: "", place: "", description: "" });

export default function GatheringsDialog({ treeId, editable, onClose }: Props) {
  const t = useT();
  const [list, setList] = useState<Gathering[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");

  /*
   * Yükleme doğrudan effect'in İÇİNDE. Ayrı bir `useCallback`i effect'ten
   * çağırmak, kuralın (`react-hooks/set-state-in-effect`) eş zamanlı
   * setState saydığı bir desen; deponun öbür pencereleri de bu biçimi
   * kullanıyor (`HistoryDialog`).
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/family/gatherings", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data?.error ?? t("rsvp.failed"));
        setList(data.gatherings as Gathering[]);
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
        setList([]);
      }
    })();
    return () => { alive = false; };
  }, [t]);

  const gonder = async (method: "POST" | "PUT" | "DELETE", body: unknown) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/family/gatherings", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("rsvp.failed"));
      setList(data.gatherings as Gathering[]);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const kaydet = async () => {
    if (!draft?.title.trim() || !draft.when.trim()) return;
    const ok = draft.id
      ? await gonder("PUT", draft)
      : await gonder("POST", draft);
    if (ok) setDraft(null);
  };

  const kopyala = async (g: Gathering) => {
    const url = `${SITE_URL}/rsvp/${encodeURIComponent(treeId)}?token=${encodeURIComponent(g.token)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(g.id);
      window.setTimeout(() => setCopiedId(""), 1600);
    } catch { /* yoksay */ }
  };

  return (
    <Modal title={t("gathering.title")} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-text-subtle leading-snug">{t("gathering.hint")}</p>

        {list === null ? (
          <p className="text-xs text-text-subtle">{t("rsvp.loading")}</p>
        ) : list.length === 0 && !draft ? (
          <p className="text-xs text-text-subtle">{t("gathering.empty")}</p>
        ) : null}

        <ul className="space-y-3">
          {(list ?? []).map((g) => {
            const s = tally(g.rsvps);
            return (
              <li key={g.id} className="rounded-2xl border border-border bg-surface p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">{g.title}</p>
                    <p className="text-[11px] text-text-subtle">
                      {g.when.replace("T", " ")}
                      {g.place ? ` · ${g.place}` : ""}
                    </p>
                  </div>
                  {editable && (
                    <span className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setDraft({ id: g.id, title: g.title, when: g.when, place: g.place ?? "", description: g.description ?? "" })}
                        className="text-[11px] text-accent hover:underline"
                      >
                        {t("gathering.edit")}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(t("gathering.deleteConfirm"))) void gonder("DELETE", { id: g.id });
                        }}
                        disabled={busy}
                        className="text-[11px] text-danger hover:underline disabled:opacity-50"
                      >
                        {t("gathering.delete")}
                      </button>
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-text-muted">
                  {t("gathering.summary", {
                    coming: s.geliyorum, maybe: s.belki, no: s.gelemiyorum, people: s.headcount,
                  })}
                </p>

                {editable && (
                  <>
                    {/*
                      Anahtarın yanındaki açıklama şart: "açık" demek, davet
                      bağlantısını alan HERKESİN yazabilmesi demek ve bu
                      kullanıcının bilinçli vermesi gereken bir karar.
                    */}
                    <label className="flex items-start gap-2 text-xs text-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={g.rsvpOpen}
                        disabled={busy}
                        onChange={(e) => void gonder("PUT", { id: g.id, rsvpOpen: e.target.checked })}
                        className="mt-0.5 shrink-0"
                      />
                      <span>
                        {t("gathering.rsvpOpen")}
                        <span className="block text-[11px] text-text-subtle leading-snug">
                          {t("gathering.rsvpOpenHint")}
                        </span>
                      </span>
                    </label>

                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={`${SITE_URL}/rsvp/${treeId}?token=${g.token}`}
                        onFocus={(e) => e.currentTarget.select()}
                        aria-label={t("gathering.inviteLink")}
                        className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-surface-2 border border-border text-text text-[11px]"
                      />
                      <Button variant="secondary" size="sm" onClick={() => void kopyala(g)}>
                        {copiedId === g.id ? t("gathering.copied") : t("gathering.copy")}
                      </Button>
                    </div>
                  </>
                )}

                <details>
                  <summary className="text-[11px] text-text-muted cursor-pointer">
                    {t("gathering.guests")} ({g.rsvps.length})
                  </summary>
                  {g.rsvps.length === 0 ? (
                    <p className="text-[11px] text-text-subtle mt-1">{t("gathering.noGuests")}</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {g.rsvps.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 text-[11px]">
                          <span className="flex-1 min-w-0 truncate text-text">
                            {r.name} · {t(`rsvp.answer.${r.answer}`)}
                            {r.answer === "geliyorum" ? ` (${r.headcount})` : ""}
                            {r.note ? ` — ${r.note}` : ""}
                          </span>
                          {editable && (
                            <button
                              onClick={() => void gonder("DELETE", { id: g.id, rsvpId: r.id })}
                              disabled={busy}
                              className="text-danger hover:underline shrink-0 disabled:opacity-50"
                            >
                              {t("gathering.removeGuest")}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            );
          })}
        </ul>

        {editable && !draft && (
          <Button variant="secondary" size="sm" onClick={() => setDraft(bosDraft())}>
            {t("gathering.add")}
          </Button>
        )}

        {editable && draft && (
          <div className="space-y-2 p-3 rounded-2xl bg-surface-2 border border-border">
            {([
              ["title", "text"],
              ["when", "datetime-local"],
              ["place", "text"],
            ] as const).map(([alan, tip]) => (
              <label key={alan} className="block space-y-1">
                <span className="text-[11px] text-text-subtle">{t(`gathering.field.${alan}`)}</span>
                <input
                  type={tip}
                  value={draft[alan] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [alan]: e.target.value })}
                  className="w-full h-9 px-2.5 rounded-xl bg-surface border border-border text-sm text-text focus:outline-none focus:border-primary"
                />
              </label>
            ))}
            <label className="block space-y-1">
              <span className="text-[11px] text-text-subtle">{t("gathering.field.description")}</span>
              <textarea
                rows={3}
                value={draft.description ?? ""}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-surface border border-border text-sm text-text focus:outline-none focus:border-primary"
              />
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={kaydet} disabled={busy || !draft.title.trim() || !draft.when.trim()}>
                {t("gathering.save")}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={busy}>
                {t("gathering.cancel")}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
