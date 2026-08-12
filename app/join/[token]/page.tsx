"use client";

import { use, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

type Status =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "ready"; treeName: string; role: string };

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useT();
  const router = useRouter();

  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/tree/join?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!alive) return;
        setStatus(res.ok && data.valid ? { kind: "ready", treeName: data.treeName, role: data.role } : { kind: "invalid" });
      } catch {
        if (alive) setStatus({ kind: "invalid" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/tree/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, displayName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("join.failed"));
        return;
      }
      // Katıldıktan sonra ağaç adı + kişisel şifreyle otomatik giriş.
      await signIn("credentials", { familyName: data.treeName, password, redirect: false });
      router.push("/tree");
    } catch {
      setError(t("join.connError"));
    } finally {
      setLoading(false);
    }
  };

  if (status.kind === "loading") {
    return (
      <AuthShell title={t("join.title")}>
        <p className="text-sm text-text-muted">{t("join.checking")}</p>
      </AuthShell>
    );
  }

  if (status.kind === "invalid") {
    return (
      <AuthShell title={t("join.invalidTitle")}>
        <p className="text-sm text-text-muted mb-5">{t("join.invalidBody")}</p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          {t("join.toLogin")}
        </Link>
      </AuthShell>
    );
  }

  const roleLabel = t(`role.${status.role}`);

  return (
    <AuthShell
      title={t("join.title")}
      subtitle={t("join.subtitle", { tree: status.treeName, role: roleLabel })}
      footer={
        <Link href="/login" className="text-sm text-primary hover:underline">
          {t("join.haveAccount")}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="join-name">{t("join.nameLabel")}</label>
          <input
            id="join-name"
            className={authField}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("join.namePlaceholder")}
            autoFocus
          />
        </div>
        <div>
          <label className={authLabel} htmlFor="join-pass">{t("join.passLabel")}</label>
          <input
            id="join-pass"
            type="password"
            className={authField}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("join.passPlaceholder")}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? t("join.joining") : t("join.action")}
        </Button>
      </form>
    </AuthShell>
  );
}
