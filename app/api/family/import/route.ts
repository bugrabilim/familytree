import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { importGedcom } from "@/lib/gedcom";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });

  const text = await file.text();
  const mode = (formData.get("mode") as string) ?? "merge";

  let imported: ReturnType<typeof importGedcom>;
  try {
    imported = importGedcom(text);
  } catch {
    return NextResponse.json({ error: "GEDCOM dosyası okunamadı" }, { status: 400 });
  }

  if (mode === "replace") {
    await saveFamilyData(session.user.id, { people: imported, updatedAt: new Date().toISOString() });
  } else {
    const { people: existing } = await getFamilyData(session.user.id);
    await saveFamilyData(session.user.id, {
      people: [...existing, ...imported],
      updatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ count: imported.length });
}
