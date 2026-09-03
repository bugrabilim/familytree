"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/**
 * Doğrulamayı KULLANICI başlatır (tek düğme), sayfa açılışı değil.
 *
 * Posta istemcileri ve önizleme botları bağlantıları ön-getiriyor; doğrulama
 * sayfa yüklenirken yapılsaydı jeton kullanıcı hiç görmeden tükenir ve
 * kullanıcı "bağlantı kullanılmış" hatasıyla karşılaşırdı.
 */
export default function VerifyEmailClient({ token }: { token: string }) {
  const t = useT();
  const [durum, setDurum] = useState<"hazir" | "calisiyor" | "tamam" | "hata">("hazir");
  const [mesaj, setMesaj] = useState("");

  const dogrula = async () => {
    setDurum("calisiyor");
    try {
      const res = await fetch("/api/account/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("verifyEmail.failed"));
      setMesaj(data.email ?? "");
      setDurum("tamam");
    } catch (e) {
      setMesaj((e as Error).message);
      setDurum("hata");
    }
  };

  return (
    <AuthShell title={t("verifyEmail.title")}>
      {durum === "tamam" ? (
        <div className="space-y-3">
          <p className="text-sm text-text">{t("verifyEmail.done", { email: mesaj })}</p>
          <Link href="/tree" className="text-sm text-accent underline">
            {t("verifyEmail.toTree")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted leading-relaxed">{t("verifyEmail.hint")}</p>
          <Button size="sm" onClick={dogrula} disabled={durum === "calisiyor"}>
            {durum === "calisiyor" ? t("verifyEmail.working") : t("verifyEmail.action")}
          </Button>
          {durum === "hata" && <p className="text-xs text-danger">{mesaj}</p>}
        </div>
      )}
    </AuthShell>
  );
}
