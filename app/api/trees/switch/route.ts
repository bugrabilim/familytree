import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { accessibleTreeIds, hasTreeAccess } from "@/lib/trees";
import { ACTIVE_TREE_COOKIE } from "@/lib/tree-context";

export const dynamic = "force-dynamic";

/**
 * Aktif ağacı değiştir (founder). Yalnız sahip olunan (ya da ana) ağaca geçilebilir;
 * yetki çerezle taşınır ve her istekte yeniden doğrulanır (bkz. resolveActiveTree).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!(session.user.isFounder ?? true))
    return NextResponse.json({ error: "Yalnız ağaç sahibi geçiş yapabilir." }, { status: 403 });

  const accountId = session.user.id;
  const body = await req.json().catch(() => ({}));
  const treeId = typeof body.treeId === "string" ? body.treeId : "";
  if (!treeId) return NextResponse.json({ error: "treeId gerekli." }, { status: 400 });

  const owned = await accessibleTreeIds(accountId);
  if (!hasTreeAccess(accountId, treeId, owned)) {
    return NextResponse.json({ error: "Bu ağaca erişiminiz yok." }, { status: 403 });
  }

  const res = NextResponse.json({ success: true, treeId });
  if (treeId === accountId) {
    res.cookies.delete(ACTIVE_TREE_COOKIE); // ana ağaç → çerezi temizle
  } else {
    res.cookies.set(ACTIVE_TREE_COOKIE, treeId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}
