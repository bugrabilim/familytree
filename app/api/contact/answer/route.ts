import { NextRequest, NextResponse } from "next/server";
import { answerWithToken } from "@/lib/contact-lookup";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * ONAY YANITI — `POST /api/contact/answer { token, answer }`. OTURUMSUZ.
 *
 * Yanıtı veren kişinin hesabı yok ve olması da beklenemez: adresi bir akrabası
 * girdi, kendisi uygulamayı hiç görmemiş olabilir. Oturum duvarına takılsaydı
 * onay hiçbir zaman verilemez ve "çift onay" kâğıt üstünde kalırdı.
 *
 * POST olması bilinçli: karar bir YAN ETKİ ve GET olsaydı posta istemcilerinin
 * bağlantı ön-getirmesi kararı kullanıcı görmeden verirdi.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

export async function POST(req: NextRequest) {
  /*
   * Sınırlı. Jeton 256 bit rastgele, yani tahmin edilemez — ama sınırsız
   * deneme aynı zamanda bir kimlik TARAMA aracı: geçerli ağaç/kişi kimliği
   * çiftlerini "bulunamadı" ile "geçersiz" arasındaki farktan çıkarmaya
   * çalışmak. Aşağıda yanıt tek olduğu için o fark zaten yok; sınır ikinci
   * katman.
   */
  const rl = await rateLimitShared(`contact:answer:${ipOf(req)}`, { capacity: 20, refillPerSec: 0.05 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let body: { token?: unknown; answer?: unknown };
  try {
    body = (await req.json()) as { token?: unknown; answer?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const answer = body.answer === "onayla" ? "onayla" : body.answer === "reddet" ? "reddet" : null;
  if (!answer) return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });

  const r = await answerWithToken(body.token, answer);
  /*
   * TEK RET MESAJI. "Bu bağlantı geçersiz" ile "böyle bir kayıt yok" ayırt
   * edilseydi, uç kimlik tahmin etmek için bir sorgu aracına dönerdi:
   * rastgele ağaç kimlikleriyle deneyip hangilerinin var olduğunu öğrenmek.
   */
  if (!r.ok)
    return NextResponse.json(
      { error: "Bu bağlantı artık geçerli değil." },
      { status: 400 }
    );

  return NextResponse.json({ ok: true, answer });
}
