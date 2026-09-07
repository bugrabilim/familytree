import { NextRequest, NextResponse } from "next/server";
import { scrubDeleted } from "@/lib/scrub";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { forgetPeople } from "@/lib/person-forget";

/**
 * Seçilen kişileri toplu siler (çoktan-seçmeli). Yalnız düzenleyici. Silinen
 * kimliklere yapılan tüm ebeveyn/eş/eski-eş bağları da temizlenir (tekli
 * DELETE ile aynı mantık). Web (çerez) + mobil (Bearer) oturumu çalışır.
 * body: { ids: string[] }
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "Silinecek kişi seçilmedi." }, { status: 400 });

  const del = new Set(ids);
  const data = await getFamilyData(ctx.treeId, { skipCache: true });
  /*
   * İYİMSER KİLİT. Toplu işlemler bu denetimden geçmiyordu: tek kişilik
   * düzenleme korunurken yirmi kişiyi silen ya da kayıt birleştiren işlem
   * korunmuyordu — ters bir öncelik. Başlık gelmezse `versionMismatch`
   * `false` döner, yani başlığı göndermeyen çağıranlar (mobil, betikler)
   * etkilenmez.
   */
  if (versionMismatch(req, data.updatedAt))
    return NextResponse.json(
      { error: "Bu ağaç siz bakarken değişti. Sayfayı yenileyip tekrar deneyin." },
      { status: 409 }
    );

  // Tekli DELETE ile AYNI işlev (`lib/scrub.ts`) — iki kopya ayrı düşmesin.
  data.people = scrubDeleted(data.people, del);

  await saveFamilyData(ctx.treeId, { people: data.people, updatedAt: new Date().toISOString() }, { by: ctx.authorId });

  /*
   * AĞACIN DIŞINDA KALANLAR — tekli silme ile AYNI işlev
   * (`lib/person-forget.ts`). Bu yol o depolara hiç uğramıyordu: yirmi kişi
   * silindiğinde yirmi kişinin bütün duygusal bağları ve onlar hakkındaki
   * açık hikâye talepleri olduğu gibi kalıyordu. Talebin kalması yalnız ölü
   * veri değil, dışarıda dolaşan CANLI bir bağlantı: artık var olmayan biri
   * hakkında yeni katkı toplamaya devam ediyordu.
   */
  await forgetPeople(ctx.treeId, ids);

  return NextResponse.json({ ok: true, deleted: ids.length, count: data.people.length });
}
