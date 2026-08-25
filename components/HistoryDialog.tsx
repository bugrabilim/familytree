"use client";

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { useT } from "@/lib/i18n";

interface Entry {
  id: string;
  at: string;
  count: number;
}

/**
 * Güncelleme günlüğü (⋮ → Kişiler → Son güncellemeleri geri al). Her kaydetmeden
 * önceki durum tarihe göre listelenir; kullanıcı bir hatadan sonra önceki bir
 * duruma dönebilir. Geri yükleme de geri alınabilir (kendisi de günlüğe girer).
 */
export default function HistoryDialog({
  onClose,
  onRestored,
}: {
  onClose: () => void;
  onRestored: () => void;
}) {
  const t = useT();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/family/history");
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data?.error ?? t("history.failed"));
        setEntries(data.entries ?? []);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = async (id: string) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch("/api/family/history/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("history.failed"));
      onRestored();
    } catch (e) {
      setError((e as Error).message);
      setBusyId(null);
    }
  };

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Modal title={t("history.title")} subtitle={t("history.subtitle")} onClose={onClose}>
      {entries === null && !error ? (
        <p className="text-sm text-text-muted">{t("history.loading")}</p>
      ) : entries && entries.length === 0 ? (
        <p className="text-sm text-text-muted">{t("history.empty")}</p>
      ) : (
        <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {entries?.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text tabular-nums leading-tight">{fmt(e.at)}</p>
                <p className="text-[11px] text-text-subtle leading-tight">{t("history.peopleCount", { count: e.count })}</p>
              </div>
              {confirmId === e.id ? (
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="danger" onClick={() => restore(e.id)} disabled={busyId !== null}>
                    {busyId === e.id ? t("history.restoring") : t("history.confirmRestore")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)} disabled={busyId !== null}>
                    {t("gedcom.cancel")}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setConfirmId(e.id)} disabled={busyId !== null}>
                  {t("history.restore")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl mt-3">{error}</p>}
    </Modal>
  );
}
