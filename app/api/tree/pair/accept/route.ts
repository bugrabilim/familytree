import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveActiveTree } from "@/lib/tree-context";
import { canDo } from "@/lib/guest";
import { canManage } from "@/lib/roles";
import { listTrees } from "@/lib/trees";
import { acceptPairInvite } from "@/lib/members";

export const dynamic = "force-dynamic";

/**
 * Eşleştirme davetini kabul et — kabul eden GİRİŞ YAPMIŞ ve kendi ağacının
 * yöneticisi olmalı. Karşılıklı bağ kurulur.
 * body: { token }
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Kabul için giriş yapmalısınız." }, { status: 401 });
  if (!canManage(ctx.role))
    return NextResponse.json({ error: "Yalnız ağaç yöneticisi eşleştirmeyi kabul edebilir." }, { status: 403 });
  /*
   * MİSAFİR KAPISI. Kardeş uçlarda (`/tree/pair`, `graft`, `merge-tree`)
   * vardı, burada UNUTULMUŞTU — oysa asıl tehlikeli olan bu: davet kabulü
   * KARŞI hesabın erişim kaydına yazıyor ve ardından o ağacın verisini
   * okumayı açıyor. Sahipsiz, atılabilir bir hesabın başka bir ailenin
   * verisini tutması.
   */
  if (!canDo(ctx.isGuest, "pair"))
    return NextResponse.json({ error: "Misafir hesapta ağaç eşleştirme kapalı. Ağacınızı sahiplenin." }, { status: 403 });

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  if (!body.token) return NextResponse.json({ error: "Jeton gerekli." }, { status: 400 });

  const session = await auth();
  const homeName = session?.user?.treeName ?? session?.user?.name ?? "Ağaç";
  let myName = homeName;
  if (ctx.treeId !== ctx.accountId) {
    const trees = await listTrees(ctx.accountId, homeName);
    myName = trees.find((tr) => tr.treeId === ctx.treeId)?.name ?? homeName;
  }

  const res = await acceptPairInvite(body.token, ctx.treeId, myName);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, peerName: res.inviterName, peerTreeId: res.inviterTreeId });
}
