import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Landing from "@/components/Landing";

/**
 * Kök (`/`): giriş yapmış kullanıcı ağacına gider; giriş yapmamış ziyaretçi
 * herkese açık tanıtım (landing) sayfasını görür.
 */
export default async function HomePage() {
  const session = await auth();
  if (session) redirect("/tree");
  return <Landing />;
}
