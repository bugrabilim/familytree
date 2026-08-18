"use client";

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { useT } from "@/lib/i18n";
import type { Pairing } from "@/types/user";

interface Invite {
  url: string;
  token: string;
  qr: string;
}

/**
 * Hesaplar arası eşleştirme — sahip arayüzü (P1).
 *
 * Bağlı ağaçları listeler; yenisini eklemek için bir davet (bağlantı + QR)
 * üretir. Karşı taraf giriş yaparak kabul edince iki ağaç karşılıklı bağlanır
 * ve birbirini salt-okunur görebilir.
 */
export default function PairDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [pairings, setPairings] = useState<Pairing[] | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/tree/pair");
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data?.error ?? t("pair.failed"));
        setPairings(data.pairings ?? []);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createInvite = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tree/pair", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("pair.failed"));
      setInvite(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unpair = async (peerTreeId: string) => {
    if (!window.confirm(t("pair.unpairConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tree/pair", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerTreeId }),
      });
      if (!res.ok) throw new Error(t("pair.failed"));
      setPairings((cur) => (cur ?? []).filter((p) => p.peerTreeId !== peerTreeId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* yoksay */
    }
  };

  return (
    <Modal title={t("pair.title")} subtitle={t("pair.subtitle")} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-text-muted leading-relaxed">{t("pair.intro")}</p>

        {/* Bağlı ağaçlar */}
        <section>
          <h3 className="text-sm font-semibold text-text mb-2">{t("pair.linkedTitle")}</h3>
          {pairings === null ? (
            <p className="text-sm text-text-subtle">{t("pair.loading")}</p>
          ) : pairings.length === 0 ? (
            <p className="text-sm text-text-subtle">{t("pair.none")}</p>
          ) : (
            <ul className="space-y-1.5">
              {pairings.map((p) => (
                <li key={p.peerTreeId} className="flex items-center gap-2">
                  <span className="text-sm text-text truncate flex-1 min-w-0">{p.peerName}</span>
                  <a href={`/p/${encodeURIComponent(p.peerTreeId)}`} className="text-[11px] font-medium text-primary hover:underline shrink-0">
                    {t("pair.view")}
                  </a>
                  <button onClick={() => unpair(p.peerTreeId)} disabled={busy} className="text-[11px] text-text-subtle hover:text-danger shrink-0">
                    {t("pair.unpair")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="h-px bg-border" />

        {/* Yeni eşleştirme daveti */}
        <section>
          <h3 className="text-sm font-semibold text-text mb-1">{t("pair.newTitle")}</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-3">{t("pair.newBody")}</p>
          {!invite ? (
            <Button variant="secondary" size="sm" onClick={createInvite} disabled={busy}>
              {busy ? t("pair.working") : t("pair.create")}
            </Button>
          ) : (
            <div className="space-y-3">
              {invite.qr && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={invite.qr} alt={t("pair.qrAlt")} className="w-40 h-40 rounded-xl border border-border bg-white p-2" />
                </div>
              )}
              <div className="flex gap-2">
                <input readOnly value={invite.url} onFocus={(e) => e.currentTarget.select()} className="flex-1 h-10 px-3 rounded-xl bg-surface border border-border text-text text-xs" />
                <Button variant="secondary" size="sm" onClick={copy}>
                  {copied ? t("pair.copied") : t("pair.copy")}
                </Button>
              </div>
              <p className="text-[11px] text-text-subtle">{t("pair.newHint")}</p>
            </div>
          )}
        </section>

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}
      </div>
    </Modal>
  );
}
