import type { Metadata } from "next";
import LoginView from "./LoginForm";

/**
 * Giriş sayfası.
 *
 * ## Neden burada bir sunucu bileşeni var
 *
 * Bu sayfanın gövdesi baştan sona istemci işi (`useState`, `signIn`,
 * `useSearchParams`), ama `metadata` / `generateMetadata` dışa aktarımları
 * YALNIZ sunucu bileşenlerinde destekleniyor: metadata, sayfa çizilmeden
 * önce sunucuda çözülüp ilk HTML yanıtına konuyor. Kılavuzun (generateMetadata,
 * "Why generateMetadata is Server Component only") önerdiği çözüm tam olarak
 * bu: `page.tsx` sunucu bileşeni kalır, istemci mantığı ayrı bir dosyaya
 * taşınır. Depoda `rsvp` ve `hikaye` sayfaları da aynı kalıpta.
 *
 * Başlık kök yerleşimdeki `title.template` ile birleşiyor: "Giriş · Soy Ağacı".
 * Metin Türkçe, çünkü metadata SUNUCUDA üretiliyor ve dil tercihi
 * (`lib/i18n.tsx`) tarayıcıdaki localStorage'ta yaşıyor — sunucunun okuyabildiği
 * bir dil sinyali yok. Depodaki mevcut sunucu tarafı çeviri çağrıları da bu
 * yüzden sabit `translate("tr", …)` kullanıyor (bkz. `app/g/[token]/page.tsx`).
 */
export const metadata: Metadata = {
  title: "Giriş",
  description:
    "Soy Ağacı hesabına gir: ağaç adın ve şifrenle ailenin ağacına ulaş, üye girişi yap ya da şifresiz demo ağacı incele.",
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return <LoginView />;
}
