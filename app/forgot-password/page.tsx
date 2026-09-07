import type { Metadata } from "next";
import ForgotPasswordView from "./ForgotForm";

/**
 * Şifremi unuttum. `page.tsx` neden sunucu bileşeni: bkz. `app/login/page.tsx`.
 *
 * Arama motorlarına KAPALI: sitemap'te de yok. Kurtarma akışının aranabilir
 * olmasının kimseye faydası yok, kimlik avı sayfalarının kopyalayacağı bir
 * hedef olmasının ise zararı var.
 */
export const metadata: Metadata = {
  title: "Şifremi unuttum",
  description:
    "Kurtarma kodun ya da hesabına bağlı e-posta adresinle Soy Ağacı şifreni sıfırla.",
  robots: { index: false, follow: true },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />;
}
