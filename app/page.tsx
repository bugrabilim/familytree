import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DEMO_USER_ID } from "@/lib/demo-account";
import { getPlatformStats } from "@/lib/db";
import Landing from "@/components/Landing";
import type { Metadata } from "next";

/**
 * Kök sayfanın BAŞLIĞI bilerek verilmiyor: kök yerleşimdeki
 * `title.default` ("Soy Ağacı — Ailenin hikâyesi") zaten tam olarak bu
 * sayfanın başlığı; burada tekrarlamak iki yerde bakım demek olurdu.
 * Şablon (`%s · Soy Ağacı`) yalnız ALT sayfalarda devreye giriyor.
 *
 * Kanonik açıkça yazılıyor: aynı içerik `/tanitim` adresinde de duruyor ve
 * ikisi de sitemap'te (bkz. `app/tanitim/page.tsx`).
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * Kök (`/`):
 *  · Gerçek hesapla giriş yapmış kullanıcı → ağacına (`/tree`).
 *  · Giriş yapmamış ZİYARETÇİ ya da yalnız DEMO oturumu → tanıtım (landing).
 *
 * Demo oturumu kalıcı bir çerez bıraktığından, kapatıp yeniden girince eskiden
 * doğrudan demo ağaca düşülüyordu; artık demo oturumları da landing'de başlar
 * (kullanıcı isterse "Demo" ile devam eder).
 */
export default async function HomePage() {
  const session = await auth();
  if (session && session.user?.id !== DEMO_USER_ID) redirect("/tree");
  const platform = await getPlatformStats();
  return <Landing platform={platform ?? undefined} />;
}
