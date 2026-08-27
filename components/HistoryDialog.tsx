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
  // #5 — seçerek geri alma: işaretlenen güncellemelerden EN ESKİSİNİN durumuna
  // dönülür (o güncelleme ve sonrası geri alınır — doğrusal günlük anlamı).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmSel, setConfirmSel] = useState(false);
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

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

  // İşaretlenenlerin EN ESKİSİNE dön (o güncelleme ve sonrası geri alınır).
  const restoreSelected = () => {
    const chosen = (entries ?? []).filter((e) => selected.has(e.id));
    if (chosen.length === 0) return;
    const earliest = chosen.reduce((a, b) => (a.at <= b.at ? a : b));
    restore(earliest.id);
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

  return (
    <Modal title={t("history.title")} subtitle={t("history.subtitle")} onClose={onClose}>
      {entries === null && !error ? (
        <p className="text-sm text-text-muted">{t("history.loading")}</p>
      ) : entries && entries.length === 0 ? (
        <p className="text-sm text-text-muted">{t("history.empty")}</p>
      ) : (
        <div>
          {/* Sabit yükseklikli üst yuva — seçim çubuğu belirince alttaki
             başlıklar KAYMASIN diye her zaman aynı yüksekliği kaplar (#2). */}
          <div className="h-12 mb-1 flex items-center">
            {selected.size > 0 ? (
              <div className="w-full flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2">
                {confirmSel ? (
                  <>
                    <span className="text-[11px] text-text-muted flex-1">{t("history.undoSelectedConfirm", { count: selected.size })}</span>
                    <Button size="sm" variant="danger" onClick={restoreSelected} disabled={busyId !== null}>
                      {busyId !== null ? t("history.restoring") : t("history.confirmRestore")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmSel(false)} disabled={busyId !== null}>
                      {t("gedcom.cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-medium text-primary flex-1">{t("history.selectedCount", { count: selected.size })}</span>
                    <Button size="sm" variant="danger" onClick={() => setConfirmSel(true)} disabled={busyId !== null}>
                      {t("history.undoSelected")}
                    </Button>
                    <button onClick={() => setSelected(new Set())} className="text-[11px] text-text-subtle hover:text-text">
                      {t("history.clearSelection")}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-text-subtle px-1">{t("history.selectHint")}</p>
            )}
          </div>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          {groups.map((g) => (
            <div key={g.key} className="space-y-1.5">
              {/* Gün başlığı (yalnız etiket) */}
              <div className="flex items-center gap-2 px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
                  {g.key === todayKey ? t("history.today") : g.label}
                  {g.items.length > 1 && <span className="ml-1 tabular-nums font-normal">· {g.items.length}</span>}
                </span>
              </div>

              <ul className="space-y-1.5">
                {g.items.map((e) => (
                  <li key={e.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${selected.has(e.id) ? "border-primary/40 bg-primary-soft/40" : "border-border bg-surface"}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggleSel(e.id)}
                      disabled={busyId !== null}
                      aria-label={t("history.select")}
                      className="shrink-0 accent-[var(--primary)]"
                    />
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
                        {t("history.undoUpdate")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl mt-3">{error}</p>}
    </Modal>
  );
}
