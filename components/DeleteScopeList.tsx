"use client";

import { useT } from "@/lib/i18n";

/**
 * "Ne silinecek?" listesi — ağaç silme ile hesap silme arasında ORTAK.
 *
 * Tek yerde durması bir görsel tercih değil, bir doğruluk meselesi: iki ekran
 * kendi kopyasını taşısaydı, sunucuya yeni bir veri türü eklendiğinde
 * birinin listesi güncellenir ötekinin kalırdı. O zaman kullanıcı, bir
 * ekranda uyarılmadığı bir şeyi kaybederdi — yani asıl vaat ("neyi
 * kaybettiğini ÖNCEDEN bil") sessizce çürürdü.
 */
export const SILINECEK_TURLERI = [
  "people",
  "media",
  "recipes",
  "letters",
  "obituaries",
  "stories",
  "gatherings",
  "proposals",
  "members",
] as const;

export default function DeleteScopeList() {
  const t = useT();
  return (
    <ul className="space-y-1 text-[12px] text-text-muted leading-snug">
      {SILINECEK_TURLERI.map((tur) => (
        <li key={tur} className="flex items-start gap-1.5">
          <span aria-hidden className="text-danger mt-[3px] shrink-0">•</span>
          <span>{t(`deleteScope.${tur}`)}</span>
        </li>
      ))}
    </ul>
  );
}
