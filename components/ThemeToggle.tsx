"use client";

import { useSyncExternalStore } from "react";

import { useT } from "@/lib/i18n";

export const THEME_SCRIPT = `
(function(){
  try {
    var t = localStorage.getItem('tema');
    // Varsayılan AYDINLIK: yalnız kullanıcı açıkça 'dark' seçtiyse koyu tema.
    var dark = t === 'dark';
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

/**
 * Kayıtlı tema tercihini DOM'a uygular — `THEME_SCRIPT` ile AYNI kural, ama
 * çalışma anında çağrılabilen hâli.
 *
 * Neden ayrıca gerekiyor: `THEME_SCRIPT` kök yerleşimin `<head>`inde duruyor.
 * Sunucu çizimi sırasında bir hata olursa Next kök yerleşimi değil, kendi
 * asgari belgesini döndürüyor (`<html id="__next_error__">`, bkz. kılavuz:
 * "the built-in 500 page renders its own document"). Global stiller o belgede
 * de yükleniyor ama betik HİÇ çalışmıyor — sonuç: koyu tema seçmiş kullanıcı
 * hata ekranını beyaz zeminde görüyordu. `app/error.tsx` bağlanınca bunu
 * çağırıp tercihi geri koyuyor.
 */
export function applyStoredTheme() {
  try {
    document.documentElement.classList.toggle("dark", localStorage.getItem("tema") === "dark");
  } catch {
    // localStorage erişilemiyorsa (gizli mod) varsayılan açık tema kalır.
  }
}

/* Tema, DOM üzerindeki `.dark` sınıfında yaşıyor — React state'i değil.
   useSyncExternalStore ile o dış kaynağa abone oluyoruz. */
let listeners: Array<() => void> = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

export function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("tema", dark ? "dark" : "light");
  } catch {}
  listeners.forEach((l) => l());
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  /*
   * `aria-label` ve `title` SÖZLÜKTEN geliyor, sabit Türkçe değil.
   *
   * Bu düğmenin ikon dışında metni yok: erişilebilir adı TEK adı. Sabit
   * kodlanmışken EN dilinde yedi genel sayfanın hepsinde ekran okuyucu
   * "Koyu temaya geç" diyordu — İngilizce oturumda anlaşılmaz bir dize.
   * Anahtar hiç OLUŞTURULMADIĞI için i18n parite testi de bunu göremezdi
   * (parite yalnız var olan anahtarların iki yarısını karşılaştırır);
   * o boşluğu `tests/i18n-hardcode-gate.test.mts` kapatıyor.
   */
  const t = useT();

  return (
    <button
      onClick={() => setTheme(!dark)}
      aria-label={dark ? t("theme.toLight") : t("theme.toDark")}
      title={dark ? t("theme.light") : t("theme.dark")}
      /*
       * Dokunmada 44x44, farede (lg) eskisi gibi 36x36 — #307'de üst çubuk ve
       * tuval denetimleri için kurulan kalıbın aynısı. Ölçülen hâli 36x36'ydı
       * ve /login, /register, /privacy, /terms, /g sayfalarında tek başına
       * duran bir ikon düğmesiydi (yanında yanlışlıkla basılacak bir komşusu
       * bile yok, yani büyütmenin bedeli sıfır).
       */
      className={`w-11 h-11 lg:w-9 lg:h-9 grid place-items-center rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors ${className}`}
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M20 13.4A8.2 8.2 0 1110.6 4a6.6 6.6 0 009.4 9.4z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
