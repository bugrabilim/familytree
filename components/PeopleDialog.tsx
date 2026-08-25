"use client";

import { useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import HistoryDialog from "./HistoryDialog";
import { useT } from "@/lib/i18n";

interface Props {
  onClose: () => void;
  editable: boolean;
  peopleCount: number;
  /** İçe/dışa aktarma (GEDCOM / Excel / JSON) penceresini aç. */
  onImportExport: () => void;
  /** Tablo görünümüne geç. */
  onOpenTable: () => void;
  /** Tüm kişiler silindikten sonra (ağacı tazele). */
  onCleared: () => void;
  /** Bir güncelleme geri yüklendikten sonra (ağacı tazele). */
  onRestored: () => void;
}

/**
 * Kişiler hub'ı (⋮ → Kişiler). Kişi verisiyle ilgili işlemler: içe/dışa
 * aktarma, tablo görünümü ve tüm kişileri silme. (Ayarlar'dan buraya taşındı.)
 */
export default function PeopleDialog({
  onClose,
  editable,
  peopleCount,
  onImportExport,
  onOpenTable,
  onCleared,
  onRestored,
}: Props) {
  const t = useT();
  const [clearOnay, setClearOnay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleClear = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/family/clear", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("gedcom.clearFailed"));
      onCleared();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={t("menu.people")} onClose={onClose}>
      <div className="space-y-5">
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenTable}>
              {t("view.tablo.label")}
            </Button>
            {editable && (
              <Button variant="secondary" size="sm" onClick={onImportExport}>
                {t("common.gedcom")}
              </Button>
            )}
            {editable && (
              <Button variant="secondary" size="sm" onClick={() => setHistoryOpen(true)}>
                {t("history.button")}
              </Button>
            )}
          </div>

          {/* Tüm kişileri sil */}
          {editable && peopleCount > 0 && (
            <div className="pt-1">
              <p className="text-xs text-text-muted leading-relaxed mb-2">{t("gedcom.clearBody")}</p>
              {clearOnay ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-danger bg-danger-soft px-3 py-2 rounded-lg leading-relaxed">
                    {t("gedcom.clearWarn", { count: peopleCount })}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={handleClear} disabled={busy}>
                      {busy ? t("gedcom.clearing") : t("gedcom.clearConfirm", { count: peopleCount })}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setClearOnay(false)} disabled={busy}>
                      {t("gedcom.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setClearOnay(true)}>
                  {t("gedcom.clearButton")}
                </Button>
              )}
            </div>
          )}
        </section>

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}
      </div>

      {historyOpen && (
        <HistoryDialog
          onClose={() => setHistoryOpen(false)}
          onRestored={() => { setHistoryOpen(false); onRestored(); }}
        />
      )}
    </Modal>
  );
}
