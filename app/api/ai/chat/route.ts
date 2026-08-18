import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { isGeminiConfigured, geminiGenerate } from "@/lib/gemini";
import { buildChatPrompt, buildChatSystem } from "@/lib/ai-chat";

export const dynamic = "force-dynamic";

/**
 * Ağaç hakkında AI soru-cevap (madde 3). Kullanıcının sorusunu, ağacın metin
 * özetiyle birlikte Gemini'ye verir. Yalnız düzenleyici (yaşayan verisi dış
 * servise gitmesin diye); gizli kişiler de ağaçta olduğundan editor şartı.
 * body: { question, lang }
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });
  if (!isGeminiConfigured())
    return NextResponse.json({ error: "AI yapılandırılmamış (GEMINI_API_KEY)." }, { status: 503 });

  let body: { question?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "Soru gerekli." }, { status: 400 });

  const lang = body.lang === "en" ? "en" : "tr";
  const { people } = await getFamilyData(ctx.treeId);
  const prompt = buildChatPrompt(people, question, lang);

  try {
    const answer = await geminiGenerate(prompt, buildChatSystem(lang));
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "AI hatası" }, { status: 502 });
  }
}
