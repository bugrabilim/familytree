import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData } from "@/lib/blob";
import { exportGedcom } from "@/lib/gedcom";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const { people } = await getFamilyData(session.user.id);
  const gedcom = exportGedcom(people);

  const familyName = (session.user.name ?? "aile-agaci").toLowerCase().replace(/\s+/g, "-");

  return new NextResponse(gedcom, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${familyName}.ged"`,
    },
  });
}
