import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import Navbar from "@/components/Navbar";
import TreeClient from "./TreeClient";

export const dynamic = "force-dynamic";

export default async function TreePage() {
  const session = await auth();
  const data = await getFamilyData();

  return (
    <div className="flex flex-col h-screen">
      <Navbar familyName={session?.user?.name ?? undefined} />
      <div className="flex-1 overflow-hidden">
        <TreeClient people={data.people} />
      </div>
    </div>
  );
}
