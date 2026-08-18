"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/**
 * Eşleştirme davetini kabul ekranı — kabul eden kendi hesabında GİRİŞ YAPMIŞ
 * olmalı. Kabulden sonra iki ağaç karşılıklı bağlanır ve bağlı ağaç görünümüne
 * gidilir.
 */
export default function AcceptPairPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tree/pair/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setNeedLogin(true);
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? t("pair.acceptFailed"));
      router.push(`/p/${encodeURIComponent(data.peerTreeId)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("pair.acceptTitle")} subtitle={t("pair.acceptSubtitle")}>
      <div className="space-y-4">
        <p className="text-sm text-text-muted leading-relaxed">{t("pair.acceptBody")}</p>
        {needLogin ? (
          <div className="space-y-2">
            <p className="text-sm text-danger">{t("pair.needLogin")}</p>
            <Link href="/login" className="text-sm text-primary hover:underline">
              {t("pair.toLogin")}
            </Link>
          </div>
        ) : (
          <Button onClick={accept} disabled={busy} className="w-full">
            {busy ? t("pair.accepting") : t("pair.accept")}
          </Button>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <Link href="/tree" className="block text-xs text-text-subtle hover:text-text">
          {t("pair.cancel")}
        </Link>
      </div>
    </AuthShell>
  );
}
