"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/types/family";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import HistoryDialog from "./HistoryDialog";
import { usePrivacy } from "./PrivacyContext";
import { findIssues } from "@/lib/consistency";
import { indexPeople } from "@/lib/relations";
import { fullName } from "@/lib/name";
import { useT } from "@/lib/i18n";

interface Props {
  onClose: () => void;
  editable: boolean;
  peopleCount: number;
  /** Tüm kişiler — tutarlılık uyarıları (#2) için. */
  people: Person[];
  /** Bir uyarıdaki kişiye tıklanınca (pencereyi kapatıp profili aç). */
  onSelect: (id: string) => void;
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
  people,
  onSelect,
  onImportExport,
  onOpenTable,
  onCleared,
  onRestored,
}: Props) {
  const t = useT();
  const { view } = usePrivacy();
  const [clearOnay, setClearOnay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  // Tutarlılık uyarıları — olası veri hataları (İstatistikler'den taşındı, #2).
  const idx = useMemo(() => indexPeople(people), [people]);
  const issues = useMemo(() => findIssues(people), [people]);
  const [issuesOpen, setIssuesOpen] = useState(false);

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

        {/* Tutarlılık uyarıları — olası veri hataları (İstatistikler'den taşındı, #2).
            Açılır bölüm; kişiye tıklanınca pencere kapanır ve profil açılır. */}
        {issues.length > 0 && (
          <section className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setIssuesOpen((v) => !v)}
              aria-expanded={issuesOpen}
              className="w-full flex items-center justify-between gap-3 text-left"
            >
              <span className="flex items-baseline gap-2 min-w-0">
                <h3 className="text-sm font-semibold text-text">{t("panel.card.issues", { count: issues.length })}</h3>
                <span className="text-[11px] text-text-subtle shrink-0">{t("panel.card.issuesHint")}</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 text-text-subtle transition-transform ${issuesOpen ? "rotate-180" : ""}`}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {issuesOpen && (
              <ul className="space-y-1 mt-3">
                {issues.slice(0, 20).map((iss, i) => {
                  const raw = idx.get(iss.personId);
                  if (!raw) return null;
                  const p = view(raw);
                  return (
                    <li key={`${iss.personId}-${iss.kind}-${i}`}>
                      <button
                        onClick={() => { onClose(); onSelect(p.id); }}
                        className="w-full flex items-center gap-3 px-2 py-2 -mx-2 rounded-xl hover:bg-surface-2 transition-colors text-left"
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            iss.severity === "error" ? "bg-danger" : "bg-accent"
                          }`}
                          aria-hidden
                        />
                        <span className="text-sm text-text truncate min-w-0 shrink-0 max-w-[45%]">{fullName(p)}</span>
                        <span className="text-[11px] text-text-muted truncate flex-1">
                          {t(`panel.issue.${iss.kind}`)}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {issues.length > 20 && (
                  <li className="px-2 pt-1 text-[11px] text-text-subtle">
                    {t("panel.card.issuesMore", { count: issues.length - 20 })}
                  </li>
                )}
              </ul>
            )}
          </section>
        )}

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
