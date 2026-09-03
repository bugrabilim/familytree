import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";

/**
 * Ağaçtaki TÜM kişileri siler (boş ağaç kaydeder). Yalnız düzenleyici.
 * Hatalı/karışık içe aktarmadan sonra tek seferde temizlemek için. Geri alınamaz
 * — istemci iki adımlı onay ister. Web (çerez) ve mobil (Bearer) oturumu çalışır.
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  /*
   * İYİMSER KİLİT. "Hepsini sil" niyeti açık ve iki adımlı onaydan geçiyor,
   * ama kullanıcının EKRANDA GÖRDÜĞÜ ağaç ile sildiği ağaç aynı olmayabilir:
   * o onayı verirken başka bir üye kişi eklemiş olabilir. Geri alınamaz bir
   * işlemde "yenile ve tekrar bak" demek doğru olan. Başlık gelmezse denetim
   * atlanır (mobil ve betikler etkilenmez).
   */
  const mevcut = await getFamilyData(ctx.treeId, { skipCache: true });
  if (versionMismatch(req, mevcut.updatedAt))
    return NextResponse.json(
      { error: "Bu ağaç siz bakarken değişti. Sayfayı yenileyip tekrar deneyin." },
      { status: 409 }
    );

  await saveFamilyData(ctx.treeId, { people: [], updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, count: 0 });
}
