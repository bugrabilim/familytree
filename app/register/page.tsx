import type { Metadata } from "next";
import RegisterView from "./RegisterForm";

/**
 * Kayıt sayfası. `page.tsx` neden sunucu bileşeni: bkz. `app/login/page.tsx`
 * — `metadata` yalnız sunucu bileşenlerinde çalışıyor, form ise baştan sona
 * istemci işi.
 */
export const metadata: Metadata = {
  title: "Hesap oluştur",
  description:
    "Ailenin soy ağacını ücretsiz kur. Ağaç adını ve şifreni seç, kurtarma kodunu al; kuşakları, anıları ve fotoğrafları birlikte doldurmaya başla.",
  alternates: { canonical: "/register" },
};

export default function RegisterPage() {
  return <RegisterView />;
}
