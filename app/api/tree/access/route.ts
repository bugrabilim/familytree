import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { canManage } from "@/lib/roles";
import { resolveActiveTree } from "@/lib/tree-context";
import { createInvite, getTreeAccess, removeMember, revokeInvite } from "@/lib/members";
import type { TreeRole } from "@/types/user";

/*
 * DAVET ROLÜ TEK: `uye`.
 *
 * Yönetici, ağacı KURAN hesap — davetle verilen bir kademe değil. Liste
 * burada dursun ki gövdeden gelen değer yine doğrulansın; ama tek elemanlı
 * olması bilinçli: buraya `yonetici` eklemek, bir bağlantıyla ağacın
 * kontrolünü devretmek demek olurdu ve bu bir KARAR olmalı, bir satır
 * değişikliği değil.
 */
const ROLES: TreeRole[] = ["uye"];
/** Yalnızca yönetici (admin) — AKTİF ağacın üye/davetlerini yönetebilir. */
async function requireAdmin() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  if (!canManage(ctx.role))
    return { error: NextResponse.json({ error: "Bu işlem için yönetici olmalısınız." }, { status: 403 }) };
  const session = await auth();
  return { treeId: ctx.treeId, actorName: session?.user?.name ?? "" };
}

/** Üyeleri ve bekleyen davetleri listeler (şifre hash'i sızdırılmaz). */
export async function GET() {
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const access = await getTreeAccess(g.treeId);
  return NextResponse.json({
    members: access.members.map((m) => ({
      id: m.id,
      displayName: m.displayName,
      /*
       * Kullanıcı adı YÖNETİCİYE gösteriliyor: üye "giremiyorum" dediğinde
       * yöneticinin bakabileceği tek yer burası. Şifre özeti hâlâ dışarı
       * çıkmıyor — ad bir kimlik, sır değil.
       */
      username: m.username ?? "",
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    invites: access.invites
      .filter((iv) => !iv.usedAt && new Date(iv.expiresAt).getTime() > Date.now())
      .map((iv) => ({ tokenHash: iv.tokenHash, role: iv.role, expiresAt: iv.expiresAt })),
  });
}

/** Yeni davet oluşturur → ham jeton döner (bağlantı istemcide kurulur). */
export async function POST(req: NextRequest) {
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  const role = body.role as TreeRole;
  if (!ROLES.includes(role))
    return NextResponse.json({ error: "Geçersiz rol." }, { status: 400 });
  const { token } = await createInvite(g.treeId, role, g.actorName);
  return NextResponse.json({ token }, { status: 201 });
}

/** Üye çıkar (memberId) ya da bekleyen daveti iptal et (tokenHash). */
export async function DELETE(req: NextRequest) {
  const g = await requireAdmin();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.memberId === "string") {
    await removeMember(g.treeId, body.memberId);
    return NextResponse.json({ success: true });
  }
  if (typeof body.tokenHash === "string") {
    await revokeInvite(g.treeId, body.tokenHash);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: "memberId ya da tokenHash gerekli." }, { status: 400 });
}
