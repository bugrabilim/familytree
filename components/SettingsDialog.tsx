"use client";

import { useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitch from "./LanguageSwitch";
import { usePrivacy } from "./PrivacyContext";
import { useT } from "@/lib/i18n";

interface Props {
  onClose: () => void;
  editable: boolean;
  peopleCount: number;
  onImportExport: () => void;
  onOpenTable: () => void;
  /** Tüm kişiler silindikten sonra (ağacı tazele). */
  onCleared: () => void;
}

/**
 * Ayarlar hub'ı (⋮ → Ayarlar). Genel tercihler (yaşayanları gizle, tema, dil,
 * içe/dışa aktar) + Kişiler bölümü (tablo, kişi ekle, tüm kişileri sil).
 */
export default function SettingsDialog({
  onClose,
  editable,
  peopleCount,
  onImportExport,
  onOpenTable,
  onCleared,
}: Props) {
  const t = useT();
  const { hideLiving, setHideLiving, forced: privacyForced } = usePrivacy();
  const [clearOnay, setClearOnay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    <Modal title={t("menu.settings")} onClose={onClose}>
      <div className="space-y-5">
        {/* Genel */}
        <section className="space-y-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle mb-1">{t("settings.general")}</h3>

          <button
            onClick={() => setHideLiving(!hideLiving)}
            disabled={privacyForced}
            aria-pressed={hideLiving}
            className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text disabled:opacity-60"
          >
            <span>{t("topbar.hideLiving")}</span>
            <Switch on={hideLiving} />
          </button>

          <div className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text">
            <span>{t("menu.theme")}</span>
            <ThemeToggle />
          </div>

          <div className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text">
            <span>{t("menu.language")}</span>
            <LanguageSwitch />
          </div>

          <div className="pt-1">
            <Button variant="secondary" size="sm" onClick={onImportExport}>
              {t("common.gedcom")}
            </Button>
          </div>
        </section>

        {editable && (
          <>
            <div className="h-px bg-border" />
            {/* Kişiler */}
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle mb-2">{t("settings.people")}</h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={onOpenTable}>
                  {t("view.tablo.label")}
                </Button>
              </div>

              {/* Tüm kişileri sil (item 5) */}
              {peopleCount > 0 && (
                <div className="mt-4">
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
          </>
        )}

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}
      </div>
    </Modal>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`w-9 h-5 rounded-full flex items-center px-0.5 shrink-0 transition-colors ${
        on ? "bg-primary justify-end" : "bg-surface-2 border border-border justify-start"
      }`}
    >
      <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
    </span>
  );
}
