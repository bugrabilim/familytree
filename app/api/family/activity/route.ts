import { NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { getFamilyData } from "@/lib/blob";
import { readSnapshotsForActivity } from "@/lib/history";
import { getTreeAccess } from "@/lib/members";
import { buildActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

/** Kaç anlık görüntü geriye bakılacağı — akış tarihçe değil, "son olanlar". */
const WINDOW = 20;
const LIMIT = 40;

/**
 * Katkı akışı — "ailede son ne oldu".
 *
 * Ağacı canlı tutan şey rozet değil, başkasının kattığını görmek. Akış
 * `lib/history.ts`teki anlık görüntülerin ardışık farkından üretilir; ayrı
 * bir olay günlüğü tutulmuyor.
 *
 * Yazar kimliği hesap kimliğidir; burada okunabilir ada çevrilir. Ad
 * bulunamazsa (kurucu ya da silinmiş üye) boş bırakılır — uydurma bir ad
 * yazmaktansa "biri" demek doğru.
 */
export async function GET() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });

  const [{ people }, snapshots] = await Promise.all([
    getFamilyData(ctx.treeId),
    readSnapshotsForActivity(ctx.treeId, WINDOW),
  ]);

  const items = buildActivity(snapshots, people, LIMIT);

  // Hesap kimliği → görünen ad. Kurucunun kimliği ağacın kimliğidir ve üye
  // listesinde tutulmaz (bkz. `lib/members.ts`), o yüzden ayrıca eklenir.
  const names: Record<string, string> = {};
  try {
    const access = await getTreeAccess(ctx.treeId);
    for (const m of access.members) names[m.id] = m.displayName;
  } catch {
    /* ad çözülemezse akış yine döner */
  }

  return NextResponse.json({ items, names });
}
