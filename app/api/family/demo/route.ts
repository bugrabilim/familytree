import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { DEMO_PEOPLE } from "@/lib/demo-data";

/**
 * Demo ağacını yükler. Mevcut veriyi DEĞİŞTİRİR — arayüz onay alır.
 *
 * Bu, depodaki en yıkıcı yazma: ağacın tamamını sabit bir listeyle eziyor.
 * Buna rağmen iyimser kilit denetiminden geçmiyordu — tek kişilik bir
 * düzenleme korunurken ağacın tamamını silen işlem korunmuyordu, ters bir
 * öncelik (aynı ters öncelik `bulk-delete` ve `merge-all`da da vardı ve
 * orada da düzeltildi).
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  /*
   * Sürümü öğrenmek için okuyoruz. Başlık gelmezse `versionMismatch` `false`
   * döner, yani başlığı göndermeyen çağıranlar (mobil, betikler) etkilenmez.
   */
  const mevcut = await getFamilyData(ctx.treeId, { skipCache: true });
  if (versionMismatch(req, mevcut.updatedAt, ctx.treeId))
    return NextResponse.json(
      { error: "Bu ağaç siz bakarken değişti. Sayfayı yenileyip tekrar deneyin." },
      { status: 409 }
    );

  await saveFamilyData(
    ctx.treeId,
    { people: DEMO_PEOPLE, updatedAt: new Date().toISOString() },
    { by: ctx.authorId }
  );

  return NextResponse.json({ count: DEMO_PEOPLE.length });
}
