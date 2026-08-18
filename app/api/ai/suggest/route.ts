import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { isGeminiConfigured, geminiGenerate } from "@/lib/gemini";
import { buildSuggestPrompt, isSuggestMode } from "@/lib/ai-suggest";

export const dynamic = "force-dynamic";

/**
 * AI asistanı (Gemini) — kullanıcının SEÇTİĞİ moda göre bir kişi için öneri
 * üretir: biyografi (story), tek cümle özet (summary), eksik bilgi soruları
 * (missing), zaman çizelgesi taslağı (timeline). Yalnız döndürür (yazma yok).
 * Gizli (confidential) kişilerde ve AI yapılandırılmamışsa çalışmaz.
 * body: { personId, mode, lang }
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!isGeminiConfigured())
    return NextResponse.json({ error: "AI yapılandırılmamış (GEMINI_API_KEY)." }, { status: 503 });

  let body: { personId?: string; mode?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  if (!body.personId) return NextResponse.json({ error: "personId gerekli." }, { status: 400 });
  const mode = isSuggestMode(body.mode) ? body.mode : "story";

  const { people } = await getFamilyData(ctx.treeId);
  const person = people.find((p) => p.id === body.personId);
  if (!person) return NextResponse.json({ error: "Kişi bulunamadı." }, { status: 404 });
  if (person.confidential)
    return NextResponse.json({ error: "Gizli kişi için AI kapalı." }, { status: 400 });

  const lang = body.lang === "en" ? "en" : "tr";
  const prompt = buildSuggestPrompt(person, people, mode, lang);
  const system =
    lang === "en"
      ? "You are a careful family historian. Stay strictly faithful to the given facts; never invent details."
      : "Sen dikkatli bir aile tarihçisisin. Yalnız verilen gerçeklere sadık kal; asla ayrıntı uydurma.";

  try {
    const text = await geminiGenerate(prompt, system);
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "AI hatası" }, { status: 502 });
  }
}
