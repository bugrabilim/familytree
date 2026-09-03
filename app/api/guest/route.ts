import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { auth } from "@/auth";
import { createUser } from "@/lib/users";
import { GUEST_TREE_NAME } from "@/lib/guest";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * MİSAFİR HESAP AÇMA (Faz 3d) — `POST /api/guest`.
 *
 * Kayıt olmadan denemek isteyen için gerçek ama sahipsiz bir ağaç açar.
 *
 * ## Bu bir hesap ÜRETME ucu ve oturumsuz
 *
 * Yani kötüye kullanımın doğrudan hedefi: her çağrı Blob'da yeni bir kayıt
 * ve yeni bir kota kovası demek. İki şey yapılıyor:
 *
 *  1. **Sert oran sınırı**, IP başına ve paylaşımlı. Bir insan bir kez
 *     "dene" der, belki bir kez daha; dakikada onlarca hesap insan
 *     davranışı değil.
 *  2. **Zaten oturum varsa yeni hesap AÇILMIYOR.** Aksi hâlde giriş yapmış
 *     bir kullanıcının sekmesinde çalışan bir betik sınırsız hesap
 *     üretebilirdi.
 *
 * Şifre rastgele ve KİMSEYE verilmiyor: misafir oturumu şifreyle değil, kendi
 * sağlayıcısıyla (`signIn("guest")`) kuruluyor. Alanın var olma sebebi
 * `User` şeklini bozmamak ve sahiplenmede gerçek şifreyle değiştirilmek.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.id)
    return NextResponse.json(
      { error: "Zaten bir oturum açık." },
      { status: 409 }
    );

  const rl = await rateLimitShared(`guest:new:${ipOf(req)}`, { capacity: 3, refillPerSec: 0.01 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  const id = crypto.randomUUID();
  /*
   * Ad ÇAKIŞMASIN diye kısa bir sonek: `findUserByFamilyName` ada göre
   * arıyor ve iki misafir aynı adı taşısaydı biri ötekinin hesabını
   * bulabilirdi. Kullanıcıya gösterilen ad sadeleştirilir (arayüz).
   */
  const ad = `${GUEST_TREE_NAME} ${id.slice(0, 8)}`;
  const rastgele = randomBytes(32).toString("base64url");
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hash(rastgele, 12),
    hash(randomBytes(32).toString("base64url"), 10),
  ]);

  /*
   * Depo yazılamazsa temiz bir 503. Oturumsuz bir uçta işlenmemiş hata,
   * çağırana yığın izi verir ve "deneyin çalışmadı" ile "sunucu bozuk"u
   * ayırt edilemez kılardı.
   */
  try {
    await createUser(id, ad, passwordHash, recoveryCodeHash, { guest: true });
  } catch (e) {
    console.warn("[3d] misafir hesap açılamadı:", (e as Error).message);
    return NextResponse.json(
      { error: "Şu anda misafir ağacı açılamıyor. Biraz sonra tekrar deneyin." },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, id, familyName: ad }, { status: 201 });
}
