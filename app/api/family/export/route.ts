import { NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { exportGedcom } from "@/lib/gedcom";

export async function GET() {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });

  const { people } = await getFamilyData(ctx.treeId);
  const gedcom = exportGedcom(people);

  const familyName = "aile-agaci";

  return new NextResponse(gedcom, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${familyName}.ged"`,
    },
  });
}
