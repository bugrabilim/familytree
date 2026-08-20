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
  /** Kullanıcının elle tetiklediği yenileme (pull-to-refresh). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<FamilyState | null>(null);

/**
 * Ağaç verisini bir kez çekip tüm korumalı ekranlara verir. Liste ve profil
 * aynı kaynağı paylaşır; her ekran ayrı ayrı ağ isteği yapmaz.
 */
export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      setError("");
      try {
        const data = await apiFetch<FamilyData>("/api/family", { token });
        setPeople(Array.isArray(data.people) ? data.people : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Veri alınamadı.");
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
    () => ({ people, byId, loading, refreshing, error, refresh }),
    [people, byId, loading, refreshing, error, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFamily(): FamilyState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFamily FamilyProvider içinde kullanılmalı");
  return v;
}
