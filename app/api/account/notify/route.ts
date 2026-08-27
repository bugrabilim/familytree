import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { getUsersData, updateUserNotify } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * Kurucu hesabın bildirim e-posta tercihi (#3). Giriş surname+şifre olduğundan
 * e-posta yalnız burada, açık onayla saklanır. Yalnız founder hesap.
 *  GET  → { notifyEmail, notifyReminders }
 *  POST → body { notifyEmail?, notifyReminders? }
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!ctx.isFounder)
    return NextResponse.json({ error: "Yalnız hesap sahibi." }, { status: 403 });
  const { users } = await getUsersData();
  const u = users.find((x) => x.id === ctx.accountId);
  return NextResponse.json({
    notifyEmail: u?.notifyEmail ?? "",
    notifyReminders: !!u?.notifyReminders,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!ctx.isFounder)
    return NextResponse.json({ error: "Yalnız hesap sahibi." }, { status: 403 });

  let body: { notifyEmail?: string; notifyReminders?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const email = typeof body.notifyEmail === "string" ? body.notifyEmail.trim() : undefined;
  if (email && !EMAIL_RE.test(email))
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });

  const ok = await updateUserNotify(ctx.accountId, {
    notifyEmail: email,
    notifyReminders: typeof body.notifyReminders === "boolean" ? body.notifyReminders : undefined,
  });
  if (!ok) return NextResponse.json({ error: "Hesap bulunamadı." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
