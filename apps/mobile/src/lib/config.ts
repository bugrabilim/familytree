import Constants from "expo-constants";

/**
 * Backend kök URL'i. Native uygulama üretimdeki API'ye bağlanır.
 * Öncelik: EXPO_PUBLIC_API_URL env → app.json extra.apiBaseUrl → varsayılan.
 * Yerel geliştirme için EXPO_PUBLIC_API_URL=http://<bilgisayar-ip>:3000 ver.
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  "https://soyagaci.app";
