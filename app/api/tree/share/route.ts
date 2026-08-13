import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { resolveActiveTree } from "@/lib/tree-context";
import { canManage } from "@/lib/roles";
import { listTrees } from "@/lib/trees";
import {
  disableShare,
  enableShare,
  getShareLink,
  updateShareOptions,
} from "@/lib/members";
import type { ShareLink } from "@/types/user";

export const dynamic = "force-dynamic";

/**
 * Herkese açık salt-okunur paylaşım bağlantısı — yalnız ağaç yöneticisi (admin).
 *
 *  GET    → mevcut paylaşımı (varsa bağlantı + QR ile) döndürür.
 *  POST   → açar / seçenekleri günceller / jetonu yeniler.
 *           body: { hideLiving?: boolean, rotate?: boolean }
 *  DELETE → paylaşımı kapatır.
 *
 * Bağlantıyı bilen HERKES ağacı yalnızca görüntüler (üyelik gerekmez); yazma
 * yetkisi vermez. Jeton tahmin-edilemez; yenilenince eski bağlantı ölür.
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

async function payload(origin: string, share: ShareLink | null) {
  if (!share) return { enabled: false as const };
  const url = `${origin}/g/${encodeURIComponent(share.token)}`;
  let qr = "";
  try {
    qr = await QRCode.toDataURL(url, { margin: 1, width: 320 });
  } catch {
    qr = "";
  }
  return {
    enabled: true as const,
    url,
    token: share.token,
    treeName: share.treeName,
    hideLiving: share.hideLiving,
    qr,
  };
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const share = await getShareLink(g.treeId);
  return NextResponse.json(await payload(req.nextUrl.origin, share));
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;

  let body: { hideLiving?: boolean; rotate?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* boş gövde = varsayılanlar */
  }
  const hideLiving = body.hideLiving ?? true;

  const existing = await getShareLink(g.treeId);
  let share: ShareLink | null;
  if (!existing || body.rotate) {
    share = await enableShare(g.treeId, g.treeName, hideLiving);
  } else {
    share = await updateShareOptions(g.treeId, g.treeName, hideLiving);
  }
  return NextResponse.json(await payload(req.nextUrl.origin, share));
}

export async function DELETE() {
  const g = await guard();
  if ("error" in g) return g.error;
  await disableShare(g.treeId);
  return NextResponse.json({ enabled: false });
}
