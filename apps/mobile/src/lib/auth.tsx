import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { loginRequest, registerRequest, type ApiUser } from "./api";

const TOKEN_KEY = "soyagaci.token";
const USER_KEY = "soyagaci.user";

interface AuthState {
  loading: boolean;
  token: string | null;
  user: ApiUser | null;
  signIn: (familyName: string, password: string) => Promise<void>;
  signUp: (familyName: string, password: string) => Promise<{ recoveryCode: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);

  // Açılışta saklı jetonu yükle.
  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        if (t) setToken(t);
        if (u) setUser(JSON.parse(u) as ApiUser);
      } catch {
        // yoksay
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (t: string, u: ApiUser) => {
    setToken(t);
    setUser(u);
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, t),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(u)),
    ]);
  }, []);

  const signIn = useCallback(
    async (familyName: string, password: string) => {
      const { token: t, user: u } = await loginRequest(familyName, password);
      await persist(t, u);
    },
    [persist]
  );

  const signUp = useCallback(
    async (familyName: string, password: string) => {
      const { token: t, user: u, recoveryCode } = await registerRequest(familyName, password);
      await persist(t, u);
      return { recoveryCode };
    },
    [persist]
  );

  const signOut = useCallback(async () => {
    setToken(null);
    setUser(null);
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ loading, token, user, signIn, signUp, signOut }),
    [loading, token, user, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth yalnızca AuthProvider içinde kullanılabilir");
  return ctx;
}
