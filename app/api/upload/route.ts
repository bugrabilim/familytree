import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { canEdit } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const kind = formData.get("kind") === "audio" ? "audio" : "photo";

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const url = await uploadToCloudinary(buffer, file.name, kind);

  return NextResponse.json({ url });
}
