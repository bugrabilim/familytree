import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { canEdit } from "@/lib/roles";

/**
 * Kardeş sırasını topluca güncelle (Madde: manuel kardeş sıralaması).
 * Gövde: { ids: string[] } — kardeş grubunun İSTENEN sırası. Her id'ye
 * `siblingOrder = dizin` atanır ve TEK yazıda kaydedilir (çoklu PUT + iyimser
 * kilit çakışması olmadan). Editör ve üstü gerektirir.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!canEdit(session.user.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body.ids;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
    return NextResponse.json({ error: "ids dizisi gerekli." }, { status: 400 });
  }

  const userId = session.user.id;
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
