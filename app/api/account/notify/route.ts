import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { listUsers, updateUserNotify } from "@/lib/users";
import { DEMO_USER_ID } from "@/lib/demo-account";

export const dynamic = "force-dynamic";

/**
 * Kurucu hesabın bildirim e-posta tercihi (#3). Giriş surname+şifre olduğundan
 * e-posta yalnız burada, açık onayla saklanır. Yalnız founder hesap.
 *  GET  → { notifyEmail, notifyReminders, notifyMemorials, notifyNewsletter }
 *  POST → body { notifyEmail?, notifyReminders?, notifyMemorials?, notifyNewsletter? }
 *
 * Onaylar AYRI: doğum günü hatırlatması, vefat anması ve aylık bülten farklı
 * şeyler. Biri kutlama, öbürü yas, üçüncüsü özet — tek onaya bağlamak,
 * istemediği türde posta almak demekti.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!ctx.isFounder)
    return NextResponse.json({ error: "Yalnız hesap sahibi." }, { status: 403 });
  const users = await listUsers();
  const u = users.find((x) => x.id === ctx.accountId);
  return NextResponse.json({
    notifyEmail: u?.notifyEmail ?? "",
    notifyReminders: !!u?.notifyReminders,
    notifyMemorials: !!u?.notifyMemorials,
    notifyNewsletter: !!u?.notifyNewsletter,
  });
}

export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!ctx.isFounder)
    return NextResponse.json({ error: "Yalnız hesap sahibi." }, { status: 403 });

  let body: {
    notifyEmail?: string;
    notifyReminders?: boolean;
    notifyMemorials?: boolean;
    notifyNewsletter?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const email = typeof body.notifyEmail === "string" ? body.notifyEmail.trim() : undefined;
  if (email && !EMAIL_RE.test(email))
    return NextResponse.json({ error: "Geçerli bir e-posta girin." }, { status: 400 });

  /*
   * DEMOYA BİLDİRİM AYARI YAZILMAZ.
   *
   * Demo herkese açık ORTAK bir vitrin (`lib/demo-account.ts`): burada
   * saklanan bir adres ziyaretçinin değil, PAYLAŞILAN kaydın alanı olurdu —
   * bir sonraki ziyaretçi onu ayarlar ekranında görür, günlük cron da her
   * sabah o adrese yabancı bir ağacın doğum günlerini yollardı.
   *
   * Kapı KİMLİĞE bakıyor: demonun kimlik satırı zaten yok, dolayısıyla
   * aşağıdaki yazma "Hesap bulunamadı" (404) ile düşerdi — doğru sonuç,
   * yanlış gerekçe. Bu bir arıza değil, bir karar.
   */
  if (ctx.accountId === DEMO_USER_ID)
    return NextResponse.json(
      { error: "Demo hesabında bildirim ayarı saklanmaz." },
      { status: 403 }
    );

  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const ok = await updateUserNotify(ctx.accountId, {
    notifyEmail: email,
    notifyReminders: bool(body.notifyReminders),
    notifyMemorials: bool(body.notifyMemorials),
    notifyNewsletter: bool(body.notifyNewsletter),
  });
  if (!ok) return NextResponse.json({ error: "Hesap bulunamadı." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
