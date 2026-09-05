"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import { demoGirisi } from "./actions";

function LoginForm() {
  const t = useT();
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/tree";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", { familyName, password, redirect: false });

    if (res?.error) {
      setError(t("login.error"));
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  };

  return (
    <AuthShell
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <>
          <p>
            {t("login.noAccount")}{" "}
            <Link href="/register" className="text-primary font-medium hover:underline">
              {t("login.createAccount")}
            </Link>
          </p>
          <p className="mt-2">
            <Link href="/forgot-password" className="text-text-subtle hover:text-primary hover:underline">
              {t("login.forgot")}
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="soyisim">{t("login.treeName")}</label>
          <input
            id="soyisim"
            className={authField}
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder={t("login.treeNamePlaceholder")}
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className={authLabel} htmlFor="sifre">{t("login.password")}</label>
          <input
            id="sifre"
            type="password"
            className={authField}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <p className="text-xs text-danger bg-danger-soft px-3 py-2.5 rounded-xl">{error}</p>
        )}

        <Button type="submit" size="lg" full disabled={loading || demoLoading}>
          {loading ? t("login.signingIn") : t("login.signIn")}
        </Button>
      </form>

      {/* Şifresiz demo */}
      <div className="mt-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-text-subtle">{t("login.or")}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          full
          disabled={loading || demoLoading}
          onClick={() => {
            setDemoLoading(true);
            setError("");
            demoGirisi().catch(() => {
              setDemoLoading(false);
              setError(t("login.demoFailed"));
            });
          }}
        >
          {demoLoading ? t("login.demoLoading") : t("login.demoButton")}
        </Button>

        <p className="text-[11px] text-text-subtle text-center mt-2.5 leading-relaxed">
          {t("login.demoNote")}
        </p>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
