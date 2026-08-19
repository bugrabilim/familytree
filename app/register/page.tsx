"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

export default function RegisterPage() {
  const t = useT();
  const [step, setStep] = useState<"form" | "recovery">("form");
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError(t("register.passwordMismatch"));
      return;
    }
    if (!agreed) {
      setError(t("register.consentRequired"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("register.failed"));
        return;
      }
      setRecoveryCode(data.recoveryCode);
      setStep("recovery");
    } catch {
      setError(t("register.connError"));
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      await signIn("credentials", { familyName, password, redirect: false });
      router.push("/tree");
    } catch {
      router.push("/login");
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(recoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === "recovery") {
    return (
      <AuthShell
        icon="🔑"
        title={t("register.recoveryTitle")}
        subtitle={t("register.recoverySubtitle")}
      >
        <div className="rounded-2xl border-2 border-accent/40 bg-accent-soft p-4 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-2.5">
            {t("register.recoverySave")}
          </p>
          <p className="font-mono text-lg font-semibold text-center text-text tracking-[0.15em] break-all">
            {recoveryCode}
          </p>
        </div>

        <Button variant="secondary" full onClick={copyCode} className="mb-2.5">
          {copied ? t("register.copied") : t("register.copyCode")}
        </Button>

        <Button size="lg" full onClick={handleContinue} disabled={loading}>
          {loading ? t("register.signingIn") : t("register.goToTree")}
        </Button>

        <p className="text-[11px] text-text-subtle text-center mt-3.5 leading-relaxed">
          {t("register.recoveryWarning")}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      footer={
        <p>
          {t("register.haveAccount")}{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            {t("register.signIn")}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="r-soyisim">{t("register.treeName")}</label>
          <input
            id="r-soyisim"
            className={authField}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder={t("register.treeNamePlaceholder")}
            minLength={2}
            autoComplete="username"
            required
          />
          <p className="text-[11px] text-text-subtle mt-1.5">
            {t("register.treeNameHelp")}
          </p>
        </div>

        <div>
          <label className={authLabel} htmlFor="r-sifre">{t("register.password")}</label>
          <input
            id="r-sifre"
            type="password"
            className={authField}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("register.passwordPlaceholder")}
            minLength={6}
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="r-sifre2">{t("register.confirm")}</label>
          <input
            id="r-sifre2"
            type="password"
            className={authField}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("register.confirmPlaceholder")}
            autoComplete="new-password"
            required
          />
        </div>

        {/* Açık rıza — KVKK: gizlilik + şartlar onayı (zorunlu) */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-border accent-primary shrink-0"
          />
          <span className="text-[12px] text-text-muted leading-snug">
            <Link href="/privacy" target="_blank" className="text-primary hover:underline">
              {t("register.consentPrivacy")}
            </Link>{" "}
            {t("register.consentAnd")}{" "}
            <Link href="/terms" target="_blank" className="text-primary hover:underline">
              {t("register.consentTerms")}
            </Link>
            {t("register.consentTail")}
          </span>
        </label>

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}

        <Button type="submit" size="lg" full disabled={loading || !agreed}>
          {loading ? t("register.creating") : t("register.create")}
        </Button>
      </form>
    </AuthShell>
  );
}
