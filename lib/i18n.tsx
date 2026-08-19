"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { translate, type Lang } from "./i18n-dict";

export type { Lang };

/** localStorage anahtarı — arayüz dili tercihi */
const STORAGE_KEY = "soyagaci:lang";
/** Aynı sekmede tercih değişince dinleyicileri uyandıran özel olay */
const CHANGE_EVENT = "soyagaci:lang-change";

/** Çeviri işlevi imzası — `{name}` biçimli interpolasyon destekler. */
export type TFunction = (key: string, params?: Record<string, string | number>) => string;

interface LangValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LangValue | null>(null);

/**
 * Dil tercihini localStorage'dan harici bir kaynak gibi okuyoruz —
 * PrivacyContext / ReadOnlyContext ile birebir aynı desen. `useSyncExternalStore`
 * SSR ile bağlanma (hydration) uyumsuzluğunu getServerSnapshot ile kendisi
 * çözer; sunucuda ve ilk okumada varsayılan "tr" döner.
 */
function subscribe(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

function readSnapshot(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "tr";
  } catch {
    // localStorage erişilemezse (gizli mod) varsayılan
    return "tr";
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readSnapshot, () => "tr" as Lang);

  // Erişilebilirlik/SEO: <html lang> aktif dile eşlensin — ekran okuyucular ve
  // arama motorları doğru dili görsün (statik layout "tr" ile başlar).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // yazılamıyorsa yoksay
    }
    // Aynı sekmedeki dinleyicileri uyandır (storage olayı yalnız diğer sekmelere gider)
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = useMemo<LangValue>(() => ({ lang, setLang }), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LangValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang yalnızca LanguageProvider içinde kullanılabilir");
  return ctx;
}

/**
 * Geçerli dile bağlı çeviri işlevi. `t("topbar.tree")` gibi çağrılır; eksik
 * çeviri `tr` karşılığına (o da yoksa anahtara) düşer, hiçbir zaman `undefined`
 * döndürmez.
 */
export function useT(): TFunction {
  const { lang } = useLang();
  return useCallback<TFunction>((key, params) => translate(lang, key, params), [lang]);
}
