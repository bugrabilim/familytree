import { NextRequest, NextResponse } from "next/server";
import { getFamilyData, saveFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { isGeminiConfigured, geminiGenerateParts, type GeminiPart } from "@/lib/gemini";
import { rateLimit } from "@/lib/rate-limit";
import { buildExtractPrompt, buildExtractSystem, buildRetryPrompt, parseExtractedJson } from "@/lib/ai-extract";
import { xlsxToText, docxToText } from "@/lib/office-extract";
import { nextCode } from "@/lib/code";
import type { Person } from "@/types/family";

export const dynamic = "force-dynamic";
// İki geçiş (ilk + boşsa ısrarlı ikinci) bu süreye SIĞMALI; aşarsa platform
// isteği keser ve istemciye anlamsız genel hata düşer. Aşağıdaki timeout'lar
// toplamı (≈38s + ≈16s) bunun altında tutuldu.
export const maxDuration = 60;

const forbidden = () =>
  NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });

function ensureCodes(people: Person[]): Person[] {
  const out = [...people];
  for (let i = 0; i < out.length; i++) {
    if (!out[i].code) out[i] = { ...out[i], code: nextCode(out) };
  }
  return out;
}

// Kontrol karakterleri (tab/newline/CR hariç) + Unicode değiştirme karakteri.
const BINARY_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g;

/** Dosyayı Gemini parçasına çevir: görsel/PDF → inlineData; metin → text. */
async function filePart(file: File): Promise<GeminiPart> {
  const name = (file.name || "").toLowerCase();
  const mime = file.type || "";
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif)$/.test(name);
  const isPdf = mime === "application/pdf" || name.endsWith(".pdf");
  if (isImage || isPdf) {
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return { inlineData: { mimeType: isPdf ? "application/pdf" : mime || "image/jpeg", data: b64 } };
  }

  // Excel → metin (CSV); Word (.docx) → metin. İkili ofis dosyaları önce
  // sunucuda çözülür, sonra metin olarak modele verilir.
  const isXlsx = /\.(xlsx|xlsm|xlsb|xls)$/.test(name) || mime.includes("spreadsheet") || mime.includes("ms-excel");
  const isDocx = name.endsWith(".docx") || mime.includes("wordprocessingml");
  if (isXlsx || isDocx) {
    const buf = Buffer.from(await file.arrayBuffer());
    const extracted = isXlsx ? await xlsxToText(buf) : await docxToText(buf);
    if (!extracted.trim()) throw new Error("BINARY");
    return { text: `--- DOSYA: ${file.name} ---\n${extracted.slice(0, 60000)}` };
  }

  // Metin olarak çöz (txt/csv/tsv/json/gedcom/xml…). İkili ise reddet.
  const text = await file.text();
  const control = (text.match(BINARY_RE) || []).length;
  if (!text.trim() || control > text.length * 0.02) throw new Error("BINARY");
  return { text: `--- DOSYA: ${file.name} ---\n${text.slice(0, 60000)}` };
}

/**
 * Yapay zekâ ile "herhangi bir dosyadan soy ağacı" (madde 7). Kullanıcının
 * yüklediği dosyayı (el yazısı fotoğrafı, PDF, metin, tablo, e-Devlet json…)
 * Gemini'ye verir, çıkan kişileri ağaca ekler. Yalnız düzenleyici.
 * form: file, lang, mode(merge|replace)
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role)) return forbidden();
  const rl = rateLimit(`ai:extract:${ctx.accountId}`, { capacity: 5, refillPerSec: 0.05 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla istek. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  if (!isGeminiConfigured())
    return NextResponse.json({ error: "AI yapılandırılmamış (GEMINI_API_KEY)." }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
  const lang = form.get("lang") === "en" ? "en" : "tr";
  const mode = (form.get("mode") as string) === "replace" ? "replace" : "merge";

  let part: GeminiPart;
  try {
    part = await filePart(file);
  } catch (e) {
    if ((e as Error).message === "BINARY") {
      return NextResponse.json(
        { error: "Bu dosya türü doğrudan okunamadı. Fotoğrafını, PDF'ini ya da metin/CSV/JSON hâlini yükleyin." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Dosya okunamadı" }, { status: 400 });
  }

  let imported: Person[];
  try {
    const out = await geminiGenerateParts(
      [{ text: buildExtractPrompt(lang) }, part],
      buildExtractSystem(lang),
      { temperature: 0.2, maxOutputTokens: 8192, timeoutMs: 38000, retries: 0 }
    );
    imported = parseExtractedJson(out);
    // İlk deneme boş döndüyse (zor/soluk belge), daha ısrarlı ikinci bir geçiş
    // dene — model bazen ilk turda "kişi yok" deyip geçebiliyor. İkinci geçiş
    // kısa tutuldu ki toplam süre maxDuration'ı aşıp platformca kesilmesin.
    if (imported.length === 0) {
      const retry = await geminiGenerateParts(
        [{ text: buildRetryPrompt(lang) }, part],
        buildExtractSystem(lang),
        { temperature: 0.35, maxOutputTokens: 8192, timeoutMs: 16000, retries: 0 }
      );
      imported = parseExtractedJson(retry);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "AI hatası" }, { status: 502 });
  }

  if (imported.length === 0) {
    return NextResponse.json(
      { error: "Dosyadan kişi çıkarılamadı. Daha net bir dosya deneyin." },
      { status: 422 }
    );
  }

  // #6 — Köken/iz: bu kartlar YZ ile bu dosyadan çıkarıldı. Dosya adını kısaca
  // ekle ("ai: nufus.pdf") ki kullanıcı sonradan nereden geldiğini görebilsin.
  const srcName = (file.name || "").slice(0, 60);
  const stamped = imported.map((p) => ({ ...p, entrySource: srcName ? `ai: ${srcName}` : "ai" }));

  if (mode === "replace") {
    await saveFamilyData(ctx.treeId, { people: ensureCodes(stamped), updatedAt: new Date().toISOString() });
  } else {
    const { people: existing } = await getFamilyData(ctx.treeId, { skipCache: true });
    await saveFamilyData(ctx.treeId, {
      people: ensureCodes([...existing, ...stamped]),
      updatedAt: new Date().toISOString(),
    });
  }
  return NextResponse.json({ count: imported.length });
}
