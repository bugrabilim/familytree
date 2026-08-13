"use client";

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { useT } from "@/lib/i18n";

interface ShareState {
  enabled: boolean;
  url?: string;
  token?: string;
  hideLiving?: boolean;
  qr?: string;
}

/**
 * Herkese açık salt-okunur paylaşım — sahip arayüzü.
 *
 * Ağaç sahibi bir bağlantı/kod/QR üretir; bunu bilen herkes (üye olmadan)
 * ağacı yalnızca görüntüler. Yaşayanların gizlenmesi seçilebilir. Jeton
 * yenilenebilir (eski bağlantı ölür) ya da paylaşım tümüyle kapatılabilir.
 */
export default function ShareDialog({
  treeName,
  onClose,
}: {
  treeName?: string;
  onClose: () => void;
}) {
  const t = useT();
  const [state, setState] = useState<ShareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"" | "url" | "code">("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/tree/share");
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data?.error ?? t("share.failed"));
        setState(data);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = async (body: { hideLiving?: boolean; rotate?: boolean }) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tree/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("share.failed"));
      setState(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!window.confirm(t("share.disableConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tree/share", { method: "DELETE" });
      if (!res.ok) throw new Error(t("share.failed"));
      setState({ enabled: false });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, which: "url" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      /* pano erişilemezse yoksay */
    }
  };

  return (
    <Modal title={t("share.title")} subtitle={treeName ? t("share.subtitle", { tree: treeName }) : undefined} onClose={onClose}>
      {state === null ? (
        <p className="text-sm text-text-muted">{t("share.loading")}</p>
      ) : !state.enabled ? (
        <div className="space-y-4">
          <p className="text-sm text-text-muted leading-relaxed">{t("share.introOff")}</p>
          <label className="flex items-start gap-2.5 text-sm text-text cursor-pointer">
            <input type="checkbox" defaultChecked className="mt-0.5" id="share-hide" />
            <span>
              {t("share.hideLivingLabel")}
              <span className="block text-[11px] text-text-subtle">{t("share.hideLivingHint")}</span>
            </span>
          </label>
          <Button
            onClick={() => {
              const hide = (document.getElementById("share-hide") as HTMLInputElement | null)?.checked ?? true;
              post({ hideLiving: hide });
            }}
            disabled={busy}
          >
            {busy ? t("share.working") : t("share.enable")}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-text-muted leading-relaxed">{t("share.introOn")}</p>

          {/* QR */}
          {state.qr && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.qr} alt={t("share.qrAlt")} className="w-44 h-44 rounded-xl border border-border bg-white p-2" />
            </div>
          )}

          {/* Bağlantı */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">{t("share.linkLabel")}</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={state.url ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 h-10 px-3 rounded-xl bg-surface border border-border text-text text-xs"
              />
              <Button variant="secondary" size="sm" onClick={() => copy(state.url ?? "", "url")}>
                {copied === "url" ? t("share.copied") : t("share.copy")}
              </Button>
            </div>
          </div>

          {/* Kod (jeton) */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">{t("share.codeLabel")}</label>
            <div className="flex gap-2">
              <input
                readOnly
                value={state.token ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 h-10 px-3 rounded-xl bg-surface border border-border text-text text-xs font-mono"
              />
              <Button variant="secondary" size="sm" onClick={() => copy(state.token ?? "", "code")}>
                {copied === "code" ? t("share.copied") : t("share.copy")}
              </Button>
            </div>
            <p className="text-[11px] text-text-subtle mt-1">{t("share.codeHint")}</p>
          </div>

          {/* Yaşayanları gizle */}
          <label className="flex items-start gap-2.5 text-sm text-text cursor-pointer">
            <input
              type="checkbox"
              checked={!!state.hideLiving}
              disabled={busy}
              onChange={(e) => post({ hideLiving: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              {t("share.hideLivingLabel")}
              <span className="block text-[11px] text-text-subtle">{t("share.hideLivingHint")}</span>
            </span>
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={() => post({ rotate: true, hideLiving: state.hideLiving })} disabled={busy}>
              {t("share.rotate")}
            </Button>
            <Button variant="ghost" size="sm" onClick={disable} disabled={busy}>
              {t("share.disable")}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl mt-4">{error}</p>}
    </Modal>
  );
}
