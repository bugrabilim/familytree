"use client";

import { useCallback, useEffect, useState } from "react";
import { RSVP_ANSWERS, type RsvpAnswer } from "@/types/gathering";
import AuthShell from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/**
 * Davetlinin gördüğü katılım formu.
 *
 * Hesap yok, giriş yok. Sunucudan gelen etkinlik görünümü jetonu ve
 * katılımcı listesini TAŞIMIYOR (`publicGathering`), o yüzden burada da
 * gösterilecek bir şey yok — yalnız özet sayı.
 */

interface PublicGathering {
  title: string;
  when: string;
  place?: string;
  description?: string;
  rsvpOpen: boolean;
  tally: { geliyorum: number; gelemiyorum: number; belki: number; headcount: number };
}

export default function RsvpForm({ treeId, token }: { treeId: string; token: string }) {
  const t = useT();
  const [gathering, setGathering] = useState<PublicGathering | null>(null);
  /*
   * "Jeton yok" bir YÜKLEME sonucu değil, ilk durumun kendisi. Effect
   * içinde setState ile kurmak hem gereksiz bir tur hem de deponun lint
   * kuralının haklı olarak işaret ettiği bir desen.
   */
  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState(token ? "" : t("rsvp.noToken"));
  const [done, setDone] = useState(false);

  const [name, setName] = useState("");
  const [answer, setAnswer] = useState<RsvpAnswer>("geliyorum");
  const [headcount, setHeadcount] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const url = `/api/rsvp/${encodeURIComponent(treeId)}?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!token) return; // ilk durumda zaten ele alındı
    let iptal = false;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        if (iptal) return;
        if (!res.ok) throw new Error(data?.error ?? t("rsvp.failed"));
        setGathering(data.gathering as PublicGathering);
      } catch (e) {
        if (!iptal) setError((e as Error).message);
      } finally {
        if (!iptal) setLoading(false);
      }
    })();
    return () => { iptal = true; };
  }, [url, token, t]);

  const gonder = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, answer, headcount, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("rsvp.failed"));
      if (data.gathering) setGathering(data.gathering as PublicGathering);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [url, name, answer, headcount, note, t]);

  if (loading) {
    return (
      <AuthShell title={t("rsvp.title")}>
        <p className="text-sm text-text-muted">{t("rsvp.loading")}</p>
      </AuthShell>
    );
  }

  if (!gathering) {
    return (
      <AuthShell title={t("rsvp.title")}>
        <p className="text-sm text-text-muted">{error || t("rsvp.invalid")}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={gathering.title}>
      <div className="space-y-4">
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-text-subtle shrink-0">{t("rsvp.when")}</dt>
            <dd className="text-text">{gathering.when.replace("T", " ")}</dd>
          </div>
          {gathering.place && (
            <div className="flex gap-2">
              <dt className="text-text-subtle shrink-0">{t("rsvp.place")}</dt>
              <dd className="text-text">{gathering.place}</dd>
            </div>
          )}
        </dl>

        {gathering.description && (
          <p className="text-sm text-text-muted leading-relaxed whitespace-pre-line">
            {gathering.description}
          </p>
        )}

        {/* Özet — kimin geldiği DEĞİL, kaç kişi. Ad listesi ailenin bilgisi. */}
        <p className="text-[11px] text-text-subtle">
          {t("rsvp.tally", { count: gathering.tally.geliyorum, people: gathering.tally.headcount })}
        </p>

        {!gathering.rsvpOpen ? (
          <p className="text-sm text-text-muted">{t("rsvp.closed")}</p>
        ) : done ? (
          <div className="space-y-2">
            <p className="text-sm text-text">{t("rsvp.thanks")}</p>
            {/*
              Yeniden yazmak yeni bir satır AÇMIYOR: aynı ad güncelleniyor.
              Bu yüzden "fikrimi değiştirdim" doğrudan mümkün.
            */}
            <Button variant="secondary" size="sm" onClick={() => setDone(false)}>
              {t("rsvp.change")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] text-text-subtle">{t("rsvp.name")}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary"
              />
            </label>

            <fieldset className="space-y-1">
              <legend className="text-[11px] text-text-subtle">{t("rsvp.answer")}</legend>
              <div className="flex flex-wrap gap-2">
                {RSVP_ANSWERS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAnswer(a)}
                    aria-pressed={answer === a}
                    className={`h-9 px-3 rounded-xl border text-sm transition-colors ${
                      answer === a
                        ? "bg-primary text-primary-text border-primary"
                        : "bg-surface-2 border-border text-text-muted hover:text-text"
                    }`}
                  >
                    {t(`rsvp.answer.${a}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            {answer === "geliyorum" && (
              <label className="block space-y-1">
                <span className="text-[11px] text-text-subtle">{t("rsvp.headcount")}</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={headcount}
                  onChange={(e) => setHeadcount(Number(e.target.value))}
                  className="w-24 h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary"
                />
              </label>
            )}

            <label className="block space-y-1">
              <span className="text-[11px] text-text-subtle">{t("rsvp.note")}</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                placeholder={t("rsvp.notePlaceholder")}
                className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary"
              />
            </label>

            <Button size="sm" onClick={gonder} disabled={busy || !name.trim()}>
              {busy ? t("rsvp.sending") : t("rsvp.send")}
            </Button>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </AuthShell>
  );
}
