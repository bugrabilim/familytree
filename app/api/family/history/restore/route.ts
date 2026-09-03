import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { getHistorySnapshot } from "@/lib/history";

export const dynamic = "force-dynamic";

/**
 * Bir güncelleme günlüğü anlık görüntüsüne geri döner — yalnız düzenleyici.
 * Geri yükleme de bir kaydetmedir: geri-yüklemeden ÖNCEki durum otomatik olarak
 * günlüğe eklenir, böylece geri yükleme de geri alınabilir.
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  let body: { id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* boş */
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Anlık görüntü kimliği gerekli." }, { status: 400 });

  const people = await getHistorySnapshot(ctx.treeId, id);
  if (!people) return NextResponse.json({ error: "Bu güncelleme artık bulunamıyor." }, { status: 404 });

  const data = await getFamilyData(ctx.treeId, { skipCache: true });
  /*
   * İYİMSER KİLİT. Başlık gelmezse `versionMismatch` `false` döner, yani
   * başlığı göndermeyen çağıranlar (mobil, betikler) etkilenmez.
   */
  if (versionMismatch(req, data.updatedAt))
    return NextResponse.json(
      { error: "Bu ağaç siz bakarken değişti. Sayfayı yenileyip tekrar deneyin." },
      { status: 409 }
    );

  data.people = people;
  await saveFamilyData(ctx.treeId, data);
  return NextResponse.json({ ok: true, count: people.length });
}
