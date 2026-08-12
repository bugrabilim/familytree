import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";

export async function GET(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Unauthorized" }, { status: ctx.status });

  const data = await getFamilyData(ctx.treeId);

  // Madde 10 — Koşullu istek: veri değişmediyse (aynı updatedAt) gövdeyi
  // tekrar göndermeyip 304 dönüyoruz. ETag olarak sürüm damgasını kullanıyoruz.
  const etag = `"${data.updatedAt}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(data, { headers: { ETag: etag } });
}
