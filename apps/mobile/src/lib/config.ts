import Constants from "expo-constants";

/**
 * Backend kök URL'i. Native uygulama üretimdeki API'ye bağlanır.
 * Öncelik: EXPO_PUBLIC_API_URL env → app.json extra.apiBaseUrl → varsayılan.
 * Yerel geliştirme için EXPO_PUBLIC_API_URL=http://<bilgisayar-ip>:3000 ver.
 *
 * ALAN ADI `soylus.com` — ve buraya bir yer tutucu yazılamaz.
 *
 * Burada uzun süre `soyagaci.app` duruyordu; depoda başka hiçbir yerde geçmeyen,
 * bize ait olmayan bir addı. Sonucu görünmez değil ölümcüldü: mağaza derlemesi
 * o adrese bağlanmaya çalışıp `fetch`te patlıyor ve kullanıcı giriş ekranında
 * "Bağlantı kurulamadı" görüyor — yani uygulama açılışta ölüyor. Doğrulanmış
 * gerçek alan adı `soylus.com` (bkz. `components/Landing.tsx`, `.env.local.example`
 * — Resend orada doğrulandı). Aynı değer `app.json` ve `eas.json`un ÜÇ build
 * profilinde de yazılı; birini değiştirip ötekini unutmak, hangi profille
 * derlendiğine bağlı olarak çalışan/çalışmayan bir uygulama demek.
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ||
  "https://soylus.com";
