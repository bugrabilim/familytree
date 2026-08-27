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
  const [confirmDay, setConfirmDay] = useState<string | null>(null);
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

  // #2 — Toplu geri alma: kayıtları güne göre grupla. Bir günü "geri al", o günün
  // BAŞINA (o günden önceki duruma) döner — yani o gün ve sonrası geri alınır.
  // Günlük linear olduğundan hedef, o günün EN ESKİ (ilk) anlık görüntüsüdür.
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso.slice(0, 10)
      : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const dayLabel = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
    } catch {
      return iso.slice(0, 10);
    }
  };
  const todayKey = dayKey(new Date().toISOString());

  // Gün grupları (en yeni gün önce; entries zaten en yeni önce sıralı).
  const groups: Array<{ key: string; label: string; items: Entry[] }> = [];
  for (const e of entries ?? []) {
    const k = dayKey(e.at);
    let g = groups.find((x) => x.key === k);
    if (!g) { g = { key: k, label: dayLabel(e.at), items: [] }; groups.push(g); }
    g.items.push(e);
  }
  // Bir günü geri al → o günün en eski (son eleman, çünkü en yeni önce) kaydı.
  const restoreDay = (g: { items: Entry[] }) => {
    const earliest = g.items[g.items.length - 1];
    if (earliest) restore(earliest.id);
  };

  return (
    <Modal title={t("history.title")} subtitle={t("history.subtitle")} onClose={onClose}>
      {entries === null && !error ? (
        <p className="text-sm text-text-muted">{t("history.loading")}</p>
      ) : entries && entries.length === 0 ? (
        <p className="text-sm text-text-muted">{t("history.empty")}</p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {groups.map((g) => (
            <div key={g.key} className="space-y-1.5">
              {/* Gün başlığı + o günü toplu geri al */}
              <div className="flex items-center gap-2 px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                  {g.key === todayKey ? t("history.today") : g.label}
                  {g.items.length > 1 && <span className="ml-1 tabular-nums font-normal">· {g.items.length}</span>}
                </span>
                {confirmDay === g.key ? (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[11px] text-text-muted hidden sm:inline">{t("history.undoDayConfirm")}</span>
                    <Button size="sm" variant="danger" onClick={() => restoreDay(g)} disabled={busyId !== null}>
                      {busyId !== null ? t("history.restoring") : t("history.confirmRestore")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDay(null)} disabled={busyId !== null}>
                      {t("gedcom.cancel")}
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setConfirmId(null); setConfirmDay(g.key); }}
                    disabled={busyId !== null}
                    className="ml-auto text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    {g.key === todayKey ? t("history.undoToday") : t("history.undoDay")}
                  </button>
                )}
              </div>

              <ul className="space-y-1.5">
                {g.items.map((e) => (
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
                      <Button size="sm" variant="secondary" onClick={() => { setConfirmDay(null); setConfirmId(e.id); }} disabled={busyId !== null}>
                        {t("history.restore")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl mt-3">{error}</p>}
    </Modal>
  );
}
