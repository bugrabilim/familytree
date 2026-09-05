"use client";

import { useState } from "react";
import AuthShell from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/**
 * Kararı KULLANICI veriyor (iki düğme), sayfa açılışı değil — posta
 * istemcilerinin ön-getirmesi kararı onun yerine vermesin.
 *
 * İki düğme de eşit görünür: "onayla" öne çıkarılıp "reddet" küçültülseydi,
 * ret bir kaçış yolu gibi görünürdü. Burada onay ile ret aynı ağırlıkta iki
 * yanıt — çift onayın anlamı tam olarak bu.
 */
export default function ContactAnswerClient({
  token, valid, name, family, already,
}: {
  token: string;
  valid: boolean;
  name: string;
  family: string;
  already: boolean;
}) {
  const t = useT();
  const [durum, setDurum] = useState<"hazir" | "calisiyor" | "onaylandi" | "reddedildi" | "hata">(
    "hazir"
  );
  const [mesaj, setMesaj] = useState("");

  const yanitla = async (answer: "onayla" | "reddet") => {
    setDurum("calisiyor");
    try {
      const res = await fetch("/api/contact/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("contactAsk.failed"));
      setDurum(answer === "onayla" ? "onaylandi" : "reddedildi");
    } catch (e) {
      setMesaj((e as Error).message);
      setDurum("hata");
    }
  };

  if (!valid) {
    return (
      <AuthShell icon="🔗" title={t("contactAsk.invalidTitle")}>
        <p className="text-sm text-text-muted leading-relaxed">{t("contactAsk.invalid")}</p>
      </AuthShell>
    );
  }

  if (durum === "onaylandi" || (already && durum === "hazir")) {
    return (
      <AuthShell icon="✅" title={t("contactAsk.approvedTitle")}>
        <p className="text-sm text-text-muted leading-relaxed">{t("contactAsk.approved")}</p>
      </AuthShell>
    );
  }

  if (durum === "reddedildi") {
    return (
      <AuthShell icon="🙏" title={t("contactAsk.declinedTitle")}>
        <p className="text-sm text-text-muted leading-relaxed">{t("contactAsk.declined")}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell icon="🌳" title={t("contactAsk.title")}>
      <div className="space-y-3">
        <p className="text-sm text-text leading-relaxed">
          {t("contactAsk.intro", { name, family })}
        </p>
        <p className="text-[11px] text-text-subtle leading-relaxed">{t("contactAsk.what")}</p>
        {/*
          Sessizliğin ne anlama geldiği AÇIKÇA yazıyor: hiçbir şey yapmamak da
          geçerli bir yanıt ve sonucu "hiçbir posta gelmez". Yazılmasaydı,
          kullanıcı "onaylamazsam yine de gelir mi?" diye düşünürdü.
        */}
        <p className="text-[11px] text-text-subtle leading-relaxed">{t("contactAsk.silence")}</p>

        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => yanitla("onayla")} disabled={durum === "calisiyor"}>
            {t("contactAsk.approve")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => yanitla("reddet")}
            disabled={durum === "calisiyor"}
          >
            {t("contactAsk.decline")}
          </Button>
        </div>

        {durum === "hata" && <p className="text-xs text-danger">{mesaj}</p>}
      </div>
    </AuthShell>
  );
}
