import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DEMO_USER_ID } from "@/lib/demo-account";
import { getPlatformStats } from "@/lib/db";
import Landing from "@/components/Landing";

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
