"use client";

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitch from "./LanguageSwitch";
import { usePrivacy } from "./PrivacyContext";
import { useT } from "@/lib/i18n";

interface Props {
  onClose: () => void;
  /** "Arkadaşları göster" — çevre (aile-dışı) kişileri ağaçta göster/gizle. */
  showAssociates: boolean;
  onToggleAssociates: (v: boolean) => void;
}

/**
 * Ayarlar hub'ı (⋮ → Ayarlar). Yalnız genel tercihler: yaşayanları gizle,
 * arkadaşları göster, tema, dil. Kişi verisi işlemleri "Kişiler" hub'ında.
 */
export default function SettingsDialog({
  onClose,
  showAssociates,
  onToggleAssociates,
}: Props) {
  const t = useT();
  const { hideLiving, setHideLiving, forced: privacyForced } = usePrivacy();

  return (
    <Modal title={t("menu.settings")} onClose={onClose}>
      <div className="space-y-5">
        {/* Genel */}
        <section className="space-y-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle mb-1">{t("settings.general")}</h3>

          <button
            onClick={() => setHideLiving(!hideLiving)}
            disabled={privacyForced}
            aria-pressed={!hideLiving}
            className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text disabled:opacity-60"
          >
            <span>{t("settings.showLiving")}</span>
            <Switch on={!hideLiving} />
          </button>

          <button
            onClick={() => onToggleAssociates(!showAssociates)}
            aria-pressed={showAssociates}
            className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text"
          >
            <span>{t("settings.showAssociates")}</span>
            <Switch on={showAssociates} />
          </button>

          <div className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text">
            <span>{t("menu.theme")}</span>
            <ThemeToggle />
          </div>

          <div className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text">
            <span>{t("menu.language")}</span>
            <LanguageSwitch />
          </div>
        </section>

        {/* Bildirimler — yalnız hesap sahibi (founder) için görünür */}
        <NotifySettings />
      </div>
    </Modal>
  );
}

/**
 * E-posta bildirim tercihi (#3). Açılışta /api/account/notify'i dener; 403
 * (hesap sahibi değil) ya da hata olursa hiç gösterilmez. E-posta gönderimi
 * sunucuda yapılandırılmamışsa yine de tercih kaydedilebilir (anahtar
 * eklendiğinde çalışmaya başlar).
 */
function NotifySettings() {
  const t = useT();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [reminders, setReminders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/notify");
        if (!res.ok) return; // 403/401 → gösterme
        const d = await res.json();
        if (!alive) return;
        setEmail(d.notifyEmail ?? "");
        setReminders(!!d.notifyReminders);
        setShow(true);
      } catch {
        /* gösterme */
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!show) return null;

  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/account/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyEmail: email.trim(), notifyReminders: reminders }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? t("settings.notify.failed"));
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle mb-1">{t("settings.notify.title")}</h3>
      <p className="text-[11px] text-text-subtle leading-snug">{t("settings.notify.hint")}</p>
      <input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setSaved(false); }}
        placeholder={t("settings.notify.emailPlaceholder")}
        className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-text text-sm placeholder:text-text-subtle focus:outline-none focus:border-primary"
      />
      <button
        onClick={() => { setReminders((v) => !v); setSaved(false); }}
        aria-pressed={reminders}
        className="w-full flex items-center justify-between gap-3 py-2 text-sm text-text"
      >
        <span>{t("settings.notify.reminders")}</span>
        <Switch on={reminders} />
      </button>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? t("settings.notify.saving") : t("settings.notify.save")}
        </Button>
        {saved && <span className="text-[11px] text-primary">{t("settings.notify.saved")}</span>}
        {error && <span className="text-[11px] text-danger">{error}</span>}
      </div>
    </section>
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
