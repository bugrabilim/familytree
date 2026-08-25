"use client";

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { useT, type TFunction } from "@/lib/i18n";

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

          {/* Sosyal paylaşım — bağlantıyı doğrudan uygulamalara gönder */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">{t("share.socialLabel")}</label>
            <SocialButtons url={state.url ?? ""} text={t("share.socialText", { tree: treeName ?? "" })} t={t} />
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

/**
 * Sosyal paylaşım butonları. Web amaç (intent) bağlantıları bir sekmede açılır;
 * masaüstünde web.whatsapp/web arayüzü, telefonda uygulama otomatik açılır.
 * Instagram bağlantı-paylaşım amacını web'de desteklemediğinden linki panoya
 * kopyalayıp Instagram'ı açar (kullanıcı yapıştırır). Cihaz destekliyorsa
 * yerel "Paylaş…" (OS paylaşım sayfası — Instagram vb. dahil) da sunulur.
 */
function SocialButtons({ url, text, t }: { url: string; text: string; t: TFunction }) {
  const enc = encodeURIComponent;
  const msg = `${text} ${url}`.trim();
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const pill = "h-9 px-3 rounded-xl text-xs font-medium inline-flex items-center transition-transform hover:brightness-110 active:scale-95";

  const intents: Array<{ key: string; label: string; cls: string; href: string }> = [
    { key: "whatsapp", label: "WhatsApp", cls: "text-white bg-[#25D366]", href: `https://wa.me/?text=${enc(msg)}` },
    { key: "x", label: "X", cls: "text-white bg-black", href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
    { key: "telegram", label: "Telegram", cls: "text-white bg-[#229ED9]", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
    { key: "linkedin", label: "LinkedIn", cls: "text-white bg-[#0A66C2]", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { key: "facebook", label: "Facebook", cls: "text-white bg-[#1877F2]", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { key: "sms", label: "SMS", cls: "text-text bg-surface-2 border border-border", href: `sms:?&body=${enc(msg)}` },
    { key: "email", label: t("share.email"), cls: "text-text bg-surface-2 border border-border", href: `mailto:?subject=${enc(text)}&body=${enc(msg)}` },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {canNative && (
        <button
          type="button"
          onClick={() => { navigator.share({ title: text, text, url }).catch(() => {}); }}
          className={`${pill} text-primary-text bg-primary`}
        >
          {t("share.native")}
        </button>
      )}
      {intents.map((it) => (
        <a key={it.key} href={it.href} target="_blank" rel="noopener noreferrer" className={`${pill} ${it.cls}`}>
          {it.label}
        </a>
      ))}
      {/* Instagram: web'de link paylaşım amacı yok → kopyala + Instagram'ı aç */}
      <button
        type="button"
        title={t("share.instagramHint")}
        onClick={async () => {
          try { await navigator.clipboard.writeText(url); } catch { /* yoksay */ }
          window.open("https://www.instagram.com", "_blank", "noopener,noreferrer");
        }}
        className={`${pill} text-white bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]`}
      >
        Instagram
      </button>
    </div>
  );
}
