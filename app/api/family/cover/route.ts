import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData, versionMismatch } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";

/**
 * Aile Kitabı kapak fotoğrafı — yalnız düzenleyici.
 *  POST   body: { url: string }  → kapağı ayarlar/değiştirir.
 *  DELETE                        → kapağı kaldırır.
 * Fotoğraf zaten Cloudinary'ye /api/upload ile yüklenir; burada yalnız URL saklanır.
 *
 * ## Neden burada da iyimser kilit var
 *
 * Değişen alan tek bir dize, ama YAZILAN nesne ağacın TAMAMI: `getFamilyData`
 * ile okunan `data` üstünde `coverPhoto` değiştirilip `saveFamilyData`ya
 * olduğu gibi veriliyor. Yani okuma ile yazma arasında biri bir kişi eklemiş
 * ya da düzenlemişse, o iş kapak değişikliğiyle birlikte SİLİNİYOR.
 *
 * "Yalnız kapağı değiştiriyorum" duygusu yanıltıcı; kilit alanın büyüklüğüne
 * göre değil, YAZILAN alanın büyüklüğüne göre gerekiyor.
 */

/** Ağaç siz bakarken değiştiyse — iki uç da aynı yanıtı veriyor. */
function conflict() {
  return NextResponse.json(
    { error: "Bu ağaç siz bakarken değişti. Sayfayı yenileyip tekrar deneyin." },
    { status: 409 }
  );
}
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  let body: { url?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* boş */
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "Geçerli bir görsel bağlantısı gerekli." }, { status: 400 });

  const data = await getFamilyData(ctx.treeId, { skipCache: true });
  if (versionMismatch(req, data.updatedAt, ctx.treeId)) return conflict();
  data.coverPhoto = url;
  /*
   * `by` GEÇİLMİYOR ve bu bilinçli: `saveFamilyData` geçmişe yalnız kişi
   * listesi değiştiğinde yazıyor, kapak değişikliği ise listeye dokunmuyor.
   * Yazar bilgisinin gideceği bir kayıt yok.
   */
  await saveFamilyData(ctx.treeId, data);
  return NextResponse.json({ coverPhoto: url });
}

export async function DELETE(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const data = await getFamilyData(ctx.treeId, { skipCache: true });
  if (versionMismatch(req, data.updatedAt, ctx.treeId)) return conflict();
  /*
   * `delete` DEĞİL, açıkça `undefined`.
   *
   * `saveFamilyData` artık "alan yoksa eskisini koru" diyor (kapağı sessizce
   * silen rotalara karşı). `delete` alanı nesneden kaldırırdı ve bu kaldırma
   * isteği "bir şey söylemedim" diye okunup kapak geri gelirdi. Alanın VAR
   * ama boş olması, "kaldır" demenin yolu.
   */
  data.coverPhoto = undefined;
  await saveFamilyData(ctx.treeId, data);
  return NextResponse.json({ coverPhoto: null });
}
