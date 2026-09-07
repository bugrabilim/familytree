import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { exportGedcom } from "@/lib/gedcom";
import { EXPORT_META, exportCsv, exportJson, type ExportFormat } from "@/lib/import";
import { exportXlsx } from "@/lib/export-xlsx";
import { makeGedzip } from "@/lib/gedzip";
import { exportHtml } from "@/lib/export-html";
import { auth } from "@/auth";
import { listTrees } from "@/lib/trees";

/**
 * Belgenin başlığına yazılacak ağaç adı — "en iyi çaba".
 *
 * Yalnız HTML aktarımında çağrılıyor: öteki biçimlerin başlığı yok, onlara
 * fazladan bir oturum + kayıt okuması yüklemek anlamsız olurdu. Ad
 * bulunamazsa boş döner ve belge genel başlığıyla ("Aile Ağacı Arşivi")
 * yetinir — bu yüzden hata YÜKSELTMİYOR: adı bilinmeyen bir yedek, hiç
 * indirilemeyen bir yedekten iyidir.
 */
async function agacAdi(accountId: string, treeId: string): Promise<string> {
  let ev = "";
  try {
    const session = await auth();
    ev = session?.user?.treeName ?? session?.user?.name ?? "";
  } catch {
    /* Bearer ile gelen mobil istekte oturum yok; ad da yok. */
  }
  if (treeId === accountId) return ev;
  try {
    const hepsi = await listTrees(accountId, ev);
    return hepsi.find((t) => t.treeId === treeId)?.name ?? ev;
  } catch {
    return ev;
  }
}

export async function GET(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });

  const q = (req.nextUrl.searchParams.get("format") ?? "gedcom").toLowerCase();
  const { people } = await getFamilyData(ctx.treeId);

  /*
   * HTML (.html) — tek dosyalık arşiv. Ham veri belgenin İÇİNDE gömülü
   * olduğundan bu biçim hem "aç ve bak" hem de geri yüklenebilir bir yedek;
   * bkz. `lib/export-html.ts`.
   */
  if (q === "html") {
    const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "tr";
    const body = exportHtml(people, { treeName: await agacAdi(ctx.accountId, ctx.treeId), lang });
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="aile-agaci.html"`,
      },
    });
  }

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

  // GEDCOM 7 ayrı bir biçim DEĞİL, aynı biçimin başka sürümü: dosya yine .ged,
  // sürüm başlıkta yazar. Bu yüzden `ExportFormat` büyütülmedi. Varsayılan
  // 5.5.1 olarak KALIR — alandaki programların çoğu hâlâ onu okuyor.
  const gedcom7 = q === "gedcom7" || q === "gedcom-7" || q === "gedzip";

  // GEDZIP — GEDCOM 7'nin resmî paketi: kökünde `gedcom.ged` olan bir ZIP.
  // İçerik 7.0'dır; paket biçimi 5.5.1 için tanımlı değil.
  if (q === "gedzip") {
    const zip = makeGedzip(exportGedcom(people, { version: "7.0" }));
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="aile-agaci.gdz"`,
      },
    });
  }

  const format: ExportFormat = q === "csv" || q === "json" ? q : "gedcom";
  const body =
    format === "csv"
      ? exportCsv(people)
      : format === "json"
      ? exportJson(people)
      : exportGedcom(people, gedcom7 ? { version: "7.0" } : {});

  const familyName = "aile-agaci";
  const { ext, mime } = EXPORT_META[format];

  return new NextResponse(body, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${familyName}.${ext}"`,
    },
  });
}
