"use client";

import { useEffect, useState } from "react";
import Button from "./ui/Button";
import { useT } from "@/lib/i18n";

/**
 * Hesabın KİMLİK e-postası (Faz 3e).
 *
 * Bildirim adresinden ayrı ve arayüzde de öyle anlatılıyor: bu, hesabı geri
 * almanın yolu olacak adres. Doğrulanmamışken bunu söylemiyoruz — rozet
 * "Doğrulanmadı" der ve açıklama neden önemli olduğunu yazar.
 *
 * Teslimat yapılandırılmamışsa (madde 54) "bağlantı gönderildi" DEMİYORUZ;
 * sunucudan gelen `deliverable` bayrağına bakıp doğru cümleyi kuruyoruz.
 * Kullanıcıya gelmeyecek bir postayı beklemesini söylemek en kötüsü.
 */

interface Durum {
  authEmail: string;
  authEmailVerified: boolean;
  pending?: boolean;
  deliverable?: boolean;
}

export default function AccountEmailSection() {
  const t = useT();
  const [durum, setDurum] = useState<Durum | null>(null);
  const [deger, setDeger] = useState("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/account/email", { cache: "no-store" });
        if (!res.ok) return; // founder değilse bölüm hiç görünmesin
        const d = (await res.json()) as Durum;
        if (!alive) return;
        setDurum(d);
        setDeger(d.authEmail ?? "");
      } catch {
        /* isteğe bağlı bölüm — sessizce yok sayılır */
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!durum) return null;

  const kaydet = async () => {
    setBusy(true);
    setHata("");
    setBilgi("");
    try {
      const res = await fetch("/api/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: deger.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? t("verifyEmail.failed"));
      setDurum({ ...durum, ...d });
      // Doğru cümle: gönderilebildiyse "gönderildi", gönderilemediyse neden.
      if (d.authEmail && !d.authEmailVerified)
        setBilgi(d.deliverable ? t("account.email.pending") : t("account.email.undeliverable"));
    } catch (e) {
      setHata((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle mb-1">
        {t("account.email.label")}
      </h3>
      <p className="text-[11px] text-text-subtle leading-snug">{t("account.email.hint")}</p>
      <div className="flex gap-2 mt-1.5">
        <input
          type="email"
          value={deger}
          onChange={(e) => setDeger(e.target.value)}
          placeholder="ornek@eposta.com"
          className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text focus:outline-none focus:border-primary"
        />
        <Button size="sm" onClick={kaydet} disabled={busy}>
          {t("account.email.save")}
        </Button>
      </div>
      {durum.authEmail && (
        <p className="text-[11px] mt-1">
          <span className={durum.authEmailVerified ? "text-primary" : "text-text-subtle"}>
            {durum.authEmailVerified ? `✓ ${t("account.email.verified")}` : t("account.email.unverified")}
          </span>
        </p>
      )}
      {bilgi && <p className="text-[11px] text-text-muted leading-snug mt-1">{bilgi}</p>}
      {hata && <p className="text-[11px] text-danger mt-1">{hata}</p>}
    </section>
  );
}
