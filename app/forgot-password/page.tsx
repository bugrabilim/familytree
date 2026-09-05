"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const t = useT();
  const [step, setStep] = useState<"form" | "done">("form");
  const [familyName, setFamilyName] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Madde 51 — ikinci kurtarma yolu: e-postayla bağlantı.
  const [mailBusy, setMailBusy] = useState(false);
  const [mailInfo, setMailInfo] = useState("");
  const router = useRouter();

  /*
   * E-postayla sıfırlama isteği. Uç HER DURUMDA aynı yanıtı veriyor (hesap
   * var/yok, adres bağlı/değil) — bu yüzden arayüz de tek bir cümle
   * gösteriyor. Farklı mesajlar göstermek, sunucudaki numaralandırma
   * korumasını arayüzden delmek olurdu.
   */
  const eMailIste = async () => {
    setError("");
    setMailInfo("");
    if (!familyName.trim()) {
      setError(t("forgot.treeNamePlaceholder"));
      return;
    }
    setMailBusy(true);
    try {
      await fetch("/api/reset-password/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyName: familyName.trim() }),
      });
      setMailInfo(t("forgot.emailSent"));
    } catch {
      setError(t("forgot.connError"));
    } finally {
      setMailBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirm) {
      setError(t("forgot.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyName, recoveryCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? t("forgot.genericError"));
      else setStep("done");
    } catch {
      setError(t("forgot.connError"));
    } finally {
      setLoading(false);
    }
  };

  if (step === "done") {
    return (
      <AuthShell icon="✅" title={t("forgot.doneTitle")} subtitle={t("forgot.doneSubtitle")}>
        <Button size="lg" full onClick={() => router.push("/login")}>
          {t("forgot.signIn")}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      icon="🔑"
      title={t("forgot.title")}
      subtitle={t("forgot.subtitle")}
      footer={
        <Link href="/login" className="text-primary font-medium hover:underline">
          {t("forgot.backToLogin")}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="f-soyisim">{t("forgot.treeName")}</label>
          <input
            id="f-soyisim"
            className={authField}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder={t("forgot.treeNamePlaceholder")}
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="f-kod">{t("forgot.recoveryCode")}</label>
          <input
            id="f-kod"
            className={`${authField} font-mono tracking-wider`}
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="f-sifre">{t("forgot.newPassword")}</label>
          <input
            id="f-sifre"
            type="password"
            className={authField}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("forgot.newPasswordPlaceholder")}
            minLength={6}
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="f-sifre2">{t("forgot.confirm")}</label>
          <input
            id="f-sifre2"
            type="password"
            className={authField}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("forgot.confirmPlaceholder")}
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}

        <Button type="submit" size="lg" full disabled={loading || mailBusy}>
          {loading ? t("forgot.updating") : t("forgot.reset")}
        </Button>
      </form>

      {/*
        İKİNCİ KURTARMA YOLU. Kurtarma kodu kayıt sırasında BİR KEZ gösteriliyor;
        kaybedildiğinde hesap kalıcı olarak gidiyordu. Doğrulanmış e-posta adresi
        bağlamış hesaplar artık bu yoldan da girebiliyor.
      */}
      <div className="mt-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-text-subtle">{t("forgot.orEmail")}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <p className="text-[11px] text-text-subtle leading-relaxed mb-3">
          {t("forgot.emailHint")}
        </p>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          full
          disabled={loading || mailBusy}
          onClick={eMailIste}
        >
          {mailBusy ? t("forgot.emailSending") : t("forgot.emailSend")}
        </Button>

        {mailInfo && (
          <p className="text-[11px] text-text-subtle leading-relaxed mt-2.5">{mailInfo}</p>
        )}
      </div>
    </AuthShell>
  );
}
