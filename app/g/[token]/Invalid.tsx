"use client";

import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { useT } from "@/lib/i18n";

/** Geçersiz/kapalı paylaşım bağlantısı ekranı. */
export default function Invalid() {
  const t = useT();
  return (
    <AuthShell title={t("share.invalidTitle")}>
      <p className="text-sm text-text-muted mb-5">{t("share.invalidBody")}</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        {t("share.toHome")}
      </Link>
    </AuthShell>
  );
}
