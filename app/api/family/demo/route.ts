import { NextResponse } from "next/server";
import { saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { DEMO_PEOPLE } from "@/lib/demo-data";

/**
 * Demo ağacını yükler. Mevcut veriyi değiştirir — arayüz onay alır.
 */
export async function POST() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  await saveFamilyData(ctx.treeId, {
    people: DEMO_PEOPLE,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ count: DEMO_PEOPLE.length });
}
