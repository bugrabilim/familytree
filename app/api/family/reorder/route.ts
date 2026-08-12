import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";

/**
 * Kardeş sırasını topluca güncelle (Madde: manuel kardeş sıralaması).
 * Gövde: { ids: string[] } — kardeş grubunun İSTENEN sırası. Her id'ye
 * `siblingOrder = dizin` atanır ve TEK yazıda kaydedilir (çoklu PUT + iyimser
 * kilit çakışması olmadan). Editör ve üstü gerektirir.
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body.ids;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
    return NextResponse.json({ error: "ids dizisi gerekli." }, { status: 400 });
  }

  const userId = ctx.treeId;
  const data = await getFamilyData(userId, { skipCache: true });
  const order = new Map<string, number>((ids as string[]).map((id, i) => [id, i]));

  let changed = false;
  for (const p of data.people) {
    const o = order.get(p.id);
    if (o !== undefined && p.siblingOrder !== o) {
      p.siblingOrder = o;
      changed = true;
    }
  }

  if (changed) await saveFamilyData(userId, data);
  return NextResponse.json({ success: true });
}
