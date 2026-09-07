"use client";

import { useEffect } from "react";
import Link from "next/link";
import StatusScreen from "@/components/StatusScreen";
import Button from "@/components/ui/Button";
import { applyStoredTheme } from "@/components/ThemeToggle";
import { useT } from "@/lib/i18n";

/**
 * Uygulama genelinde beklenmedik hata ekranı (hata sınırı).
 *
 * Hata sınırları İSTEMCİ bileşeni olmak zorunda — bu yüzden "use client".
 *
 * ## Kullanıcıya ne söylenir, ne söylenmez
 *
 * `error.message` ve `error.digest` EKRANA YAZILMAZ. Kılavuz (error.js) bunu
 * açıkça söylüyor: sunucu bileşenlerinden gelen hatalar üretimde zaten genel
 * bir mesaja indirgeniyor ama istemciden gelenler ORİJİNAL metni taşıyor —
 * yani yığın izi, dosya yolu, sorgu parçası gibi ayrıntılar sızabilirdi.
 * Kullanıcıya bunların hiçbiri yardımcı olmuyor; ayrıntı `console.error` ile
 * geliştiriciye ve sunucu günlüğüne gidiyor (`digest` ile eşlenebilir).
 *
 * ## Neden `retry`, `reset` değil
 *
 * Bu Next sürümünde (16.3) `retry` KARARLI ve kılavuzun önerdiği yol:
 * sınırın çocuklarını yeniden ÇEKİP yeniden çiziyor. `reset` yalnız sınırın
 * durumunu temizliyor; veriyi yeniden çekmediği için hata çoğu zaman aynı
 * anda geri geliyor ve düğme "çalışmıyor" gibi görünüyordu.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // Ayrıntı yalnız burada: ekrana değil, günlüğe.
    console.error(error);
  }, [error]);

  /*
   * Temayı geri koy. Bu ekran çoğu zaman kök yerleşimin İÇİNDE çiziliyor ve
   * tema zaten yerinde; ama SUNUCU çizimi sırasında oluşan bir hatada Next
   * kendi asgari belgesini döndürüyor ve kök yerleşimin tema betiği hiç
   * çalışmıyor. O durumda koyu tema seçmiş kullanıcı beyaz bir 500 ekranı
   * görüyordu — bulgunun 404 için anlattığının aynısı.
   */
  useEffect(() => {
    applyStoredTheme();
  }, []);

  return (
    <StatusScreen title={t("crash.title")} body={t("crash.body")}>
      <Button size="lg" onClick={() => retry()}>
        {t("crash.retry")}
      </Button>
      {/*
        Tekrar denemek işe yaramayabilir; o zaman kullanıcının elinde hâlâ
        bir çıkış yolu olmalı — yerleşik 500 ekranının vermediği tam da buydu.
      */}
      <Link
        href="/"
        className="inline-flex items-center justify-center h-12 px-6 rounded-xl border border-border bg-surface text-[15px] font-medium hover:bg-surface-2 transition-colors"
      >
        {t("crash.home")}
      </Link>
    </StatusScreen>
  );
}
