"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import LanguageSwitch from "./LanguageSwitch";
import { useT } from "@/lib/i18n";

/**
 * Çıkmaz sayfaların ortak kabuğu — 404 ve beklenmedik hata.
 *
 * ## Neden ortak bir bileşen
 *
 * İki ekran da kullanıcıyı "buradan öteye gidemezsin" noktasında yakalıyor;
 * ikisinde de tek gerçek iş ÇIKIŞ YOLU vermek. Next.js'in kendi 404/500
 * ekranları tam da bunu yapmıyordu: İngilizce, markasız, tek bağlantısız ve
 * koyu tema seçiliyken bile beyaz zeminliydi. Aynı kabuğu iki dosyaya
 * kopyalasaydık, ikisinden biri er geç öbüründen ayrışırdı.
 *
 * Sitenin geri kalanıyla aynı jetonları (`bg-bg` / `text-text`) kullanıyor;
 * tema `<html class="dark">` üzerinden geldiği için açık/koyu ikisinde de
 * doğru zemini kendiliğinden alıyor. Üst çubuk da aynı: marka, dil ve tema
 * anahtarı — kullanıcı buraya düşünce siteden çıkmış hissetmesin.
 */
export default function StatusScreen({
  code,
  title,
  body,
  children,
}: {
  /** Büyük punto rozet (ör. "404"). Hata ekranında yok: kullanıcıya
      söyleyecek anlamlı bir kod yok ve teknik ayrıntı sızdırmıyoruz. */
  code?: string;
  title: string;
  body: string;
  /** Çıkış yolları — en az bir tanesi olmalı. */
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="min-h-screen flex flex-col bg-bg text-text">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary grid place-items-center shadow-soft">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 22V11M12 11L7.5 7.5M12 11l4.5-3.5" stroke="var(--primary-text)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="4.5" r="2.6" stroke="var(--primary-text)" strokeWidth="2" />
                <circle cx="5.5" cy="9" r="2.4" stroke="var(--primary-text)" strokeWidth="2" />
                <circle cx="18.5" cy="9" r="2.4" stroke="var(--primary-text)" strokeWidth="2" />
              </svg>
            </div>
            <span className="font-serif text-lg font-semibold">{t("auth.brand")}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 grid place-items-center px-5 py-16">
        <div className="w-full max-w-md text-center">
          {code && (
            <p className="font-serif text-6xl sm:text-7xl font-semibold text-text-muted/60 leading-none">
              {code}
            </p>
          )}
          <h1 className="font-serif text-2xl sm:text-3xl font-semibold mt-5">{title}</h1>
          <p className="text-sm text-text-muted leading-relaxed mt-3">{body}</p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
