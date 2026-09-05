import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { findUserByFamilyName, updateUserResetToken } from "@/lib/users";
import { planResetRequest, RESET_TTL_MINUTES } from "@/lib/password-reset";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { SITE_URL } from "@/lib/site";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * E-POSTAYLA ŞİFRE SIFIRLAMA — bağlantı isteği (madde 51).
 *
 * body: { familyName }  →  her durumda `{ ok: true }`
 *
 * ## Neden gerekiyordu
 *
 * Tek kurtarma yolu kayıt anında bir kez gösterilen kurtarma koduydu.
 * Kaybedilirse hesap KALICI olarak gidiyordu — ailesinin yüz yıllık kaydını
 * tutan bir üründe kabul edilebilir bir tek-nokta değil.
 *
 * ## Yanıt her zaman AYNI
 *
 * Hesap yok, adres yok, adres doğrulanmamış, bağlantı gönderildi — dördü de
 * `{ ok: true }` döner. Ayırt edilebilir olsalardı, dışarıdan hangi aile
 * adlarının kayıtlı olduğunu ve hangilerinin e-posta bağladığını sayan bir
 * kâhin olurdu. Aynı hata bu depoda bir kez yapılmıştı (kurtarma kodu ucu
 * "hesap yok" ile "kod yanlış" için ayrı yanıt veriyordu) ve düzeltilmişti;
 * yeni uç onu tekrar açmamalı.
 *
 * Sebep yalnız sunucu günlüğüne yazılıyor.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Ayırt edilemeyen yanıt — bütün dallar bunu döner. */
const AYNI_YANIT = { ok: true } as const;

export async function POST(req: NextRequest) {
  /*
   * İki katmanlı sınır. IP katmanı kaba kuvveti, hesap katmanı ise TEK BİR
   * kurbanın kutusuna posta yağdırmayı engelliyor: saldırgan IP değiştirse
   * bile aynı ağaç adına sınırsız posta tetikleyememeli.
   */
  const rl = await rateLimitShared(`reset-mail:${ipOf(req)}`, { capacity: 5, refillPerSec: 0.01 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let familyName = "";
  try {
    const body = (await req.json()) as { familyName?: unknown };
    familyName = typeof body.familyName === "string" ? body.familyName.trim() : "";
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  if (!familyName) return NextResponse.json({ error: "Ağaç adı gerekli." }, { status: 400 });

  const perAccount = await rateLimitShared(`reset-mail:ad:${familyName.toLocaleLowerCase("tr")}`, {
    capacity: 3,
    refillPerSec: 0.005,
  });
  // Sınır aşıldığında da AYNI yanıt: 429 dönmek, o ağaç adının var olduğunu
  // ele vermezdi ama "bu ada çok istek geldi" bilgisini sızdırırdı.
  if (!perAccount.ok) return NextResponse.json(AYNI_YANIT);

  /*
   * Beklenmeyen hata da AYNI yanıtı döndürüyor. Bu uçta tekbiçimlilik bir
   * güvenlik özelliği: depo bir an okunamadığında 500 dönmek, isteğin hangi
   * aşamaya kadar gittiğini dışarıya anlatan bir sinyal olurdu. Hata günlüğe
   * düşüyor; kullanıcı tekrar deneyebilir.
   */
  let user: Awaited<ReturnType<typeof findUserByFamilyName>> = null;
  try {
    user = await findUserByFamilyName(familyName);
  } catch (e) {
    console.error("[51] hesap okunamadı:", (e as Error).message);
    return NextResponse.json(AYNI_YANIT);
  }
  const plan = planResetRequest(user, new Date());

  if (plan.kind === "gonderme") {
    console.warn(`[51] sıfırlama bağlantısı gönderilmedi (${plan.reason})`);
    return NextResponse.json(AYNI_YANIT);
  }

  /*
   * Sağlayıcı yoksa jeton ÜRETİLMİYOR. Üretilseydi kullanıcının hesabında,
   * kimseye ulaşmayan ama bir saat boyunca geçerli olan bir sıfırlama jetonu
   * dururdu — kimsenin işine yaramayan, yalnız saldırı yüzeyi olan bir kayıt.
   */
  if (!isEmailConfigured()) {
    console.warn("[51] e-posta yapılandırılmamış; sıfırlama bağlantısı üretilmedi");
    return NextResponse.json(AYNI_YANIT);
  }

  const token = randomBytes(32).toString("base64url");
  await updateUserResetToken(user!.id, {
    resetTokenHash: sha256(token),
    resetTokenExpires: plan.expires,
  });

  const link = `${SITE_URL}/reset-password/${encodeURIComponent(token)}`;
  const { html, text } = renderEmail({
    title: "Şifrenizi sıfırlayın",
    intro: "Hesabınız için yeni bir şifre belirlemek üzere aşağıdaki düğmeye basın.",
    button: { label: "Yeni şifre belirle", url: link },
    note: `Bağlantı ${RESET_TTL_MINUTES} dakika geçerlidir ve yalnız bir kez kullanılabilir.`,
    footer: "Bu isteği siz yapmadıysanız yok sayın; şifreniz değişmez.",
  });
  try {
    await sendEmail({
      to: plan.email,
      subject: "Soy Ağacı — şifre sıfırlama",
      html,
      text,
    });
  } catch (e) {
    // Gönderim hatası da yanıtı değiştirmiyor — aynı gerekçe.
    console.error("[51] sıfırlama postası gönderilemedi:", (e as Error).message);
  }

  return NextResponse.json(AYNI_YANIT);
}
