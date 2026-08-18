import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { importGedcom } from "@/lib/gedcom";
import { detectFormat, parseNonGedcom } from "@/lib/import";
import { parseFttText } from "@/lib/ftz";
import { extractNodeFtt } from "@/lib/ftz-unzip";
import { parseEdevletText } from "@/lib/edevlet";
import { extractPdfText } from "@/lib/pdf-extract";
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

  const mode = (formData.get("mode") as string) ?? "merge";
  const isFtz = /\.ftz$/i.test(file.name || "");
  const isPdf = /\.pdf$/i.test(file.name || "") || file.type === "application/pdf";

  let imported: Person[];
  let format: string;
  try {
    if (isFtz) {
      // .ftz ikili bir ZIP paketidir — metin olarak okunamaz. node.ftt'yi aç.
      const buf = Buffer.from(await file.arrayBuffer());
      imported = parseFttText(extractNodeFtt(buf));
      format = "ftz";
    } else if (isPdf) {
      // e-Devlet "Alt-Üst Soy Belgesi" PDF'i: metni çıkar, kişilere çöz.
      const buf = Buffer.from(await file.arrayBuffer());
      imported = parseEdevletText(await extractPdfText(buf));
      if (imported.length === 0) {
        return NextResponse.json(
          { error: "PDF'ten kişi çıkarılamadı. e-Devlet 'Alt-Üst Soy Belgesi' PDF'i bekleniyor." },
          { status: 400 }
        );
      }
      format = "edevlet";
    } else {
      const text = await file.text();
      // Çok-biçimli: GEDCOM / CSV / JSON (uzantı + içerik sezgisiyle belirlenir).
      const detected = detectFormat(file.name || "", text);
      if (!detected) {
        return NextResponse.json(
          { error: "Dosya biçimi tanınamadı (GEDCOM, CSV, JSON veya .ftz bekleniyor)." },
          { status: 400 }
        );
      }
      imported = detected === "gedcom" ? importGedcom(text) : parseNonGedcom(detected, text);
      format = detected;
    }
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
