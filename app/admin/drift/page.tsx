import { auth } from "@/auth";
import { canManage } from "@/lib/roles";
import { redirect } from "next/navigation";
import DriftClient from "./DriftClient";

export const dynamic = "force-dynamic";

/**
 * Madde 43 — Blob ↔ Postgres kayma denetimi (yalnız founder + admin).
 *
 * Göç aracının (`/admin/migrate`) yanıtladığı soru "veri oraya taşındı mı".
 * Buradaki soru farklı ve süreklidir: "hâlâ aynı mı". Yetki denetimi hem
 * burada hem uçta — sayfa yönlendirse bile uç kendi kapısını tutuyor.
 */
export default async function DriftPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const isFounder = session.user.isFounder ?? true;
  if (!isFounder || !canManage(session.user.role)) redirect("/tree");
  return <DriftClient />;
}
