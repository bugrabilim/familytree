import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

/**
 * Metin TÜRKÇE: metadata sunucuda üretiliyor, dil tercihi ise tarayıcıdaki
 * localStorage'ta (`lib/i18n.tsx`) — sunucunun okuyabildiği bir dil sinyali
 * yok. Sayfanın GÖVDESİ iki dilli, başlık kaynak dilde.
 */
export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  description:
    "Soy Ağacı'nda hangi kişisel verileri işliyoruz, nerede saklıyoruz, kimlerle paylaşıyoruz ve KVKK kapsamındaki haklarınızı nasıl kullanırsınız.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage titleKey="legal.privacy.title" bodyKey="legal.privacy.body" />;
}
