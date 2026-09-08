import { NextRequest, NextResponse } from "next/server";
import { resolveFounder } from "@/lib/tree-context";
import { restoreTree } from "@/lib/trees";

export const dynamic = "force-dynamic";

/**
 * SİLİNMİŞ AĞACI GERİ GETİR — `POST /api/trees/restore` { treeId }.
 *
 * Bekleme süresinin (`GRACE_DAYS`) tek varlık sebebi bu uç: geri getirme yolu
 * olmasaydı süre yalnız gecikmeli bir silme olurdu, kullanıcı için hiçbir şey
 * değişmezdi.
 *
 * Yalnız founder: ağaç onun, silme kararı da geri alma kararı da onun.
 * Şifre İSTENMİYOR — hesap silmenin tersine, burada YIKICI olan şey yok:
 * en kötü ihtimalle silinmiş bir ağaç geri gelir ve sahibi onu yeniden
 * silebilir. Şifre sormak, geri almayı silmekten zor hâle getirirdi.
 */
export async function POST(req: NextRequest) {
  // Ortak kurucu kapısı — gerekçe `lib/tree-context.ts`te.
  const ctx = await resolveFounder();
  if (!ctx.ok)
    return NextResponse.json(
      { error: ctx.status === 403 ? "Yalnız ağaç sahibi yönetebilir." : "Yetkisiz" },
      { status: ctx.status }
    );

  const body = await req.json().catch(() => ({}));
  const treeId = typeof body.treeId === "string" ? body.treeId : "";
  if (!treeId) return NextResponse.json({ error: "treeId gerekli." }, { status: 400 });

  const r = await restoreTree(ctx.accountId, treeId);
  if (!r.ok) {
    return NextResponse.json(
      {
        error:
          r.reason === "not-deleted"
            ? "Bu ağaç silinmemiş."
            : "Ağaç bulunamadı (bekleme süresi dolmuş olabilir).",
      },
      { status: 400 }
    );
  }
  const govde = { success: true, tree: r.meta };
  // 207: ağaç listeye döndü ama erişim damgası kaldırılamadı → paylaşım
  // bağlantıları kapalı kalmış olabilir. Sessiz 200 yanlış güven verirdi.
  if (r.failed?.length) return NextResponse.json({ ...govde, failed: r.failed }, { status: 207 });
  return NextResponse.json(govde);
}
