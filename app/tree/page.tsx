import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import Navbar from "@/components/Navbar";
import TreeClient from "./TreeClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TreePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getFamilyData(session.user.id);

  return (
    <div className="flex flex-col h-screen">
      <Navbar familyName={session.user.name ?? undefined} />
      <div className="flex-1 overflow-hidden">
        <TreeClient people={data.people} />
      </div>
    </div>
  );
}
