import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { resolveActiveTree } from "@/lib/tree-context";
import { canManage } from "@/lib/roles";
import { listTrees } from "@/lib/trees";
import {
  createShare,
  deleteShare,
  listShares,
  updateShare,
} from "@/lib/members";
import type { ShareLink } from "@/types/user";

export const dynamic = "force-dynamic";

/**
 * Herkese açık salt-okunur paylaşım — yalnız ağaç yöneticisi (admin).
 * Çoklu, kalıcı bağlantılar + ziyaret istatistikleri + isteğe bağlı süre.
 *
 *  GET    → tüm bağlantılar (bağlantı + QR + istatistik ile).
 *  POST   → yeni bağlantı. body: { hideLiving?, label?, expiresDays? }
 *  PATCH  → bağlantıyı güncelle. body: { id, hideLiving?, label?, expiresDays? }
 *  DELETE → bağlantıyı sil. body: { id }
 */

async function guard() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  if (!canManage(ctx.role))
    return { error: NextResponse.json({ error: "Yalnız ağaç yöneticisi paylaşabilir." }, { status: 403 }) };

  const session = await auth();
  const homeName = session?.user?.treeName ?? session?.user?.name ?? "Ağaç";
  let treeName = homeName;
  if (ctx.treeId !== ctx.accountId) {
    const trees = await listTrees(ctx.accountId, homeName);
    treeName = trees.find((tr) => tr.treeId === ctx.treeId)?.name ?? homeName;
  }
  return { treeId: ctx.treeId, treeName };
}

async function decorate(origin: string, share: ShareLink) {
  const url = `${origin}/g/${encodeURIComponent(share.token)}`;
  let qr = "";
  try {
    qr = await QRCode.toDataURL(url, { margin: 1, width: 320 });
  } catch {
    qr = "";
  }
  const expired = !!share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now();
  return {
    id: share.id,
    url,
    token: share.token,
    label: share.label ?? "",
    hideLiving: share.hideLiving,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt ?? null,
    expired,
    views: share.views ?? 0,
    visits: (share.visits ?? []).slice(0, 20),
    qr,
  };
}

async function listPayload(origin: string, treeId: string) {
  const shares = await listShares(treeId);
  return { shares: await Promise.all(shares.map((s) => decorate(origin, s))) };
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  return NextResponse.json(await listPayload(req.nextUrl.origin, g.treeId));
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  let body: { hideLiving?: boolean; label?: string; expiresDays?: number } = {};
  try { body = await req.json(); } catch { /* varsayılanlar */ }
  await createShare(g.treeId, g.treeName, {
    hideLiving: body.hideLiving ?? true,
    label: body.label,
    expiresDays: body.expiresDays,
  });
  return NextResponse.json(await listPayload(req.nextUrl.origin, g.treeId));
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  let body: { id?: string; hideLiving?: boolean; label?: string; expiresDays?: number } = {};
  try { body = await req.json(); } catch { /* boş */ }
  if (!body.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  await updateShare(g.treeId, body.id, {
    hideLiving: body.hideLiving,
    label: body.label,
    expiresDays: body.expiresDays,
  });
  return NextResponse.json(await listPayload(req.nextUrl.origin, g.treeId));
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  let body: { id?: string } = {};
  try { body = await req.json(); } catch { /* boş */ }
  if (!body.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  await deleteShare(g.treeId, body.id);
  return NextResponse.json(await listPayload(req.nextUrl.origin, g.treeId));
}
