import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { exportGedcom } from "@/lib/gedcom";
import { EXPORT_META, exportCsv, exportJson, type ExportFormat } from "@/lib/import";
import { exportXlsx } from "@/lib/export-xlsx";

export async function GET(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });

  const q = (req.nextUrl.searchParams.get("format") ?? "gedcom").toLowerCase();
  const { people } = await getFamilyData(ctx.treeId);

  // Excel (.xlsx) — ikili çalışma kitabı.
  if (q === "xlsx" || q === "excel") {
    const buf = await exportXlsx(people);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="aile-agaci.xlsx"`,
      },
    });
  }

  const format: ExportFormat = q === "csv" || q === "json" ? q : "gedcom";
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
