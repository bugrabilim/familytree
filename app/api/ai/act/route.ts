import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canEdit } from "@/lib/roles";
import { isGeminiConfigured, geminiGenerateParts } from "@/lib/gemini";
import { rateLimitShared } from "@/lib/rate-limit";
import { buildActPrompt, buildActSystem, parseActResponse } from "@/lib/ai-act";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * YZ ile "kişi ekle / profil oluştur" (#2). Kullanıcının doğal dildeki isteğini
 * (ör. "pembenin annesi kuzudur, ekle ve profil oluştur") tek bir yapısal
 * EYLEM'e çevirir ve istemciye döner; istemci bunu /api/family/person ile
 * uygular (kod/ilişki/çift-yazma mantığı orada yeniden kullanılır). Yalnız
 * düzenleyici. body: { message, lang }
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });
  const rl = await rateLimitShared(`ai:act:${ctx.accountId}`, { capacity: 10, refillPerSec: 0.1 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla istek. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  if (!isGeminiConfigured())
    return NextResponse.json({ error: "AI yapılandırılmamış (GEMINI_API_KEY)." }, { status: 503 });

  let body: { message?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "Mesaj gerekli." }, { status: 400 });
  const lang = body.lang === "en" ? "en" : "tr";

  const { people } = await getFamilyData(ctx.treeId);
  const validIds = new Set(people.map((p) => p.id));

  try {
    const out = await geminiGenerateParts(
      [{ text: buildActPrompt(message, people, lang) }],
      buildActSystem(lang),
      { temperature: 0.1, maxOutputTokens: 1024, timeoutMs: 25000, retries: 0 }
    );
    const act = parseActResponse(out, validIds);
    return NextResponse.json({ act });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "AI hatası" }, { status: 502 });
  }
}
