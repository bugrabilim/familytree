import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canDo } from "@/lib/guest";
import { canEdit } from "@/lib/roles";
import { isGeminiConfigured, geminiGenerateParts } from "@/lib/gemini";
import { rateLimitShared } from "@/lib/rate-limit";
import { buildChatPrompt } from "@/lib/ai-chat";

/** 429 yanıtı — hız sınırı aşıldığında. */
function tooMany(retryAfter: number) {
  return NextResponse.json(
    { error: "Çok fazla istek. Lütfen biraz bekleyin." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ağaç hakkında AI soru-cevap (madde 3). Kullanıcının sorusunu, ağacın metin
 * özetiyle birlikte Gemini'ye verir. Yalnız düzenleyici (yaşayan verisi dış
 * servise gitmesin diye); gizli kişiler de ağaçta olduğundan editor şartı.
 * body: { question, lang }
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });
  /*
   * MİSAFİR KAPISI (Faz 3d). Gerekçe `lib/guest.ts` başında: misafir
   * hesabı sınırsız üretilebiliyor, dolayısıyla hesap başına ölçülen
   * ya da kendi ağacının dışına uzanan hiçbir yüzey ona açık olamaz.
   */
  if (!canDo(ctx.isGuest, "ai"))
    return NextResponse.json({ error: "Misafir hesapta yapay zekâ özellikleri kapalı. Ağacınızı sahiplenin." }, { status: 403 });
  if (!canEdit(ctx.role))
    return NextResponse.json({ error: "Bu işlem için düzenleme yetkiniz yok." }, { status: 403 });
  const rl = await rateLimitShared(`ai:chat:${ctx.accountId}`, { capacity: 8, refillPerSec: 0.12 });
  if (!rl.ok) return tooMany(rl.retryAfter);
  if (!isGeminiConfigured())
    return NextResponse.json({ error: "AI yapılandırılmamış (GEMINI_API_KEY)." }, { status: 503 });

  let body: { question?: string; lang?: string; history?: Array<{ role?: string; text?: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "Soru gerekli." }, { status: 400 });

  const lang = body.lang === "en" ? "en" : "tr";
  // Takip sorularının bağlamı için son konuşma sıraları (istemci gönderir).
  const history = Array.isArray(body.history)
    ? body.history
        .filter((h) => h && typeof h.text === "string" && (h.role === "user" || h.role === "assistant"))
        .slice(-8)
        .map((h) => ({ role: h.role as "user" | "assistant", text: String(h.text).slice(0, 2000) }))
    : [];
  const { people } = await getFamilyData(ctx.treeId);
  const prompt = buildChatPrompt(people, question, lang, history);

  try {
    // Yönerge isteme gömülü (sistem yok) → eko yok. Düşük sıcaklık = tutarlı,
    // daha yüksek çıktı sınırı = yanıt yarıda kesilmesin.
    const answer = await geminiGenerateParts([{ text: prompt }], undefined, {
      temperature: 0.2,
      maxOutputTokens: 1024,
      timeoutMs: 30000,
      retries: 1,
    });
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "AI hatası" }, { status: 502 });
  }
}
