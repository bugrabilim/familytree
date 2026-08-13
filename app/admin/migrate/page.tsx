import { auth } from "@/auth";
import { canManage } from "@/lib/roles";
import { redirect } from "next/navigation";
import MigrateClient from "./MigrateClient";

export const dynamic = "force-dynamic";

/**
 * Faz 2 — Blob → Postgres göç aracı (yalnız founder + admin).
 * Yetkisizler /login ya da /tree'ye yönlendirilir.
 */
export default async function MigratePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const isFounder = session.user.isFounder ?? true;
  if (!isFounder || !canManage(session.user.role)) redirect("/tree");
  return <MigrateClient />;
}
