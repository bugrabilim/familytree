import { put, list, get, del } from "@vercel/blob";
import { saveFamilyData } from "@/lib/blob";
import { hasTreeAccess, type TreeMeta } from "@/lib/tree-access";

/**
 * Çoklu ağaç (Blob, "hafif kapsam") — bir founder hesabının sahip olduğu
 * ağaçların kaydı. "Ana ağaç" (home) founder'ın kimliğidir (treeId === accountId)
 * ve kayıtta TUTULMAZ; yalnız sonradan oluşturulan ağaçlar saklanır.
 *
 * Kayıt blob'u: `account-trees-<accountId>.json`.
 */

// Saf yetki mantığı ayrı modülde (test edilebilirlik); buradan yeniden dışa aktarılır.
export { hasTreeAccess };
export type { TreeMeta };

function registryPath(accountId: string) {
  return `account-trees-${accountId}.json`;
}

async function readRegistry(accountId: string): Promise<TreeMeta[]> {
  try {
    const { blobs } = await list({ prefix: registryPath(accountId) });
    if (blobs.length === 0) return [];
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    const result = await get(latest.pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return [];
    const data = (await new Response(result.stream).json()) as { trees?: TreeMeta[] };
    return Array.isArray(data.trees) ? data.trees : [];
  } catch {
    return [];
  }
}

async function writeRegistry(accountId: string, trees: TreeMeta[]): Promise<void> {
  await put(registryPath(accountId), JSON.stringify({ trees }), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Founder'ın tüm ağaçları — ana ağaç başta (home:true), sonra oluşturduğu ağaçlar. */
export async function listTrees(
  accountId: string,
  homeName: string
): Promise<Array<TreeMeta & { home: boolean }>> {
  const owned = await readRegistry(accountId);
  return [
    { treeId: accountId, name: homeName, createdAt: "", home: true },
    ...owned.map((t) => ({ ...t, home: false })),
  ];
}

/** Founder'ın erişebildiği ağaç kimliklerini döndürür (ana + sahip olunanlar). */
export async function accessibleTreeIds(accountId: string): Promise<string[]> {
  const owned = await readRegistry(accountId);
  return [accountId, ...owned.map((t) => t.treeId)];
}

export async function createTree(accountId: string, name: string): Promise<TreeMeta> {
  const meta: TreeMeta = {
    treeId: crypto.randomUUID(),
    name: name.trim() || "Yeni ağaç",
    createdAt: new Date().toISOString(),
  };
  // Boş ağaç verisi oluştur, sonra kayda ekle.
  await saveFamilyData(meta.treeId, { people: [], updatedAt: new Date().toISOString() });
  const owned = await readRegistry(accountId);
  owned.push(meta);
  await writeRegistry(accountId, owned);
  return meta;
}

export async function renameTree(accountId: string, treeId: string, name: string): Promise<boolean> {
  const owned = await readRegistry(accountId);
  const t = owned.find((x) => x.treeId === treeId);
  if (!t) return false;
  t.name = name.trim() || t.name;
  await writeRegistry(accountId, owned);
  return true;
}

/** Ağacı siler (ana ağaç silinemez). Kayıttan çıkarır + veri/erişim blob'larını temizler. */
export async function deleteTree(accountId: string, treeId: string): Promise<boolean> {
  if (treeId === accountId) return false; // ana ağaç silinemez
  const owned = await readRegistry(accountId);
  if (!owned.some((x) => x.treeId === treeId)) return false;
  await writeRegistry(accountId, owned.filter((x) => x.treeId !== treeId));
  // En iyi çaba: veri ve erişim blob'larını sil (yoksa yoksay).
  await Promise.allSettled([
    del(`family-data-${treeId}.json`),
    del(`tree-access-${treeId}.json`),
  ]);
  return true;
}
