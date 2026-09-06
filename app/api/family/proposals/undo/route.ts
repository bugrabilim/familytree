import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { markUndone } from "@/lib/proposals";
import { applyFailMessage, undoApplied } from "@/lib/proposal-apply";
import { findProposal, replaceProposal } from "@/lib/proposal-store";

export const dynamic = "force-dynamic";

/**
 * ONAYI GERİ ALMA — madde 35/F.
 *
 * Onay ağacı hemen değiştiriyordu ve "beğenmedim" demenin yolu yoktu; tek
 * çare ağacın tümünü bir önceki güncelleme günlüğü görüntüsüne döndürmekti,
 * o da onaydan SONRA başkalarının yaptığı her şeyi de geri alırdı.
 *
 * Bu uç yalnız o önerinin yaptığının tersini uyguluyor
 * (`lib/proposal-apply.ts`, `undoApplied`) ve her türün kendi koruması var:
 * "alan"da kayıt hâlâ onaylandığı gibi değilse geri alma reddediliyor —
 * yoksa aradaki değişikliği sessizce silerdi.
 *
 * ## Yetki: karar verende
 *
 * `canEdit`. Geri alma bir KARARI bozuyor ve ağacı değiştiriyor; öneriyi
 * yazan kişiye açık olsaydı, üye onaylanmış bir değişikliği tek başına
 * ağaçtan çıkarabilirdi — yani yazma kapısının etrafından dolaşırdı.
 *
 * ## Sonrası: öneri KUYRUĞA dönüyor
 *
 * Yeni bir "geri alındı" durumu yok. Geri alma "bu değişikliği istemiyorum"
 * demek ve bunun doğru yeri kuyruk: yönetici öneriyi orada usulünce
 * reddedebilir ya da fikir değiştirip tekrar onaylayabilir. Terminal bir
 * durum olsaydı öneri, ne uygulanmış ne karara bağlanmış bir arafta kalırdı.
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const p = await findProposal(ctx.treeId, id);
  if (!p) return NextResponse.json({ error: "Öneri bulunamadı" }, { status: 404 });
  if (p.status !== "onaylandi")
    return NextResponse.json({ error: "Yalnız onaylanmış bir öneri geri alınabilir." }, { status: 409 });

  const data = await getFamilyData(ctx.treeId, { skipCache: true });
  /*
   * İYİMSER KİLİT — öbür yazan uçlarla aynı kural. Geri almanın kendi
   * denetimi yalnız BU önerinin dokunduğu alanları koruyor; ağaç ise tek
   * dosya ve okuma ile yazma arasında başkası başka bir kişiyi kaydettiyse
   * bu yazma onu ezerdi.
   */
  if (versionMismatch(req, data.updatedAt))
    return NextResponse.json(
      { error: "Ağaç bu sırada başka bir yerde değişti. Sayfayı yenileyip tekrar deneyin." },
      { status: 409 }
    );

  const r = undoApplied(data, p);
  if (!r.ok)
    return NextResponse.json(
      {
        error: applyFailMessage(r.fail),
        ...(r.fail.kod === "bayat" ? { stale: r.fail.stale } : {}),
      },
      { status: 409 }
    );

  /*
   * SIRA: önce ağaç, sonra öneri damgası — onay yolundaki kuralın aynısı.
   * Ters olsaydı ve ağaç yazımı düşseydi, öneri "geri alındı" görünür ama
   * değişiklik ağaçta durmaya devam ederdi.
   */
  await saveFamilyData(ctx.treeId, data, { by: ctx.authorId });

  const session = await auth();
  const geri = markUndone(p, new Date().toISOString(), session?.user?.name ?? "");
  const yazildi = await replaceProposal(ctx.treeId, geri);
  if (!yazildi)
    return NextResponse.json(
      {
        error: "Değişiklik ağaçtan geri alındı ama öneri damgası yazılamadı. Kuyruğu tazeleyin.",
        applied: true,
        version: data.updatedAt,
      },
      { status: 500 }
    );

  return NextResponse.json({ ok: true, proposal: geri, version: data.updatedAt });
}
