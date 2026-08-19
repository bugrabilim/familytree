import { getPlatformStats } from "@/lib/db";
import Landing from "@/components/Landing";

export const dynamic = "force-dynamic";

/**
 * Tanıtım (landing) sayfası — HER ZAMAN erişilebilir, giriş yapmış olsa bile.
 * Kök (`/`) giriş yapmış kullanıcıyı ağacına yönlendirdiğinden, kullanıcının
 * tanıtım sayfasına dönebilmesi için ayrı, kalıcı bir yol (Madde 8).
 */
export default async function TanitimPage() {
  const platform = await getPlatformStats();
  return <Landing platform={platform ?? undefined} />;
}
