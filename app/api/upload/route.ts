import { NextRequest, NextResponse } from "next/server";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { canEdit } from "@/lib/roles";
import { resolveActiveTree } from "@/lib/tree-context";

export async function POST(req: NextRequest) {
  // Web (çerez) ve native mobil (Bearer) oturumlarının ikisini de kabul eder.
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const rawKind = formData.get("kind");
  const kind =
    rawKind === "audio" ? "audio" : rawKind === "video" ? "video" : rawKind === "document" ? "document" : rawKind === "cover" ? "cover" : "photo";

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadToCloudinary(buffer, file.name, kind);

  return NextResponse.json({ url });
}
