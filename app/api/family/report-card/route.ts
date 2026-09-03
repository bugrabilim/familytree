import { NextRequest, NextResponse } from "next/server";
import { resolveActiveTree } from "@/lib/tree-context";
import { getFamilyData } from "@/lib/blob";
import { readSnapshotsForActivity } from "@/lib/history";
import { recordYear } from "@/lib/report-card";

export const dynamic = "force-dynamic";

/** Geriye kaç anlık görüntü açılacağı. Tarihçenin tamamı zaten 50 ile sınırlı. */
const WINDOW = 50;

/**
 * Aile karnesinin "KAYDA GEÇENLER" yarısı.
 *
 * Öteki yarı ("ailede olanlar") istemcide hesaplanıyor: kayıttaki
 * tarihlerden okunur, sunucuya sormaya gerek yok. Bu yarı ise geçmiş bir
 * anlık görüntüyle karşılaştırma gerektiriyor ve tarihçe yalnız sunucuda.
 *
 * ## İki dürüstlük kuralı
 *
 * 1. **Yalnız içinde bulunulan yıl.** Tarihçe 50 görüntüyle sınırlı; geçmiş
 *    bir yılda ağaca ne eklendiğini bilmiyoruz ve tahmin etmiyoruz. Geçmiş
 *    yıl istenirse `record: null` döner, karne o bölümü hiç göstermez.
 * 2. **Etiket gerçek tarihi taşır.** "Bu yıl" demiyoruz: karşılaştırma yılın
 *    ilk gününden değil, o yıl içindeki EN ESKİ anlık görüntüden başlıyor.
 *    Dönen `since` o görüntünün tarihi ve arayüz onu yazıyor — "1 Mart'tan
 *    bu yana" doğru, "bu yıl" olurdu yanlış.
 */
export async function GET(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });

  const simdi = new Date();
  const istenen = Number(req.nextUrl.searchParams.get("year") ?? simdi.getFullYear());
  if (!Number.isInteger(istenen) || istenen < 1 || istenen > 9999)
    return NextResponse.json({ error: "Geçersiz yıl" }, { status: 400 });

  if (istenen !== simdi.getFullYear())
    return NextResponse.json({ year: istenen, record: null, reason: "gecmis-yil" });

  const [{ people }, snapshots] = await Promise.all([
    getFamilyData(ctx.treeId),
    readSnapshotsForActivity(ctx.treeId, WINDOW),
  ]);

  /*
   * Yılın başlangıcına EN YAKIN ama ondan sonraki görüntü. `snapshots` en
   * yeniden eskiye sıralı, o yüzden ölçüte uyan SON öğe en eskisidir.
   */
  const basi = `${istenen}-01-01`;
  const taban = [...snapshots].reverse().find((s) => s.at >= basi);
  if (!taban) return NextResponse.json({ year: istenen, record: null, reason: "gorunti-yok" });

  return NextResponse.json({
    year: istenen,
    record: recordYear(taban.people, people, taban.at),
  });
}
