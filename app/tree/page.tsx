import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { listTrees } from "@/lib/trees";
import { redirect } from "next/navigation";
import Workspace from "./Workspace";

export const dynamic = "force-dynamic";

export default async function TreePage({
  searchParams,
}: {
  searchParams: Promise<{ kisi?: string }>;
}) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) redirect("/login");
  const session = await auth();
  const isFounder = !!session?.user?.isFounder;
  const homeName = session?.user?.treeName ?? session?.user?.name ?? "Ağaç";

  const [{ people, updatedAt }, { kisi }, trees] = await Promise.all([
    getFamilyData(ctx.treeId),
    searchParams,
    isFounder ? listTrees(ctx.accountId, homeName) : Promise.resolve([]),
  ]);

  const activeName = trees.find((tr) => tr.treeId === ctx.treeId)?.name ?? homeName;

  return (
    <Workspace
      people={people}
      version={updatedAt}
      familyName={activeName}
      displayName={session?.user?.name ?? undefined}
      role={ctx.role}
      trees={trees}
      activeTreeId={ctx.treeId}
      isFounder={isFounder}
      initialSelectedId={kisi}
    />
  );
}
