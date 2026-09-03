import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { acceptInvite, findValidInvite } from "@/lib/members";
import { getUsersData } from "@/lib/users";

/**
 * Davetle katılma (herkese açık — oturum gerektirmez, jeton yetkiyi taşır).
 *
 * GET  ?token=… → davet geçerli mi + ağaç adı + rol (katılım sayfası için).
 * POST { token, displayName, password } → üye oluşturur, ağaç adını döner
 *       (istemci ardından ağaç adı + şifre ile giriş yapar).
 */
async function treeNameOf(treeId: string): Promise<string | null> {
  const { users } = await getUsersData();
  return users.find((u) => u.id === treeId)?.familyName ?? null;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const valid = await findValidInvite(token);
  if (!valid) return NextResponse.json({ valid: false }, { status: 404 });
  const treeName = await treeNameOf(valid.treeId);
  if (!treeName) return NextResponse.json({ valid: false }, { status: 404 });
  return NextResponse.json({ valid: true, treeName, role: valid.invite.role });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (displayName.length < 2)
    return NextResponse.json({ error: "Adınız en az 2 karakter olmalı." }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });

  const valid = await findValidInvite(token);
  if (!valid) return NextResponse.json({ error: "Davet geçersiz ya da süresi dolmuş." }, { status: 400 });

  const treeName = await treeNameOf(valid.treeId);
  if (!treeName) return NextResponse.json({ error: "Ağaç bulunamadı." }, { status: 404 });

  const passwordHash = await hash(password, 12);
  const result = await acceptInvite(token, displayName, passwordHash, password);
  if (!result) return NextResponse.json({ error: "Davet geçersiz ya da süresi dolmuş." }, { status: 400 });
  /*
   * Aynı ağaçta aynı şifre olamaz. Giriş formu üye seçtirmediği için kimlik
   * şifreye göre çözülüyor; iki üyenin aynı şifresi olsaydı biri ötekinin
   * kimliğiyle (ve ROLÜYLE) oturum açardı.
   */
  if ("error" in result)
    return NextResponse.json(
      { error: "Bu şifre bu ağaçta kullanılıyor. Başka bir şifre seçin." },
      { status: 409 }
    );

  return NextResponse.json({ treeName, role: result.member.role });
}
