"use client";

import Link from "next/link";
import StatusScreen from "./StatusScreen";
import { useT } from "@/lib/i18n";

/**
 * 404 içeriği — istemci tarafı, çünkü dil tercihi (`useT`) localStorage'ta
 * yaşıyor ve sunucuda okunamıyor. `app/not-found.tsx` sunucu bileşeni
 * kalıyor, bu da `app/privacy` → `LegalPage` kalıbının aynısı.
 */
export default function NotFoundView() {
  const t = useT();
  return (
    <StatusScreen code={t("notfound.code")} title={t("notfound.title")} body={t("notfound.body")}>
      <Link
        href="/"
        className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-primary text-primary-text text-sm font-medium shadow-soft hover:bg-primary-hover transition-colors"
      >
        {t("notfound.home")}
      </Link>
      <Link
        href="/login"
        className="inline-flex items-center justify-center h-11 px-5 rounded-xl border border-border bg-surface text-sm font-medium hover:bg-surface-2 transition-colors"
      >
        {t("notfound.login")}
      </Link>
    </StatusScreen>
  );
}
