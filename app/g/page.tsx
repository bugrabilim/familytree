"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthShell, { authField, authLabel } from "@/components/AuthShell";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/**
 * Herkese açık "ağaç görüntüle" girişi — kod ya da bağlantı yapıştır.
 * Bağlantı yapıştırılırsa jeton ayıklanır; sonra `/g/<token>`'a yönlendirir.
 */
export default function OpenShare() {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState("");

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) return;
    // Bağlantı ise jetonu (/g/<token>) ayıkla; değilse olduğu gibi jeton kabul et.
    const m = raw.match(/\/g\/([^/?#\s]+)/);
    const token = m ? decodeURIComponent(m[1]) : raw;
    router.push(`/g/${encodeURIComponent(token)}`);
  };

  return (
    <AuthShell title={t("share.openTitle")} subtitle={t("share.openBody")}>
      <form onSubmit={go} className="space-y-4">
        <div>
          <label className={authLabel} htmlFor="g-code">{t("share.codeLabel")}</label>
          <input
            id="g-code"
            className={authField}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("share.openPlaceholder")}
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full">{t("share.openAction")}</Button>
      </form>
    </AuthShell>
  );
}
