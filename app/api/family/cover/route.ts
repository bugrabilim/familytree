import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";

/**
 * Aile Kitabı kapak fotoğrafı — yalnız düzenleyici.
 *  POST   body: { url: string }  → kapağı ayarlar/değiştirir.
 *  DELETE                        → kapağı kaldırır.
 * Fotoğraf zaten Cloudinary'ye /api/upload ile yüklenir; burada yalnız URL saklanır.
 */
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
  data.coverPhoto = url;
  await saveFamilyData(ctx.treeId, data);
  return NextResponse.json({ coverPhoto: url });
}

export async function DELETE() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const data = await getFamilyData(ctx.treeId, { skipCache: true });
  delete data.coverPhoto;
  await saveFamilyData(ctx.treeId, data);
  return NextResponse.json({ coverPhoto: null });
}
