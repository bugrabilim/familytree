import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

/** Başlık/açıklama neden Türkçe: bkz. `app/privacy/page.tsx`. */
export const metadata: Metadata = {
  title: "Kullanım Şartları",
  description:
    "Soy Ağacı'nı kullanırken geçerli koşullar: hesap ve ağaç sorumluluğu, içerik kuralları, paylaşım bağlantıları, hesabın kapatılması ve hizmetin sınırları.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalPage titleKey="legal.terms.title" bodyKey="legal.terms.body" />;
}
