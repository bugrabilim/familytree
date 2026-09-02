import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { mergePeople } from "@/lib/duplicates";

export const dynamic = "force-dynamic";

/**
 * İki kişiyi (olası kopya) tek kişide birleştir — düzenleyici (editor+) yetkisi.
 * body: { keepId, dropId }. Kayıpsız: dropId'nin bağları/verisi keepId'ye taşınır.
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  let body: { keepId?: string; dropId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const { keepId, dropId } = body;
  if (!keepId || !dropId || keepId === dropId)
    return NextResponse.json({ error: "keepId ve dropId (farklı) gerekli." }, { status: 400 });

  const { people } = await getFamilyData(ctx.treeId, { skipCache: true });
  if (!people.some((p) => p.id === keepId) || !people.some((p) => p.id === dropId))
    return NextResponse.json({ error: "Kişi bulunamadı." }, { status: 404 });

  const merged = mergePeople(people, keepId, dropId);
  await saveFamilyData(ctx.treeId, { people: merged, updatedAt: new Date().toISOString() }, { by: ctx.accountId });

  return NextResponse.json({ ok: true, count: merged.length });
}
