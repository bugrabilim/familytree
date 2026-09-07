import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { loginRequest, registerRequest, setUnauthorizedHandler, type ApiUser } from "./api";
import { storedRole, type TreeRole } from "./roles";

const TOKEN_KEY = "soyagaci.token";
const USER_KEY = "soyagaci.user";

interface AuthState {
  loading: boolean;
  token: string | null;
  user: ApiUser | null;
  /**
   * Bugünkü kademeye ÇEVRİLMİŞ rol. Yetki kararları hep bunun üstünden
   * veriliyor, `user.role` (ham, telefonda aylardır duran dizge) üstünden
   * değil — bkz. `lib/roles.ts`.
   */
  role: TreeRole;
  /**
   * Oturum kendiliğinden düştüğünde (sunucudan 401) giriş ekranında
   * gösterilecek açıklama. Boş dize = gösterilecek bir şey yok.
   */
  sessionNote: string;
  clearSessionNote: () => void;
  signIn: (familyName: string, password: string, username?: string) => Promise<void>;
  signUp: (familyName: string, password: string) => Promise<{ recoveryCode: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [sessionNote, setSessionNote] = useState("");

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
    // Yeni oturum, eski oturumun düşme uyarısını geçersiz kılar.
    setSessionNote("");
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, t),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(u)),
    ]);
  }, []);

  const signIn = useCallback(
    async (familyName: string, password: string, username = "") => {
      const { token: t, user: u } = await loginRequest(familyName, password, username);
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

  /*
   * SUNUCU "BU JETON ARTIK GEÇERLİ DEĞİL" DERSE OTURUMU BURADA KAPATIYORUZ.
   *
   * `apiFetch` bir bileşen değil, bağlamı göremiyor; o yüzden kancayı
   * uygulamanın kimlik sahibi olan bu bileşen takıyor. Jetonu temizlemek
   * yetiyor: korumalı yığın (`app/(app)/_layout.tsx`) jeton yoksa girişe
   * yönlendiriyor. Notu da bırakıyoruz, yoksa kullanıcı kendini sebepsiz
   * yere giriş ekranında bulurdu — hesabını az önce silmiş ya da ağaçtan
   * çıkarılmış olabilir, ikisi de açıklanmaya değer.
   */
  useEffect(() => {
    setUnauthorizedHandler((mesaj) => {
      setSessionNote(mesaj);
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const clearSessionNote = useCallback(() => setSessionNote(""), []);

  /*
   * Rol TEK YERDE çözülüyor. Ekranların `user.role`u kendi başına yorumlaması,
   * telefonda duran eski adı ("admin") tanımayan bir arayüz demekti: kurucu
   * kendi ağacında her formda "yetkin yok" görüyordu.
   */
  const role = useMemo<TreeRole>(() => storedRole(user?.role, !!user), [user]);

  const value = useMemo<AuthState>(
    () => ({ loading, token, user, role, sessionNote, clearSessionNote, signIn, signUp, signOut }),
    [loading, token, user, role, sessionNote, clearSessionNote, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth yalnızca AuthProvider içinde kullanılabilir");
  return ctx;
}
