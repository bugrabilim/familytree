import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor yapılandırması — iOS/Android mağaza kabuğu.
 *
 * Uygulama sunucu-taraflı bir Next.js sitesidir; native kabuk üretimdeki siteyi
 * WebView'de yükler (server.url). Gerçek alan adını CAP_SERVER_URL ile ya da
 * aşağıdaki varsayılanı düzenleyerek AYARLA. Ağ yokken `webDir` (mobile-shell)
 * yedek ekran gösterilir.
 */
const SERVER_URL = process.env.CAP_SERVER_URL || "https://soyagaci.app";

const config: CapacitorConfig = {
  appId: "com.bumbateknoloji.soyagaci",
  appName: "Soy Ağacı",
  webDir: "mobile-shell",
  server: {
    url: SERVER_URL,
    cleartext: false,
    // Site dışı gezinmeler (CDN/oauth vb.) gerekirse buraya ekle.
    allowNavigation: ["*.vercel.app"],
  },
  backgroundColor: "#f7f6f2",
  ios: { contentInset: "always" },
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      backgroundColor: "#1f6b47",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "DEFAULT",
      backgroundColor: "#1f6b47",
    },
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
