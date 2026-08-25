import { NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { listHistorySnapshots } from "@/lib/history";

export const dynamic = "force-dynamic";

/**
 * Güncelleme günlüğü — yalnız düzenleyici. Geri alınabilecek önceki durumların
 * (tarih + kişi sayısı) listesi, en yeni önce.
 */
export async function GET() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const entries = await listHistorySnapshots(ctx.treeId);
  return NextResponse.json({ entries });
}
