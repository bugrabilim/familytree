import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getFamilyData(session.user.id);

  // Madde 10 — Koşullu istek: veri değişmediyse (aynı updatedAt) gövdeyi
  // tekrar göndermeyip 304 dönüyoruz. ETag olarak sürüm damgasını kullanıyoruz.
  const etag = `"${data.updatedAt}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(data, { headers: { ETag: etag } });
}
