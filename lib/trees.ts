import { put, list, get, del } from "@vercel/blob";
import { saveFamilyData } from "@/lib/blob";
import { hasTreeAccess, type TreeMeta } from "@/lib/tree-access";
import { dbDeleteTree, dbRenameTree, dbUpsertTree } from "@/lib/db";
import { markTreeDeleted } from "@/lib/members";
import { failedPaths, treeBlobPaths } from "@/lib/tree-storage";
import { graceInfo, isSoftDeleted, type GraceInfo } from "@/lib/retention";

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

/**
 * Founder'ın CANLI ağaçları — ana ağaç başta (home:true), sonra oluşturduğu
 * ağaçlar. Yumuşak silinmiş ağaçlar YOKTUR; onlar `listDeletedTrees` ile
 * ayrıca istenir (arayüz "çöp kutusu" gösterebilsin diye).
 */
export async function listTrees(
  accountId: string,
  homeName: string
): Promise<Array<TreeMeta & { home: boolean }>> {
  const owned = await readRegistry(accountId);
  return [
    { treeId: accountId, name: homeName, createdAt: "", home: true },
    ...owned.filter((t) => !isSoftDeleted(t)).map((t) => ({ ...t, home: false })),
  ];
}

/** Bekleme süresindeki (yumuşak silinmiş) ağaçlar + kalan gün. */
export async function listDeletedTrees(
  accountId: string
): Promise<Array<TreeMeta & GraceInfo>> {
  const owned = await readRegistry(accountId);
  return owned
    .filter((t) => isSoftDeleted(t))
    .map((t) => ({ ...t, ...graceInfo(t.deletedAt!) }));
}

/**
 * Founder'ın erişebildiği ağaç kimlikleri (ana + sahip olunanlar).
 *
 * SİLİNMİŞ AĞAÇ BURADA YOKTUR ve bu, gizlemenin ana kapısı: `resolveActiveTree`
 * ve `/api/trees/switch` yetkiyi buradan soruyor, dolayısıyla yumuşak silinmiş
 * bir ağaç hiçbir oturumda aktif ağaç olamaz — her API rotası tek noktadan
 * kapanmış olur.
 */
export async function accessibleTreeIds(accountId: string): Promise<string[]> {
  const owned = await readRegistry(accountId);
  return [accountId, ...owned.filter((t) => !isSoftDeleted(t)).map((t) => t.treeId)];
}

export async function createTree(accountId: string, name: string): Promise<TreeMeta> {
  const meta: TreeMeta = {
    treeId: crypto.randomUUID(),
    name: name.trim() || "Yeni ağaç",
    createdAt: new Date().toISOString(),
  };
  // Çift-yazma: Postgres'te ağaç satırını ÖNCE oluştur (people FK'sı için),
  // sonra boş veriyi yaz. Best-effort — hata mevcut akışı bozmaz.
  try {
    await dbUpsertTree({
      treeId: meta.treeId,
      ownerAccount: accountId,
      name: meta.name,
      isHome: false,
      createdAt: meta.createdAt,
    });
  } catch (e) {
    console.warn(`[cift-yazma] tree upsert (${meta.treeId}):`, (e as Error).message);
  }
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
  // Silinmiş ağaç düzenlenemez: canlı yüzeylerden düşmüş bir ağacı
  // adlandırmak, onu yarı canlı bir hâlde tutmak olurdu.
  if (isSoftDeleted(t)) return false;
  t.name = name.trim() || t.name;
  await writeRegistry(accountId, owned);
  try {
    await dbRenameTree(treeId, t.name);
  } catch (e) {
    console.warn(`[cift-yazma] tree rename (${treeId}):`, (e as Error).message);
  }
  return true;
}

/* ── SİLME: iki aşama ──────────────────────────────────────────────────────
 *
 * Aile ağacı geri getirilemez bir içerik, "yanlış ağacı sildim" ise kolay bir
 * hata. Bu yüzden silme önce YUMUŞAK: kayıt damgalanır, ağaç her yüzeyden
 * düşer, veri durur. `GRACE_DAYS` gün sonra zamanlanmış iş (cron/backup)
 * KALICI silmeyi yapar. Gerekçenin tamamı `lib/retention.ts` başında.
 * ------------------------------------------------------------------------ */

export type TreeDeleteResult =
  | { ok: false; reason: "home" | "not-found" | "already-deleted" }
  | ({ ok: true } & GraceInfo);

/**
 * YUMUŞAK SİLME — ağacı bekleme süresine alır. Ana ağaç (treeId === accountId)
 * SİLİNEMEZ: onu silmek hesabı silmek demektir ve o ayrı bir akış
 * (`lib/account-lifecycle.ts`), çünkü ayrıca şifre teyidi istiyor.
 *
 * Damga İKİ yere yazılır: hesabın ağaç kaydına (sahibin listesi, yetki çözümü)
 * ve ağacın kendi erişim dosyasına (yalnız `treeId` bilen paylaşım/davet/RSVP
 * yüzeyleri sahibin kim olduğunu bilmiyor). İkisi tek yerden yazılıyor ki
 * ayrışmasınlar — yarı gizlenmiş bir ağaç, hiç gizlenmemişten kötüdür:
 * kullanıcı sildiğini sanar, bağlantı hâlâ açılır.
 *
 * Erişim dosyasına damga yazılamazsa işlem BAŞARISIZ sayılır ve kayıt
 * damgalanmaz. Tersi (kayıt damgalı, paylaşım açık) tam da kaçındığımız yarı
 * gizli durum olurdu.
 */
export async function softDeleteTree(
  accountId: string,
  treeId: string
): Promise<TreeDeleteResult> {
  if (treeId === accountId) return { ok: false, reason: "home" };
  const owned = await readRegistry(accountId);
  const t = owned.find((x) => x.treeId === treeId);
  if (!t) return { ok: false, reason: "not-found" };
  if (isSoftDeleted(t)) return { ok: false, reason: "already-deleted" };

  const deletedAt = new Date().toISOString();
  await markTreeDeleted(treeId, deletedAt); // hata yükselir — yarım gizleme yok
  t.deletedAt = deletedAt;
  await writeRegistry(accountId, owned);
  return { ok: true, ...graceInfo(deletedAt) };
}

/**
 * GERİ ALMA — bekleme süresi dolmadan ağacı canlıya döndürür.
 *
 * Bekleme süresinin tek varlık sebebi bu yol; geri getirme olmasaydı süre
 * yalnız gecikmeli bir silme olurdu. Sıra silmenin TERSİ: önce kayıt, sonra
 * erişim dosyası — arada bir hata olursa ağaç gizli kalmaya devam eder
 * (paylaşım bağlantıları kapalı), yani hata GÜVENLİ yöne düşer.
 */
export async function restoreTree(
  accountId: string,
  treeId: string
): Promise<{
  ok: boolean;
  reason?: "not-found" | "not-deleted";
  meta?: TreeMeta;
  failed?: string[];
}> {
  const owned = await readRegistry(accountId);
  const t = owned.find((x) => x.treeId === treeId);
  if (!t) return { ok: false, reason: "not-found" };
  if (!isSoftDeleted(t)) return { ok: false, reason: "not-deleted" };
  delete t.deletedAt;
  await writeRegistry(accountId, owned);
  /*
   * Erişim dosyasındaki damga kaldırılamazsa ağaç GERİ GELİR ama paylaşım
   * bağlantıları kapalı kalır. Hata YÜKSELTİLMİYOR: kayıt zaten yazıldı, 500
   * dönmek kullanıcıya "geri gelmedi" demek olurdu. Eksik yol yanıtta (207)
   * görünüyor ki sessiz kalmasın.
   */
  try {
    await markTreeDeleted(treeId, null);
  } catch (e) {
    console.warn(`[geri-alma] erişim damgası (${treeId}):`, (e as Error).message);
    return { ok: true, meta: t, failed: [`tree-access-${treeId}.json`] };
  }
  return { ok: true, meta: t };
}

/**
 * KALICI SİLME — ağacın envanterdeki BÜTÜN blob'ları ve Postgres satırları.
 *
 * Kullanıcıya açık DEĞİL: yalnız bekleme süresi dolduğunda zamanlanmış iş
 * çağırır (`app/api/cron/backup`), bir de demo sıfırlaması.
 *
 * En iyi çaba ama SESSİZ DEĞİL: silinemeyen yol günlüğe yazılır ve döner.
 * Yarım silinmiş bir ağaç, silinmemişten tehlikelidir — kullanıcı sildiğini
 * sanar. Çağıran taraf listeyi yanıtta (207) taşır.
 *
 * NOT: Cloudinary'deki medya SİLİNMEZ; gerekçesi `lib/tree-storage.ts`te.
 */
export async function purgeTreeStorage(treeId: string): Promise<string[]> {
  const paths = treeBlobPaths(treeId);
  const results = await Promise.allSettled(paths.map((p) => del(p)));
  const failed = failedPaths(paths, results);
  for (const yol of failed) console.warn(`[silme] blob silinemedi: ${yol}`);

  // Postgres: `trees` satırı gider, `people`/`tree_members`/`tree_invites`
  // FK cascade ile onunla birlikte (bkz. supabase/schema.sql).
  try {
    await dbDeleteTree(treeId);
  } catch (e) {
    console.warn(`[silme] postgres tree (${treeId}):`, (e as Error).message);
    failed.push(`postgres:trees/${treeId}`);
  }
  return failed;
}

/** Ağacı kayıttan çıkarır ve kalıcı siler. Silinemeyen yolları döndürür. */
export async function purgeTree(accountId: string, treeId: string): Promise<string[]> {
  if (treeId === accountId) return [`ana-agac:${treeId}`]; // hesap akışının işi
  const owned = await readRegistry(accountId);
  if (owned.some((x) => x.treeId === treeId)) {
    await writeRegistry(
      accountId,
      owned.filter((x) => x.treeId !== treeId)
    );
  }
  return purgeTreeStorage(treeId);
}

/** Hesabın kayıttaki BÜTÜN ağaçları (silinmiş olanlar dahil) — hesap silme için. */
export async function allTreeIds(accountId: string): Promise<string[]> {
  const owned = await readRegistry(accountId);
  return [accountId, ...owned.map((t) => t.treeId)];
}

/** Bekleme süresi dolmuş ağaçlar (hesap başına) — temizlik işi bunu tarar. */
export async function duePurgeTrees(
  accountId: string,
  isDue: (deletedAt: string) => boolean
): Promise<TreeMeta[]> {
  const owned = await readRegistry(accountId);
  return owned.filter((t) => isSoftDeleted(t) && isDue(t.deletedAt!));
}
