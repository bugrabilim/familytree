"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import PersonPicker from "./PersonPicker";
import type { Person } from "@/types/family";
import { fullName } from "@/lib/name";
import { useT, type TFunction } from "@/lib/i18n";

interface Visit {
  at: string;
  country?: string;
  city?: string;
  device?: string;
}
interface Share {
  id: string;
  url: string;
  token: string;
  label: string;
  hideLiving: boolean;
  /** Doluysa bağlantı tek kişiye daralmıştır (mezar QR'ı). */
  personId: string | null;
  createdAt: string;
  expiresAt: string | null;
  expired: boolean;
  views: number;
  visits: Visit[];
  qr: string;
}

/**
 * Herkese açık salt-okunur paylaşım — sahip arayüzü (çoklu bağlantı).
 *
 * Sahip birden çok kalıcı bağlantı üretir; her biri silinene dek yaşar.
 * Her bağlantı: bağlantı + QR + sosyal paylaşım + ziyaret istatistikleri
 * (anonim: ülke/şehir/cihaz/zaman) + isteğe bağlı süre. "Kod" yok.
 */
export default function ShareDialog({
  treeName,
  people,
  onClose,
}: {
  treeName?: string;
  /** Tek kişilik (mezar QR) bağlantısı için kişi listesi. */
  people: Person[];
  onClose: () => void;
}) {
  const t = useT();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Yeni bağlantı formu
  const [label, setLabel] = useState("");
  const [hideLiving, setHideLiving] = useState(true);
  // Varsayılan 7 gün — seçimsiz olmasın (#5). Süresiz için kullanıcı 0 yazar.
  const [expiryDays, setExpiryDays] = useState("7");
  // Tek kişilik (mezar QR) bağlantı — kapalıyken bağlantı ağacın tamamını açar.
  const [single, setSingle] = useState(false);
  const [personId, setPersonId] = useState("");

  // id → ad: kartlarda "kimin anma sayfası" yazabilmek için.
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of people) m.set(p.id, fullName(p));
    return m;
  }, [people]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/tree/share");
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(data?.error ?? t("share.failed"));
        setShares(data.shares ?? []);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const call = async (method: string, body?: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    // İstek hiç yanıt vermezse kullanıcı sonsuza dek beklemesin: süre dolunca
    // iptal edip anlaşılır bir hata göster (eskiden sessizce sonuçsuz kalıyordu).
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch("/api/tree/share", {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? t("share.failed"));
      if (!data || !Array.isArray(data.shares)) throw new Error(t("share.failed"));
      setShares(data.shares);
    } catch (e) {
      const err = e as Error;
      setError(err.name === "AbortError" ? t("share.timeout") : err.message || t("share.failed"));
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  };

  const create = () => {
    if (!label.trim()) return; // Etiket zorunlu (#6)
    const days = expiryDays.trim() ? Number(expiryDays) : 0;
    call("POST", {
      hideLiving,
      label: label.trim(),
      expiresDays: Number.isFinite(days) ? days : 0,
      // Kutu kapalıysa alan hiç gönderilmez: ağacın tamamı açılır.
      ...(single && personId ? { personId } : {}),
    });
    setLabel("");
    setExpiryDays("7");
  };

  const remove = (id: string) => {
    if (!window.confirm(t("share.deleteConfirm"))) return;
    call("DELETE", { id });
  };

  const days = expiryDays.trim() ? Number(expiryDays) : 0;
  const longExpiry = Number.isFinite(days) && days > 7;
  const unlimitedExpiry = !Number.isFinite(days) || days <= 0; // 0/boş = süresiz (#5)
  const labelMissing = !label.trim(); // Etiket zorunlu (#6)

  return (
    <Modal title={t("share.title")} subtitle={treeName ? t("share.subtitle", { tree: treeName }) : undefined} onClose={onClose}>
      <div className="space-y-5">
        <p className="text-sm text-text-muted leading-relaxed">{t("share.introMulti")}</p>

        {/* Yeni bağlantı oluştur */}
        <section className="rounded-2xl border border-border bg-surface p-3.5 space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">{t("share.newTitle")}</h3>
          <div>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("share.labelPlaceholder")}
              aria-required
              className={`w-full h-10 px-3 rounded-xl bg-surface-2 border text-text text-sm placeholder:text-text-subtle focus:outline-none focus:border-primary ${labelMissing ? "border-amber-400 dark:border-amber-600" : "border-border"}`}
            />
            {labelMissing && <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{t("share.labelRequired")}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
              <input type="checkbox" checked={hideLiving} onChange={(e) => setHideLiving(e.target.checked)} />
              {t("share.hideLivingLabel")}
            </label>
            <div className="flex items-center gap-1.5 text-sm text-text">
              <span className="text-text-muted">{t("share.expiryLabel")}</span>
              <input
                type="number"
                min={0}
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                placeholder="0"
                className="w-16 h-9 px-2 rounded-lg bg-surface-2 border border-border text-text text-sm tabular-nums focus:outline-none focus:border-primary"
              />
              <span className="text-text-subtle text-xs">{t("share.expiryDays")}</span>
            </div>
          </div>
          {/* Tek kişilik bağlantı — mezar taşına basılan QR için. */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
              <input type="checkbox" checked={single} onChange={(e) => setSingle(e.target.checked)} />
              {t("share.singleLabel")}
            </label>
            {single && (
              <>
                <PersonPicker people={people} value={personId} onChange={setPersonId} />
                <p className="text-[11px] text-text-subtle">{t("share.singleHint")}</p>
              </>
            )}
          </div>
          <p className="text-[11px] text-text-subtle">{t("share.expiryHint")}</p>
          {!hideLiving && <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-lg">{t("share.livingWarn")}</p>}
          {longExpiry && <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-lg">{t("share.expiryWarn")}</p>}
          {unlimitedExpiry && <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 px-2.5 py-1.5 rounded-lg">{t("share.unlimitedWarn")}</p>}
          <Button size="sm" onClick={create} disabled={busy || labelMissing || (single && !personId)}>
            {busy ? t("share.working") : t("share.createBtn")}
          </Button>
        </section>

        {/* Mevcut bağlantılar */}
        {shares === null ? (
          <p className="text-sm text-text-muted">{t("share.loading")}</p>
        ) : shares.length === 0 ? (
          <p className="text-sm text-text-subtle">{t("share.none")}</p>
        ) : (
          <div className="space-y-3">
            {shares.map((s) => (
              <ShareCard key={s.id} s={s} treeName={treeName} personName={s.personId ? nameOf.get(s.personId) : undefined} busy={busy} onDelete={() => remove(s.id)} onToggleHide={(v) => call("PATCH", { id: s.id, hideLiving: v })} t={t} />
            ))}
          </div>
        )}

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>}
      </div>
    </Modal>
  );
}

function ShareCard({
  s, treeName, personName, busy, onDelete, onToggleHide, t,
}: {
  s: Share; treeName?: string; personName?: string; busy: boolean; onDelete: () => void; onToggleHide: (v: boolean) => void; t: TFunction;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(s.url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* yoksay */ }
  };

  /*
   * Gömme kodu. `/g/<jeton>` → `/embed/<jeton>`; aynı jeton, aynı gizlilik
   * tercihi, yalnız sunum sade. Yol değiştirmesi bir dizeyle yapılıyor,
   * çünkü jetonun kendisi URL'in son parçası ve elimizde ayrıca durmuyor.
   *
   * `loading="lazy"` gömen sayfa hızlansın diye; `title` ekran okuyucu için
   * zorunlu — başlıksız bir iframe erişilebilirlik denetimlerinde düşer.
   */
  const embedUrl = s.url.replace("/g/", "/embed/");
  const embedCode =
    `<iframe src="${embedUrl}" width="100%" height="520" ` +
    `style="border:1px solid #ddd;border-radius:12px" loading="lazy" ` +
    `title="${(treeName ?? "").replace(/"/g, "&quot;")}"></iframe>`;
  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setEmbedCopied(true);
      window.setTimeout(() => setEmbedCopied(false), 1600);
    } catch { /* yoksay */ }
  };
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } };
  const fmtDT = (iso: string) => { try { return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };

  return (
    <section className={`rounded-2xl border p-3.5 space-y-3 ${s.expired ? "border-danger/40 bg-danger-soft/30" : "border-border bg-surface"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text truncate">{s.label || t("share.untitled")}</p>
          {/* Bu bağlantının ağacın tamamını mı yoksa tek kişiyi mi açtığı,
             silmeden önce görülebilmeli. Kişi silinmişse ad çözülemez;
             o zaman da en azından "tek kişilik" olduğu yazsın. */}
          {s.personId && (
            <p className="text-[11px] text-accent truncate">
              🪦 {personName ?? t("share.singleUnknown")}
            </p>
          )}
          <p className="text-[11px] text-text-subtle">
            {s.expired ? <span className="text-danger">{t("share.expired")}</span>
              : s.expiresAt ? t("share.expiresOn", { date: fmt(s.expiresAt) })
              : t("share.noExpiry")}
          </p>
        </div>
        <button onClick={onDelete} disabled={busy} title={t("share.delete")} className="shrink-0 w-8 h-8 grid place-items-center rounded-lg text-text-subtle hover:text-danger hover:bg-danger-soft transition-colors">✕</button>
      </div>

      {/* Bağlantı */}
      <div className="flex gap-2">
        <input readOnly value={s.url} onFocus={(e) => e.currentTarget.select()} className="flex-1 h-9 px-3 rounded-xl bg-surface-2 border border-border text-text text-xs" />
        <Button variant="secondary" size="sm" onClick={copy}>{copied ? t("share.copied") : t("share.copy")}</Button>
      </div>

      {/* Sosyal paylaşım */}
      <SocialButtons url={s.url} text={t("share.socialText", { tree: treeName ?? "" })} t={t} />

      {/* Yaşayanları gizle + QR/istatistik aç-kapa */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2 text-text cursor-pointer">
          <input type="checkbox" checked={s.hideLiving} disabled={busy} onChange={(e) => onToggleHide(e.target.checked)} />
          {t("share.hideLivingLabel")}
        </label>
        <button onClick={() => setShowStats((v) => !v)} className="text-primary hover:underline font-medium">
          👁 {t("share.viewsCount", { count: s.views })}
        </button>
        {s.qr && (
          <button onClick={() => setShowQr((v) => !v)} className="text-text-muted hover:text-text">
            {showQr ? t("share.hideQr") : t("share.showQr")}
          </button>
        )}
        {/*
          Gömme yalnız TAM AĞAÇ bağlantıları için. Tek kişilik jeton (mezar
          QR'ı) bir anma sayfasına, yani bir varış noktasına işaret ediyor;
          `/embed` o jetonu zaten reddediyor. Düğmeyi göstermek çalışmayan
          bir kod vermek olurdu.
        */}
        {!s.personId && !s.expired && (
          <button onClick={() => setShowEmbed((v) => !v)} className="text-text-muted hover:text-text">
            {showEmbed ? t("embed.hide") : t("embed.show")}
          </button>
        )}
      </div>

      {showEmbed && !s.personId && (
        <div className="rounded-xl bg-surface-2 border border-border p-2.5 space-y-2">
          <p className="text-[11px] text-text-subtle leading-snug">{t("embed.hint")}</p>
          <textarea
            readOnly
            value={embedCode}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t("embed.code")}
            className="w-full p-2 rounded-lg bg-surface border border-border text-text text-[11px] font-mono"
          />
          <Button variant="secondary" size="sm" onClick={copyEmbed}>
            {embedCopied ? t("share.copied") : t("embed.copy")}
          </Button>
        </div>
      )}

      {showQr && s.qr && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.qr} alt={t("share.qrAlt")} className="w-40 h-40 rounded-xl border border-border bg-white p-2" />
        </div>
      )}

      {showStats && (
        <div className="rounded-xl bg-surface-2 border border-border p-2.5">
          {s.visits.length === 0 ? (
            <p className="text-[11px] text-text-subtle">{t("share.noVisits")}</p>
          ) : (
            <ul className="space-y-1">
              {s.visits.map((v, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
                  <span>{v.device ?? "—"}{(v.city || v.country) ? ` · ${[v.city, v.country].filter(Boolean).join(", ")}` : ""}</span>
                  <span className="tabular-nums text-text-subtle">{fmtDT(v.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Sosyal paylaşım butonları. Web amaç (intent) bağlantıları bir sekmede açılır;
 * masaüstünde web arayüzü, telefonda uygulama açılır. Instagram bağlantı-paylaşım
 * amacını web'de desteklemediğinden linki panoya kopyalayıp Instagram'ı açar.
 * Cihaz destekliyorsa yerel "Paylaş…" (OS paylaşım sayfası) da sunulur.
 */
function SocialButtons({ url, text, t }: { url: string; text: string; t: TFunction }) {
  const enc = encodeURIComponent;
  const msg = `${text} ${url}`.trim();
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const pill = "h-8 px-2.5 rounded-lg text-[11px] font-medium inline-flex items-center transition-transform hover:brightness-110 active:scale-95";

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
    <div className="flex flex-wrap gap-1.5">
      {canNative && (
        <button type="button" onClick={() => { navigator.share({ title: text, text, url }).catch(() => {}); }} className={`${pill} text-primary-text bg-primary`}>
          {t("share.native")}
        </button>
      )}
      {intents.map((it) => (
        <a key={it.key} href={it.href} target="_blank" rel="noopener noreferrer" className={`${pill} ${it.cls}`}>{it.label}</a>
      ))}
      <button
        type="button"
        title={t("share.instagramHint")}
        onClick={async () => { try { await navigator.clipboard.writeText(url); } catch { /* yoksay */ } window.open("https://www.instagram.com", "_blank", "noopener,noreferrer"); }}
        className={`${pill} text-white bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]`}
      >
        Instagram
      </button>
    </div>
  );
}
