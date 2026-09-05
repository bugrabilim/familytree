import { NextRequest, NextResponse } from "next/server";
import { unsubscribeWithToken } from "@/lib/contact-lookup";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * ABONELİKTEN ÇIKMA — `POST /api/contact/unsubscribe { token }`. OTURUMSUZ.
 *
 * Onay vermiş biri fikrini değiştirebilir ve bunun için uygulamaya girmesi,
 * hesap açması beklenemez — hesabı yok. Çıkış tek tıklık olmalı; yoksa onay
 * tek yönlü bir kapı olur.
 *
 * Jeton KALICI (HMAC, saklanmıyor): çıkış bağlantısı her postada bulunmalı ve
 * yıllar sonra da çalışmalı. Tek kullanımlık olsaydı çıkış bir kereye
 * indirgenirdi.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

export async function POST(req: NextRequest) {
  const rl = await rateLimitShared(`contact:unsub:${ipOf(req)}`, { capacity: 20, refillPerSec: 0.05 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let body: { token?: unknown };
  try {
    body = (await req.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const r = await unsubscribeWithToken(body.token);
  // Tek ret mesajı — `answer` ucundaki gerekçenin aynısı.
  if (!r.ok)
    return NextResponse.json({ error: "Bu bağlantı artık geçerli değil." }, { status: 400 });

  return NextResponse.json({ ok: true });
}
