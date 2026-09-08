import { NextRequest, NextResponse } from "next/server";
import { accessibleTreeIds, hasTreeAccess } from "@/lib/trees";
import { ACTIVE_TREE_COOKIE, resolveFounder } from "@/lib/tree-context";

export const dynamic = "force-dynamic";

/**
 * Aktif ağacı değiştir (founder). Yalnız sahip olunan (ya da ana) ağaca geçilebilir;
 * yetki çerezle taşınır ve her istekte yeniden doğrulanır (bkz. resolveActiveTree).
 */
export async function POST(req: NextRequest) {
  // Ortak kurucu kapısı: silinmekte olan hesap ve şifre sıfırlama çağı
  // denetimleri buradan geliyor; `auth()` ikisini de atlıyordu (ve mobilde
  // her zaman 401 veriyordu). Gerekçe `lib/tree-context.ts`te.
  const ctx = await resolveFounder();
  if (!ctx.ok)
    return NextResponse.json(
      { error: ctx.status === 403 ? "Yalnız ağaç sahibi geçiş yapabilir." : "Yetkisiz" },
      { status: ctx.status }
    );

  const accountId = ctx.accountId;
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
