import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createTree, deleteTree, listTrees, renameTree } from "@/lib/trees";
import { resolveActiveTree } from "@/lib/tree-context";
import { canDo } from "@/lib/guest";

export const dynamic = "force-dynamic";

/** Yalnız founder (ağaç kuran) çoklu ağaç yönetebilir. */
async function founderCtx() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  if (!(session.user.isFounder ?? true))
    return { error: NextResponse.json({ error: "Yalnız ağaç sahibi yönetebilir." }, { status: 403 }) };
  return { accountId: session.user.id, treeName: session.user.treeName ?? session.user.name ?? "Ağaç" };
}

/** Founder'ın ağaçları + aktif ağaç kimliği. */
export async function GET() {
  const c = await founderCtx();
  if ("error" in c) return c.error;
  const [trees, active] = await Promise.all([listTrees(c.accountId, c.treeName), resolveActiveTree()]);
  return NextResponse.json({
    trees,
    activeTreeId: active.ok ? active.treeId : c.accountId,
  });
}

/** Yeni ağaç oluştur. */
export async function POST(req: NextRequest) {
  const c = await founderCtx();
  if ("error" in c) return c.error;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2) return NextResponse.json({ error: "Ağaç adı en az 2 karakter olmalı." }, { status: 400 });
  /*
   * MİSAFİR KAPISI. Misafir `isFounder: true` taşıdığı için yukarıdaki
   * denetimden geçiyordu; her çağrı yeni bir blob + Postgres satırı demek,
   * yani `lib/guest.ts`teki çarpan sorununun aynısı.
   */
  const ctx = await resolveActiveTree();
  if (ctx.ok && !canDo(ctx.isGuest, "tree"))
    return NextResponse.json({ error: "Misafir hesapta ek ağaç açılamaz. Ağacınızı sahiplenin." }, { status: 403 });
  const meta = await createTree(c.accountId, name);
  return NextResponse.json(meta, { status: 201 });
}

/** Ağaç adını değiştir. */
export async function PATCH(req: NextRequest) {
  const c = await founderCtx();
  if ("error" in c) return c.error;
  const body = await req.json().catch(() => ({}));
  const treeId = typeof body.treeId === "string" ? body.treeId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!treeId || name.length < 2) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  const ok = await renameTree(c.accountId, treeId, name);
  if (!ok) return NextResponse.json({ error: "Ağaç bulunamadı." }, { status: 404 });
  return NextResponse.json({ success: true });
}

/** Ağaç sil (ana ağaç silinemez). */
export async function DELETE(req: NextRequest) {
  const c = await founderCtx();
  if ("error" in c) return c.error;
  const body = await req.json().catch(() => ({}));
  const treeId = typeof body.treeId === "string" ? body.treeId : "";
  const ok = await deleteTree(c.accountId, treeId);
  if (!ok) return NextResponse.json({ error: "Silinemedi (ana ağaç ya da bulunamadı)." }, { status: 400 });
  return NextResponse.json({ success: true });
}
