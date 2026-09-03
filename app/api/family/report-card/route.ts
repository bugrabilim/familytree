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

  /*
   * "İçinde bulunulan yıl" İSTEMCİNİN yılıdır, sunucununki değil.
   *
   * Sunucu Vercel'de UTC çalışıyor; İstanbul'da 1 Ocak saat 01:00'de istemci
   * 2027 derken sunucu hâlâ 2026'da oluyor. Eskiden sunucunun yılına
   * bakılıyordu, dolayısıyla yılın ilk üç saatinde "kayda geçenler" bölümü
   * kayboluyor ve üstelik GELECEK bir yıl için "geçmiş yıl" gerekçesi
   * dönüyordu. UTC-8'de aynı şey 31 Aralık akşamı ters yönde oluyordu.
   *
   * İstemci kendi `getTimezoneOffset()` değerini yolluyor; yoksa sunucunun
   * yılına düşülüyor (eski davranış — bozuk değil, yalnız sınırda şaşıyor).
   */
  const simdi = new Date();
  const tzHam = Number(req.nextUrl.searchParams.get("tz"));
  const tz = Number.isFinite(tzHam) && Math.abs(tzHam) <= 900 ? tzHam : null;
  const yerelSimdi = tz === null ? simdi : new Date(simdi.getTime() - tz * 60_000);
  const buYil = yerelSimdi.getUTCFullYear();

  const istenen = Number(req.nextUrl.searchParams.get("year") ?? buYil);
  if (!Number.isInteger(istenen) || istenen < 1 || istenen > 9999)
    return NextResponse.json({ error: "Geçersiz yıl" }, { status: 400 });

  /*
   * Karşılaştırma BUGÜNKÜ kişi listesine karşı yapılıyor, o yüzden yalnız
   * içinde bulunulan yıl için anlamlı. Geçmiş yıl için "o yıl ne eklendi"
   * bilinmiyor ve tahmin edilmiyor.
   */
  if (istenen !== buYil)
    return NextResponse.json({
      year: istenen,
      record: null,
      reason: istenen > buYil ? "gelecek-yil" : "gecmis-yil",
    });

  const [{ people }, snapshots] = await Promise.all([
    getFamilyData(ctx.treeId),
    readSnapshotsForActivity(ctx.treeId, WINDOW),
  ]);

  /*
   * Yılın başlangıcına EN YAKIN ama ondan sonraki görüntü. `snapshots` en
   * yeniden eskiye sıralı, o yüzden ölçüte uyan SON öğe en eskisidir.
   */
  // Yılın başı da yerel: UTC'ye göre kesmek sınırdaki görüntüyü dışarıda bırakırdı.
  const basi = `${istenen}-01-01`;
  const taban = [...snapshots].reverse().find((s) => s.at >= basi);
  if (!taban) return NextResponse.json({ year: istenen, record: null, reason: "gorunti-yok" });

  return NextResponse.json({
    year: istenen,
    record: recordYear(taban.people, people, taban.at),
  });
}
