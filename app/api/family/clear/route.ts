import { NextResponse } from "next/server";
import { saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";

/**
 * Ağaçtaki TÜM kişileri siler (boş ağaç kaydeder). Yalnız düzenleyici.
 * Hatalı/karışık içe aktarmadan sonra tek seferde temizlemek için. Geri alınamaz
 * — istemci iki adımlı onay ister. Web (çerez) ve mobil (Bearer) oturumu çalışır.
 */
export async function POST() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  await saveFamilyData(ctx.treeId, { people: [], updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, count: 0 });
}
