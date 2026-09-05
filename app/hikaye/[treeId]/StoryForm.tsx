"use client";

import { useEffect, useState } from "react";
import AuthShell from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/**
 * Akrabanın gördüğü yanıt formu.
 *
 * Sunucudan gelen görünüm yalnız SORUYU ve kimin hakkında olduğunu taşıyor
 * (`publicRequest`); jeton, kişi kimliği ve kuyruğun geri kalanı gelmiyor —
 * bağlantıyı alan kişiye ağacın içine bir pencere açılmamalı.
 *
 * Yanıtın DOĞRUDAN kayda geçmediği ekranda yazıyor. Yazmasaydı, kişi
 * yazdığının anında yayımlandığını sanırdı; oysa ağaç sahibi onaylayana
 * kadar bekliyor ve bu, yazarken ne söyleneceğini etkileyen bir bilgi.
 */

interface PublicRequest {
  question: string;
  subjectName: string;
  closed: boolean;
}

export default function StoryForm({ treeId, token }: { treeId: string; token: string }) {
  const t = useT();
  const [istek, setIstek] = useState<PublicRequest | null>(null);
  /* "Jeton yok" bir YÜKLEME sonucu değil, ilk durumun kendisi. */
  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState(token ? "" : t("story.noToken"));
  const [done, setDone] = useState(false);

  const [ad, setAd] = useState("");
  const [metin, setMetin] = useState("");
  const [busy, setBusy] = useState(false);

  const url = `/api/hikaye/${encodeURIComponent(treeId)}`;

  useEffect(() => {
    if (!token) return;
    let iptal = false;
    (async () => {
      try {
        const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const data = await res.json();
        if (iptal) return;
        if (!res.ok) throw new Error(data?.error ?? t("story.failed"));
        setIstek(data as PublicRequest);
      } catch (e) {
        if (!iptal) setError((e as Error).message);
      } finally {
        if (!iptal) setLoading(false);
      }
    })();
    return () => { iptal = true; };
  }, [token, url, t]);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, authorName: ad, text: metin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("story.failed"));
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <AuthShell icon="📖" title={t("story.title")}><p className="text-sm text-text-muted">{t("story.loading")}</p></AuthShell>;
  }

  if (done) {
    return (
      <AuthShell icon="🙏" title={t("story.thanksTitle")}>
        <p className="text-sm text-text-muted leading-relaxed">{t("story.thanks")}</p>
      </AuthShell>
    );
  }

  if (!istek) {
    return (
      <AuthShell icon="🔗" title={t("story.invalidTitle")}>
        <p className="text-sm text-text-muted leading-relaxed">{error || t("story.invalid")}</p>
      </AuthShell>
    );
  }

  if (istek.closed) {
    return (
      <AuthShell icon="🔒" title={t("story.closedTitle")}>
        <p className="text-sm text-text-muted leading-relaxed">{t("story.closed")}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell icon="📖" title={t("story.title")}>
      <form onSubmit={gonder} className="space-y-3">
        <p className="text-[11px] text-text-subtle">{t("story.about", { name: istek.subjectName })}</p>
        <p className="text-sm text-text leading-relaxed font-medium">{istek.question}</p>

        <div>
          <label className="text-xs font-medium block mb-1" htmlFor="h-ad">{t("story.yourName")}</label>
          <input
            id="h-ad"
            className="w-full text-sm px-3 py-2 rounded-xl bg-surface border border-border"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            required
          />
          {/*
            Adın neden istendiği yazıyor: bu depoda hiçbir iddia kaynaksız
            kayda girmiyor ve onaylanan katkı "kim anlattı" bilgisini taşıyor.
          */}
          <p className="text-[11px] text-text-subtle mt-1">{t("story.nameWhy")}</p>
        </div>

        <div>
          <label className="text-xs font-medium block mb-1" htmlFor="h-metin">{t("story.answer")}</label>
          <textarea
            id="h-metin"
            className="w-full text-sm px-3 py-2 rounded-xl bg-surface border border-border h-32 resize-none leading-relaxed"
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            maxLength={4000}
            required
          />
        </div>

        <p className="text-[11px] text-text-subtle leading-relaxed">{t("story.queueNote")}</p>

        <Button type="submit" size="sm" disabled={busy}>
          {busy ? t("story.sending") : t("story.send")}
        </Button>

        {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2 rounded-xl">{error}</p>}
      </form>
    </AuthShell>
  );
}
