import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { applyBulkMerge } from "@/lib/duplicates";

export const dynamic = "force-dynamic";

/**
 * Verilen çiftlerin (olası kopyalar) TÜMÜNÜ tek geçişte, tek kayıtla birleştirir
 * — düzenleyici (editor+) yetkisi. Her çiftte daha eksiksiz kayıt korunur.
 * body: { pairs: [{ aId, bId }] }
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  let body: { pairs?: Array<{ aId?: string; bId?: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const pairs = (body.pairs ?? [])
    .filter((p): p is { aId: string; bId: string } => !!p?.aId && !!p?.bId && p.aId !== p.bId);
  if (pairs.length === 0)
    return NextResponse.json({ error: "Birleştirilecek çift yok." }, { status: 400 });

  const veri = await getFamilyData(ctx.treeId, { skipCache: true });
  /*
   * İYİMSER KİLİT. Toplu/birleştirme işlemleri bu denetimden geçmiyordu: tek
   * kişilik düzenleme korunurken kayıt birleştiren işlem korunmuyordu — ters
   * bir öncelik. Başlık gelmezse `versionMismatch` `false` döner, yani
   * başlığı göndermeyen çağıranlar (mobil, betikler) etkilenmez.
   */
  if (versionMismatch(req, veri.updatedAt))
    return NextResponse.json(
      { error: "Bu ağaç siz bakarken değişti. Sayfayı yenileyip tekrar deneyin." },
      { status: 409 }
    );
  const { people } = veri;
  const { people: mergedPeople, merged } = applyBulkMerge(people, pairs);
  if (merged > 0)
    await saveFamilyData(ctx.treeId, { people: mergedPeople, updatedAt: new Date().toISOString() });

  return NextResponse.json({ ok: true, merged, count: mergedPeople.length });
}
