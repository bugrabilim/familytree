import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { resolveActiveTree } from "@/lib/tree-context";
import { canManage } from "@/lib/roles";
import { listTrees } from "@/lib/trees";
import { createPairInvite, listPairings, removePairing } from "@/lib/members";

export const dynamic = "force-dynamic";

/**
 * Hesaplar arası ağaç eşleştirmesi — yalnız ağaç yöneticisi (admin).
 *
 *  GET    → bağlı ağaçların listesi.
 *  POST   → eşleştirme daveti üretir (bağlantı + QR). Karşı taraf /pair/<token>
 *           ile GİRİŞ YAPARAK kabul eder → karşılıklı bağ kurulur.
 *  DELETE → body { peerTreeId } bağlantıyı iki taraftan da kaldırır.
 */

async function activeTreeName(accountId: string, treeId: string): Promise<string> {
  const session = await auth();
  const homeName = session?.user?.treeName ?? session?.user?.name ?? "Ağaç";
  if (treeId === accountId) return homeName;
  const trees = await listTrees(accountId, homeName);
  return trees.find((tr) => tr.treeId === treeId)?.name ?? homeName;
}

async function guard() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status }) };
  if (!canManage(ctx.role))
    return { error: NextResponse.json({ error: "Yalnız ağaç yöneticisi eşleştirebilir." }, { status: 403 }) };
  return { ctx };
}

export async function GET() {
  const g = await guard();
  if ("error" in g) return g.error;
  const pairings = await listPairings(g.ctx.treeId);
  return NextResponse.json({ pairings });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const name = await activeTreeName(g.ctx.accountId, g.ctx.treeId);
  const token = await createPairInvite(g.ctx.treeId, name);
  const url = `${req.nextUrl.origin}/pair/${encodeURIComponent(token)}`;
  let qr = "";
  try {
    qr = await QRCode.toDataURL(url, { margin: 1, width: 320 });
  } catch {
    qr = "";
  }
  return NextResponse.json({ url, token, qr });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  let body: { peerTreeId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* boş */
  }
  if (!body.peerTreeId) return NextResponse.json({ error: "peerTreeId gerekli." }, { status: 400 });
  await removePairing(g.ctx.treeId, body.peerTreeId);
  return NextResponse.json({ ok: true });
}
