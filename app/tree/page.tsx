import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import { redirect } from "next/navigation";
import Workspace from "./Workspace";

export const dynamic = "force-dynamic";

export default async function TreePage({
  searchParams,
}: {
  searchParams: Promise<{ kisi?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [{ people }, { kisi }] = await Promise.all([
    getFamilyData(session.user.id),
    searchParams,
  ]);

  return (
    <Workspace
      people={people}
      familyName={session.user.name ?? undefined}
      initialSelectedId={kisi}
    />
  );
}
