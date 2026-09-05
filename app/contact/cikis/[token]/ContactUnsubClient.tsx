"use client";

import { useState } from "react";
import AuthShell from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/** Çıkışı kullanıcı onaylıyor; ön-getirme kimseyi listeden düşürmesin. */
export default function ContactUnsubClient({ token }: { token: string }) {
  const t = useT();
  const [durum, setDurum] = useState<"hazir" | "calisiyor" | "tamam" | "hata">("hazir");
  const [mesaj, setMesaj] = useState("");

  const cik = async () => {
    setDurum("calisiyor");
    try {
      const res = await fetch("/api/contact/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("contactUnsub.failed"));
      setDurum("tamam");
    } catch (e) {
      setMesaj((e as Error).message);
      setDurum("hata");
    }
  };

  if (durum === "tamam") {
    return (
      <AuthShell icon="✅" title={t("contactUnsub.doneTitle")}>
        <p className="text-sm text-text-muted leading-relaxed">{t("contactUnsub.done")}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell icon="✉️" title={t("contactUnsub.title")}>
      <div className="space-y-3">
        <p className="text-sm text-text-muted leading-relaxed">{t("contactUnsub.intro")}</p>
        <Button size="sm" onClick={cik} disabled={durum === "calisiyor"}>
          {durum === "calisiyor" ? t("contactUnsub.working") : t("contactUnsub.action")}
        </Button>
        {durum === "hata" && <p className="text-xs text-danger">{mesaj}</p>}
      </div>
    </AuthShell>
  );
}
