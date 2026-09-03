import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getUsersData, updateUserAuthEmail } from "@/lib/users";
import { verifyWouldCollide } from "@/lib/account-email";
import { confirmAccountAuthEmail } from "@/lib/auth-users";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * E-POSTA DOĞRULAMA (Faz 3e) — `POST /api/account/email/verify { token }`.
 *
 * OTURUM İSTEMİYOR ve bu bilinçli: doğrulama bağlantısı postadan geliyor ve
 * kullanıcı onu başka bir cihazda/tarayıcıda açabilir. Kimlik jetonun
 * kendisinde: 24 baytlık rastgele değer, depoda yalnız SHA-256 özeti duruyor.
 *
 * Doğrulama TEKİLLİĞİ burada zorluyor: bağlama sırasında doğrulanmamış
 * adresler çakışabiliyor (birinin yazım hatası gerçek sahibi kilitlemesin),
 * ama iki hesap aynı adresi DOĞRULANMIŞ tutamaz.
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
   * Oturumsuz bir uç: jeton tahmin etmeye çalışmak da bir maliyet. Sınır
   * IP başına ve paylaşımlı.
   */
  const rl = await rateLimitShared(`email:verify:${ipOf(req)}`, { capacity: 10, refillPerSec: 0.05 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let body: { token?: unknown };
  try {
    body = (await req.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  // Boş jeton hiçbir şeyle eşleşmemeli — boş özet de bir özettir.
  if (!token) return NextResponse.json({ error: "Bağlantı geçersiz." }, { status: 400 });

  const hash = createHash("sha256").update(token).digest("hex");
  /*
   * Depo okunamazsa (Blob kesintisi) temiz bir 503 dönüyoruz. Oturumsuz bir
   * uçta işlenmemiş hata, çağırana yığın izi ve "geçersiz bağlantı"dan
   * ayırt edilemeyen bir 500 verirdi; kullanıcı da bağlantısının bozuk
   * olduğunu sanıp yenisini isterdi.
   */
  let users;
  try {
    ({ users } = await getUsersData());
  } catch (e) {
    console.warn("[3e] hesap deposu okunamadı:", (e as Error).message);
    return NextResponse.json(
      { error: "Şu anda doğrulama yapılamıyor. Biraz sonra tekrar deneyin." },
      { status: 503 }
    );
  }
  const u = users.find((x) => x.emailTokenHash && x.emailTokenHash === hash);
  if (!u) return NextResponse.json({ error: "Bağlantı geçersiz ya da kullanılmış." }, { status: 404 });

  if (!u.emailTokenExpires || u.emailTokenExpires <= new Date().toISOString())
    return NextResponse.json({ error: "Bağlantının süresi dolmuş. Yeniden gönderin." }, { status: 410 });

  const email = (u.authEmail ?? "").trim();
  /*
   * Jeton üretildikten SONRA adres değişmiş olabilir. O durumda jeton artık
   * bağlı olmayan bir adresi doğrulardı — reddediyoruz.
   */
  if (!email) return NextResponse.json({ error: "Bu hesapta bağlı adres yok." }, { status: 409 });

  if (verifyWouldCollide(email, users, u.id))
    return NextResponse.json(
      { error: "Bu e-posta başka bir hesapta doğrulanmış." },
      { status: 409 }
    );

  // Jeton TEK KULLANIMLIK: doğrulamayla birlikte düşüyor.
  await updateUserAuthEmail(u.id, {
    authEmail: email,
    authEmailVerified: true,
    emailTokenHash: null,
    emailTokenExpires: null,
  });

  try {
    await confirmAccountAuthEmail(u.id, email);
  } catch (e) {
    console.warn(`[3e] auth e-posta onayı (${u.id}):`, (e as Error).message);
  }

  return NextResponse.json({ ok: true, email });
}
