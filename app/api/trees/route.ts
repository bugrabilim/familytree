import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createTree, listDeletedTrees, listTrees, renameTree, softDeleteTree } from "@/lib/trees";
import { resolveActiveTree } from "@/lib/tree-context";
import { GRACE_DAYS } from "@/lib/retention";

export const dynamic = "force-dynamic";

/** Yalnız founder (ağaç kuran) çoklu ağaç yönetebilir. */
async function founderCtx() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Yetkisiz" }, { status: 401 }) };
  if (!(session.user.isFounder ?? true))
    return { error: NextResponse.json({ error: "Yalnız ağaç sahibi yönetebilir." }, { status: 403 }) };
  return { accountId: session.user.id, treeName: session.user.treeName ?? session.user.name ?? "Ağaç" };
}

/**
 * Founder'ın ağaçları + aktif ağaç kimliği.
 *
 * `deleted`: bekleme süresindeki ağaçlar (kalan günüyle). Ayrı bir alan,
 * çünkü `trees` listesi canlı ağaçlar demek ve arayüzün bir yerinde
 * kazayla karışmaları, silinmiş ağacı yeniden açık göstermek olurdu.
 */
export async function GET() {
  const c = await founderCtx();
  if ("error" in c) return c.error;
  const [trees, deleted, active] = await Promise.all([
    listTrees(c.accountId, c.treeName),
    listDeletedTrees(c.accountId),
    resolveActiveTree(),
  ]);
  return NextResponse.json({
    trees,
    deleted,
    graceDays: GRACE_DAYS,
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

/**
 * Ağaç sil — YUMUŞAK (ana ağaç silinemez).
 *
 * Veri hemen yok edilmiyor: ağaç `GRACE_DAYS` gün bekleme süresine alınır,
 * her yüzeyden düşer ve `POST /api/trees/restore` ile geri getirilebilir.
 * Süre dolunca zamanlanmış iş kalıcı olarak siler. Gerekçe
 * `lib/retention.ts`te: aile ağacı geri getirilemez, yanlış ağacı silmek ise
 * kolay.
 *
 * Ana ağaç burada silinemez; onu silmek hesabı silmek demek ve o akış şifre
 * teyidi istiyor (`POST /api/account/delete`).
 */
export async function DELETE(req: NextRequest) {
  const c = await founderCtx();
  if ("error" in c) return c.error;
  const body = await req.json().catch(() => ({}));
  const treeId = typeof body.treeId === "string" ? body.treeId : "";
  /*
   * Damga yazılamazsa (Blob hatası) ağaç SİLİNMİŞ SAYILMAZ: `softDeleteTree`
   * erişim dosyasını yazamadığında hata yükseltiyor, çünkü yarı gizlenmiş bir
   * ağaç — listeden düşmüş ama bağlantısı açık — en kötü durum. Kullanıcı
   * açık bir hata görüp tekrar denemeli.
   */
  let r: Awaited<ReturnType<typeof softDeleteTree>>;
  try {
    r = await softDeleteTree(c.accountId, treeId);
  } catch (e) {
    console.error(`[silme] ağaç silinemedi (${treeId}):`, (e as Error).message);
    return NextResponse.json(
      { error: "Ağaç şu an silinemedi. Lütfen tekrar deneyin." },
      { status: 500 }
    );
  }
  if (!r.ok) {
    const mesaj =
      r.reason === "home"
        ? "Ana ağaç silinemez. Hesabı silmek için hesap ayarlarını kullanın."
        : r.reason === "already-deleted"
          ? "Bu ağaç zaten silinmiş."
          : "Ağaç bulunamadı.";
    return NextResponse.json({ error: mesaj }, { status: 400 });
  }
  return NextResponse.json({
    success: true,
    deletedAt: r.deletedAt,
    purgeAt: r.purgeAt,
    daysLeft: r.daysLeft,
  });
}
