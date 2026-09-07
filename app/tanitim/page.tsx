import type { Metadata } from "next";
import { getPlatformStats } from "@/lib/db";
import Landing from "@/components/Landing";

export const dynamic = "force-dynamic";

/**
 * Kendi başlığı var — kök yerleşimin varsayılanı kullanılsaydı bu sayfa
 * sekmede kökten (`/`) ayırt edilemezdi.
 *
 * KANONİK `/` : bu sayfa ile kök AYNI `Landing` bileşenini çiziyor ve arama
 * motoru oturumsuz geldiği için kökte de bu içeriği görüyor. İkisi de
 * sitemap'te; kanonik olmasa iki URL aynı içerikle birbiriyle yarışırdı.
 * `/tanitim` yine de duruyor ve dizine açık, çünkü GİRİŞ YAPMIŞ kullanıcı
 * için tanıtıma dönmenin tek kalıcı yolu o (Madde 8) — kök onu ağacına
 * yönlendirir.
 */
export const metadata: Metadata = {
  title: "Ailenin hikâyesini birlikte yazın",
  description:
    "Soy ağacınızı ücretsiz kurun: kuşakları görselleştirin, akrabalık derecelerini Türkçe adlarıyla görün, fotoğraf ve anıları saklayın; GEDCOM, e-Devlet ve yapay zekâ ile içe aktarın.",
  alternates: { canonical: "/" },
};

/**
 * Tanıtım (landing) sayfası — HER ZAMAN erişilebilir, giriş yapmış olsa bile.
 * Kök (`/`) giriş yapmış kullanıcıyı ağacına yönlendirdiğinden, kullanıcının
 * tanıtım sayfasına dönebilmesi için ayrı, kalıcı bir yol (Madde 8).
 */
export default async function TanitimPage() {
  const platform = await getPlatformStats();
  return <Landing platform={platform ?? undefined} />;
}
