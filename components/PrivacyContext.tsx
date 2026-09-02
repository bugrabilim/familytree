"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { Person } from "@/types/family";
import { viewPerson } from "@/lib/privacy";

/** localStorage anahtarı — yaşayanları gizleme tercihi */
const STORAGE_KEY = "soyagaci:hideLiving";
/** Aynı sekmede tercih değişince dinleyicileri uyandıran özel olay */
const CHANGE_EVENT = "soyagaci:hideLiving-change";

interface PrivacyValue {
  /** Yaşayan kişilerin özel bilgileri gizlensin mi? */
  hideLiving: boolean;
  setHideLiving: (v: boolean) => void;
  /** Rol "viewer" olduğu için gizleme zorunlu mu? (kullanıcı kapatamaz) */
  forced: boolean;
  /** Gösterime hazır kişi: tümüyle maskeli kopya, alan-bazlı gizli, ya da aynısı. */
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

export function PrivacyProvider({
  children,
  forced = false,
  forcedValue,
}: {
  children: React.ReactNode;
  /** Rol "viewer" ise true — yaşayan maskesi zorunlu, kullanıcı kapatamaz. */
  forced?: boolean;
  /**
   * `forced` iken kilitlenecek değer. Verilmezse `true` (yaşayanları gizle).
   * Herkese açık paylaşımda sahibin tercihi (ör. false = yaşayanlar görünür)
   * bu yolla zorlanır.
   */
  forcedValue?: boolean;
}) {
  const stored = useSyncExternalStore(subscribe, readSnapshot, () => false);
  const hideLiving = forced ? forcedValue ?? true : stored;

  const setHideLiving = useCallback(
    (v: boolean) => {
      if (forced) return; // viewer: gizleme kapatılamaz
      try {
        window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
      } catch {
        // yazılamıyorsa yoksay
      }
      // Aynı sekmedeki dinleyicileri uyandır (storage olayı yalnız diğer sekmelere gider)
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [forced]
  );

  const view = useCallback(
    // Tek kaynak `lib/privacy.ts` → `viewPerson`. Sunucu tarafı da aynısını
    // kullanır; ikisi ayrışırsa gizlilik sessizce bozulurdu.
    (p: Person): Person => viewPerson(p, hideLiving),
    [hideLiving]
  );

  const value = useMemo<PrivacyValue>(
    () => ({ hideLiving, setHideLiving, forced, view }),
    [hideLiving, setHideLiving, forced, view]
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyValue {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error("usePrivacy yalnızca PrivacyProvider içinde kullanılabilir");
  return ctx;
}
