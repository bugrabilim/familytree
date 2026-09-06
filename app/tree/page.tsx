import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { listDeletedTrees, listTrees } from "@/lib/trees";
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

  /*
   * Silinen ağaçlar AYRI isteniyor: `listTrees` yalnız canlıları döndürüyor
   * (bilerek — silinmiş bir ağaca geçilememeli). Arayüzün "Silinenler"
   * bölümü olmadan bekleme süresinin hiçbir anlamı kalmazdı: kullanıcı geri
   * getirme yolunu göremez, elimizde yalnız gecikmeli bir silme kalırdı.
   */
  const [{ people, updatedAt, coverPhoto }, { kisi }, trees, deletedTrees] = await Promise.all([
    getFamilyData(ctx.treeId),
    searchParams,
    isFounder ? listTrees(ctx.accountId, homeName) : Promise.resolve([]),
    isFounder ? listDeletedTrees(ctx.accountId) : Promise.resolve([]),
  ]);

  const activeName = trees.find((tr) => tr.treeId === ctx.treeId)?.name ?? homeName;

  return (
    <Workspace
      people={people}
      version={updatedAt}
      coverPhoto={coverPhoto}
      familyName={activeName}
      accountName={homeName}
      displayName={session?.user?.name ?? undefined}
      role={ctx.role}
      authorId={ctx.authorId}
      trees={trees}
      deletedTrees={deletedTrees}
      activeTreeId={ctx.treeId}
      isFounder={isFounder}
      initialSelectedId={kisi}
    />
  );
}
