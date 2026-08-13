import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { importGedcom } from "@/lib/gedcom";
import { detectFormat, parseNonGedcom } from "@/lib/import";
import { nextCode } from "@/lib/code";
import type { Person } from "@/types/family";

/** İçe aktarılan/mevcut herkese benzersiz kod ata (kodu olmayanlara). */
function ensureCodes(people: Person[]): Person[] {
  const withCodes = [...people];
  for (let i = 0; i < withCodes.length; i++) {
    if (!withCodes[i].code) {
      withCodes[i] = { ...withCodes[i], code: nextCode(withCodes) };
    }
  }
  return withCodes;
}

export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

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

  // Çok-biçimli: GEDCOM / CSV / JSON (uzantı + içerik sezgisiyle belirlenir).
  const format = detectFormat(file.name || "", text);
  if (!format) {
    return NextResponse.json(
      { error: "Dosya biçimi tanınamadı (GEDCOM, CSV veya JSON bekleniyor)." },
      { status: 400 }
    );
  }
  let imported: Person[];
  try {
    imported = format === "gedcom" ? importGedcom(text) : parseNonGedcom(format, text);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Dosya okunamadı" }, { status: 400 });
  }

  if (mode === "replace") {
    await saveFamilyData(ctx.treeId, { people: ensureCodes(imported), updatedAt: new Date().toISOString() });
  } else {
    const { people: existing } = await getFamilyData(ctx.treeId, { skipCache: true });
    await saveFamilyData(ctx.treeId, {
      people: ensureCodes([...existing, ...imported]),
      updatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ count: imported.length, format });
}
