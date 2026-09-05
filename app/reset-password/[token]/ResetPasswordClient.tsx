"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/** Şifre sıfırlama formu (madde 51). Jeton URL'den geliyor, ekranda gösterilmiyor. */
export default function ResetPasswordClient({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("forgot.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) setError(d?.error ?? t("reset.invalid"));
      else setDone(true);
    } catch {
      setError(t("forgot.connError"));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell icon="✅" title={t("reset.doneTitle")} subtitle={t("reset.doneSubtitle")}>
        <Button size="lg" full onClick={() => router.push("/login")}>
          {t("forgot.signIn")}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell icon="🔑" title={t("reset.title")} subtitle={t("reset.subtitle")}>
      <form onSubmit={gonder} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="r-sifre">{t("reset.password")}</label>
          <input
            id="r-sifre"
            type="password"
            className={authField}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("forgot.newPasswordPlaceholder")}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>
        <div>
          <label className={authLabel} htmlFor="r-tekrar">{t("reset.confirm")}</label>
          <input
            id="r-tekrar"
            type="password"
            className={authField}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("forgot.confirmPlaceholder")}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}

        <Button type="submit" size="lg" full disabled={loading}>
          {loading ? t("reset.submitting") : t("reset.submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
