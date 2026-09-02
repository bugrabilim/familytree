"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Bond } from "@/types/bond";

/**
 * Duygusal bağ katmanının istemci tarafı.
 *
 * TEMBEL yükler: `enabled` ilk kez true olana kadar hiç istek atmaz. Bu
 * katmanı çoğu oturumda kimse açmıyor; herkese bir istek daha bindirmenin
 * anlamı yok. Bir kez yüklendikten sonra katman kapatılıp açılınca yeniden
 * çekilmez — veri elde kalır, çünkü kapatmak "unut" demek değil "gösterme"
 * demek.
 */
export interface UseBonds {
  bonds: Bond[];
  loading: boolean;
  /** Kullanıcıya gösterilecek son hata (varsa). */
  error?: string;
  save: (input: Partial<Bond> & { id?: string }) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  reload: () => Promise<void>;
}

interface Payload {
  bonds?: Bond[];
  error?: string;
}

export function useBonds(enabled: boolean): UseBonds {
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Bir kez yüklendi mi — katman kapanıp açılınca tekrar çekmemek için.
  const yuklendi = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const res = await fetch("/api/family/bonds", { cache: "no-store" });
      const data = (await res.json()) as Payload;
      if (!res.ok) throw new Error(data.error || "Bağlar yüklenemedi.");
      setBonds(data.bonds ?? []);
      yuklendi.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bağlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || yuklendi.current) return;
    void reload();
  }, [enabled, reload]);

  /**
   * Ekleme ve güncelleme tek yol: `id` varsa PUT, yoksa POST. Çağıran yerin
   * hangisi olduğunu bilmesi gerekmiyor; form aynı forma.
   */
  const save = useCallback(async (input: Partial<Bond> & { id?: string }) => {
    setError(undefined);
    try {
      const res = await fetch("/api/family/bonds", {
        method: input.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as Payload;
      if (!res.ok) throw new Error(data.error || "Kaydedilemedi.");
      // Sunucunun döndürdüğü tam listeyi alıyoruz: yerelde eklemek, başka bir
      // sekmede yapılan değişikliği görmezden gelirdi.
      setBonds(data.bonds ?? []);
      yuklendi.current = true;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi.");
      return false;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setError(undefined);
    try {
      const res = await fetch("/api/family/bonds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as Payload;
      if (!res.ok) throw new Error(data.error || "Silinemedi.");
      setBonds(data.bonds ?? []);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi.");
      return false;
    }
  }, []);

  return { bonds, loading, error, save, remove, reload };
}
