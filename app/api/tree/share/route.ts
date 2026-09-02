import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/auth";
import { resolveActiveTree } from "@/lib/tree-context";
import { getFamilyData } from "@/lib/blob";
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
// QR üretimi + Blob yazımı için rahat üst sınır; ayna zaten süre sınırlı (#3).
export const maxDuration = 30;

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

/**
 * Tek kişilik paylaşımın kişisi GERÇEKTEN bu ağaçta mı?
 *
 * Doğrulanmazsa başka bir ağacın kişi kimliği kaydedilebilir; bağlantı ya
 * boş açılır ya da — asıl tehlike — ileride kimlikler çakışırsa yanlış kişiyi
 * gösterir. Kimlik ağaç içinde çözüldüğü için kontrol burada yapılır.
 */
const INVALID = Symbol("gecersiz-kisi");

async function resolvePersonId(
  treeId: string,
  raw?: string
): Promise<string | undefined | typeof INVALID> {
  const id = raw?.trim();
  if (!id) return undefined;
  const { people } = await getFamilyData(treeId);
  return people.some((p) => p.id === id) ? id : INVALID;
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
    personId: share.personId ?? null,
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
  return payloadFrom(origin, shares);
}

/**
 * Yanıtı ELDEKİ listeden üretir — yazma sonrası tekrar OKUMADAN.
 * Blob `list()` eventually-consistent olduğundan, yeni yazılan kayıt hemen
 * görünmeyebiliyor ve yanıt boş dönüyordu: kullanıcı "bağlantı oluşturuldu"
 * yerine "henüz paylaşım bağlantın yok" görüyordu (#3).
 */
async function payloadFrom(origin: string, shares: ShareLink[]) {
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
  let body: { hideLiving?: boolean; label?: string; expiresDays?: number; personId?: string } = {};
  try { body = await req.json(); } catch { /* varsayılanlar */ }
  const personId = await resolvePersonId(g.treeId, body.personId);
  if (personId === INVALID)
    return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 400 });
  try {
    const { shares } = await createShare(g.treeId, g.treeName, {
      hideLiving: body.hideLiving ?? true,
      label: body.label,
      expiresDays: body.expiresDays,
      personId,
    });
    return NextResponse.json(await payloadFrom(req.nextUrl.origin, shares));
  } catch (e) {
    // Sessizce 500'e düşmek yerine nedeni JSON olarak bildir; istemci
    // "işleniyor" durumunda asılı kalmasın (#3).
    console.error("[paylasim] olusturulamadi:", (e as Error).message);
    return NextResponse.json(
      { error: `Bağlantı oluşturulamadı: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  let body: {
    id?: string; hideLiving?: boolean; label?: string; expiresDays?: number;
    personId?: string | null;
  } = {};
  try { body = await req.json(); } catch { /* boş */ }
  if (!body.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  // `null` bilerek gönderilir (daraltmayı kaldır) — doğrulamadan geçmemeli.
  const personId =
    body.personId === null ? null : await resolvePersonId(g.treeId, body.personId);
  if (personId === INVALID)
    return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 400 });
  try {
    const shares = await updateShare(g.treeId, body.id, {
      hideLiving: body.hideLiving,
      label: body.label,
      expiresDays: body.expiresDays,
      personId: personId ?? undefined,
    });
    if (!shares) return NextResponse.json({ error: "Bağlantı bulunamadı" }, { status: 404 });
    return NextResponse.json(await payloadFrom(req.nextUrl.origin, shares));
  } catch (e) {
    console.error("[paylasim] guncellenemedi:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  let body: { id?: string } = {};
  try { body = await req.json(); } catch { /* boş */ }
  if (!body.id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  try {
    const shares = await deleteShare(g.treeId, body.id);
    return NextResponse.json(await payloadFrom(req.nextUrl.origin, shares));
  } catch (e) {
    console.error("[paylasim] silinemedi:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
