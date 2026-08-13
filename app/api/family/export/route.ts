import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { exportGedcom } from "@/lib/gedcom";
import { EXPORT_META, exportCsv, exportJson, type ExportFormat } from "@/lib/import";

export async function GET(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });

  const q = (req.nextUrl.searchParams.get("format") ?? "gedcom").toLowerCase();
  const format: ExportFormat = q === "csv" || q === "json" ? q : "gedcom";

  const { people } = await getFamilyData(ctx.treeId);
  const body = format === "csv" ? exportCsv(people) : format === "json" ? exportJson(people) : exportGedcom(people);

  const familyName = "aile-agaci";
  const { ext, mime } = EXPORT_META[format];

  return new NextResponse(body, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${familyName}.${ext}"`,
    },
  });
}
