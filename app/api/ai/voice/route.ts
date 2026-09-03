import { NextRequest, NextResponse } from "next/server";
import { getFamilyData } from "@/lib/blob";
import { resolveActiveTree } from "@/lib/tree-context";
import { canDo } from "@/lib/guest";
import { canEdit } from "@/lib/roles";
import { isGeminiConfigured, geminiGenerateParts, type GeminiPart } from "@/lib/gemini";
import { rateLimitShared } from "@/lib/rate-limit";
import { audioMimeOf, buildVoicePrompt, buildVoiceSystem, parseVoiceJson, pendingFacts } from "@/lib/voice";

export const dynamic = "force-dynamic";
// Ses deşifresi metinden yavaş; aşağıdaki timeout bunun altında tutuldu.
export const maxDuration = 60;

/**
 * Sesli Şecere — deşifre ve ADAY çıkarımı.
 *
 * BU UÇ HİÇBİR ŞEY YAZMAZ. Yalnız kaydı çözer ve onaya sunulacak adayları
 * döner; ağaca yazma işini kullanıcı onayladıktan sonra mevcut kişi
 * rotaları yapar. Ayrımı burada tutmak önemli: bir dil modelinin çıkarımı
 * doğrudan aile kaydına yazsaydı, yanlış bir tahmin sessizce ailenin
 * tarihine karışırdı. Adayların alıntı doğrulaması `lib/voice.ts`te.
 *
 * form: audio (dosya), question (sorulan soru), subjectId, lang
 */

const MAX_BYTES = 20 * 1024 * 1024; // ~20 MB — birkaç dakikalık webm/m4a

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

  const rl = await rateLimitShared(`ai:voice:${ctx.accountId}`, { capacity: 6, refillPerSec: 0.05 });
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

  const file = form.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "Ses kaydı bulunamadı." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "Ses kaydı boş." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: "Kayıt çok uzun. Daha kısa parçalar hâlinde kaydedin." },
      { status: 413 }
    );

  const mime = audioMimeOf(file.name, file.type);
  if (!mime)
    return NextResponse.json(
      { error: "Bu dosya ses kaydı gibi görünmüyor." },
      { status: 400 }
    );

  const lang = form.get("lang") === "en" ? "en" : "tr";
  const question = String(form.get("question") ?? "").slice(0, 500);
  const subjectId = String(form.get("subjectId") ?? "");

  const data = await getFamilyData(ctx.treeId);
  const subject = subjectId ? data.people.find((p) => p.id === subjectId) : undefined;

  const part: GeminiPart = {
    inlineData: { mimeType: mime, data: Buffer.from(await file.arrayBuffer()).toString("base64") },
  };

  let out: string;
  try {
    out = await geminiGenerateParts(
      [{ text: buildVoicePrompt(subject, question, data.people, lang) }, part],
      buildVoiceSystem(lang),
      { temperature: 0.1, maxOutputTokens: 8192, timeoutMs: 45000, retries: 0 }
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "AI hatası" }, { status: 502 });
  }

  const result = parseVoiceJson(out);
  if (!result.transcript)
    return NextResponse.json(
      { error: "Kayıttan konuşma çözülemedi. Daha yakından ve sessiz bir ortamda deneyin." },
      { status: 422 }
    );

  /*
   * Zaten doğru olan bilgiyi onaya sunmuyoruz — kullanıcıya "Rize mi?" diye
   * sormak, kayıtta zaten Rize yazarken vaktini çalmak olur. Çelişenler ise
   * eski değeriyle birlikte geliyor.
   */
  return NextResponse.json({
    transcript: result.transcript,
    people: result.people,
    facts: pendingFacts(result.facts, data.people),
  });
}
