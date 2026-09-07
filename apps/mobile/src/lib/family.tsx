import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";
import { useAuth } from "./auth";
import type { FamilyData, Person } from "./types";

interface FamilyState {
  people: Person[];
  byId: Map<string, Person>;
  loading: boolean;
  refreshing: boolean;
  error: string;
  /**
   * Ekrandaki verinin dayandığı SÜRÜM DAMGASI (`GET /api/family` → `updatedAt`).
   *
   * Yazma isteklerinde `x-base-version` olarak geri gönderiliyor; sunucu
   * damga uyuşmazsa 409 dönüyor (`lib/blob.ts` → `versionMismatch`). Damga
   * zaten yanıtın içindeydi ama burada ATILIYORDU — ve sunucu başlık yoksa
   * çakışma denetimini hiç yapmadığı için mobilde iyimser kilit tümüyle
   * kapalıydı: 20 dakika önce açılmış bir formdan Kaydet'e basmak, arada
   * web'den yapılmış düzeltmeyi uyarısız geri alıyordu (form bütün alanları
   * gövdeye koyuyor, içinde ESKİ değerlerle).
   */
  baseVersion: string | null;
  /**
   * Kullanıcının elle tetiklediği yenileme (pull-to-refresh).
   *
   * Taze veriyi DÖNDÜRÜYOR: çakışma sonrası form, yenilenmiş kaydı bu
   * dönüşten okuyup alanlarını tazeliyor. Bağlamdaki `byId`ye bakamazdı —
   * `await`in içinde elindeki kopya hâlâ yenileme öncesinin.
   */
  refresh: () => Promise<FamilyData | null>;
}

const Ctx = createContext<FamilyState | null>(null);

/**
 * Ağaç verisini bir kez çekip tüm korumalı ekranlara verir. Liste ve profil
 * aynı kaynağı paylaşır; her ekran ayrı ayrı ağ isteği yapmaz.
 */
export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [baseVersion, setBaseVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (mode: "initial" | "refresh"): Promise<FamilyData | null> => {
      if (!token) return null;
      if (mode === "refresh") setRefreshing(true);
      setError("");
      try {
        const data = await apiFetch<FamilyData>("/api/family", { token });
        setPeople(Array.isArray(data.people) ? data.people : []);
        setBaseVersion(typeof data.updatedAt === "string" ? data.updatedAt : null);
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Veri alınamadı.");
        /*
         * Damga BOŞALTILIYOR. Okuma başarısızken elde kalan eski damgayla
         * yazmaya devam etmek, sunucunun çakışma denetimini bilerek yanlış
         * bir tabana dayandırmak olurdu.
         */
        setBaseVersion(null);
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    setLoading(true);
    load("initial");
  }, [load]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const refresh = useCallback(() => load("refresh"), [load]);

  const value = useMemo<FamilyState>(
    () => ({ people, byId, loading, refreshing, error, baseVersion, refresh }),
    [people, byId, loading, refreshing, error, baseVersion, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily(): FamilyState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFamily FamilyProvider içinde kullanılmalı");
  return v;
}
