"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { Person } from "@/types/family";
import { isMasked, maskPerson } from "@/lib/privacy";

/** localStorage anahtarı — yaşayanları gizleme tercihi */
const STORAGE_KEY = "soyagaci:hideLiving";
/** Aynı sekmede tercih değişince dinleyicileri uyandıran özel olay */
const CHANGE_EVENT = "soyagaci:hideLiving-change";

interface PrivacyValue {
  /** Yaşayan kişilerin özel bilgileri gizlensin mi? */
  hideLiving: boolean;
  setHideLiving: (v: boolean) => void;
  /** Gösterime hazır kişi: gizlenmesi gerekiyorsa maskeli kopya, değilse aynısı. */
  view: (p: Person) => Person;
}

const PrivacyContext = createContext<PrivacyValue | null>(null);

/**
 * Tercihi localStorage'dan harici bir kaynak gibi okuyoruz. `useSyncExternalStore`
 * SSR ile bağlanma (hydration) uyumsuzluğunu getServerSnapshot=false ile kendisi
 * çözer; effect içinde setState çağırmaya gerek kalmaz.
 */
function subscribe(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

function readSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // localStorage erişilemezse (gizli mod) varsayılan
    return false;
  }
}

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const hideLiving = useSyncExternalStore(subscribe, readSnapshot, () => false);

  const setHideLiving = useCallback((v: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      // yazılamıyorsa yoksay
    }
    // Aynı sekmedeki dinleyicileri uyandır (storage olayı yalnız diğer sekmelere gider)
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const view = useCallback(
    (p: Person): Person => (isMasked(p, hideLiving) ? maskPerson(p) : p),
    [hideLiving]
  );

  const value = useMemo<PrivacyValue>(
    () => ({ hideLiving, setHideLiving, view }),
    [hideLiving, setHideLiving, view]
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error("usePrivacy yalnızca PrivacyProvider içinde kullanılabilir");
  return ctx;
}
