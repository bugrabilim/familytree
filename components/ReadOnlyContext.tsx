"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

/**
 * Görüntüleme modu (read-only viewer mode).
 *
 * DİKKAT: Bu YALNIZCA arayüz düzeyinde bir görüntüleme katmanıdır — sunucu
 * tarafında zorlanan bir yetki/izin sistemi DEĞİLDİR. Uygulama "giriş yapan
 * herkes düzenleyebilir" modelini kullanır; gerçek çok kullanıcılı roller için
 * gereken hesap paylaşımı henüz yok. Bu bayrak açıkken düzenleme arayüzleri
 * (ekle/düzenle/sil) gizlenir/pasifleşir; böylece ağacı gönül rahatlığıyla
 * göz atmak veya akrabalarla ekran paylaşmak için salt-okunur hâle getirilir.
 * Sunucu API'si hâlâ yazmayı kabul eder — bu katman güvenlik sınırı değildir.
 */

/** localStorage anahtarı — görüntüleme modu tercihi */
const STORAGE_KEY = "soyagaci:readOnly";
/** Aynı sekmede tercih değişince dinleyicileri uyandıran özel olay */
const CHANGE_EVENT = "soyagaci:readOnly-change";

interface ReadOnlyValue {
  /** Uygulama salt-okunur (görüntüleme) modunda mı? */
  readOnly: boolean;
  setReadOnly: (v: boolean) => void;
  /** Rol "viewer" olduğu için zorunlu mu? (kullanıcı kapatamaz) */
  forced: boolean;
}

const ReadOnlyContext = createContext<ReadOnlyValue | null>(null);

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

export function ReadOnlyProvider({
  children,
  forced = false,
}: {
  children: React.ReactNode;
  /** Rol "viewer" ise true — salt-okunur zorlanır, kullanıcı açamaz. */
  forced?: boolean;
}) {
  const stored = useSyncExternalStore(subscribe, readSnapshot, () => false);
  const readOnly = forced || stored;

  const setReadOnly = useCallback(
    (v: boolean) => {
      if (forced) return; // viewer: değiştirilemez
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

  const value = useMemo<ReadOnlyValue>(
    () => ({ readOnly, setReadOnly, forced }),
    [readOnly, setReadOnly, forced]
  );

  return <ReadOnlyContext.Provider value={value}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): ReadOnlyValue {
  const ctx = useContext(ReadOnlyContext);
  if (!ctx) throw new Error("useReadOnly yalnızca ReadOnlyProvider içinde kullanılabilir");
  return ctx;
}
