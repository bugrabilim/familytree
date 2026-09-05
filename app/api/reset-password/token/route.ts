import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { getUsersData, updateUserPassword, updateUserResetToken } from "@/lib/users";
import { checkResetToken } from "@/lib/password-reset";
import { updateAccountAuthPassword } from "@/lib/auth-users";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * E-POSTAYLA ŞİFRE SIFIRLAMA — jetonu kullanma (madde 51).
 *
 * body: { token, newPassword }
 *
 * ## Jeton neden ADRESİ döndürmüyor
 *
 * Yanıt yalnız `{ ok: true }`. Jetonun hangi hesaba ait olduğunu ya da hangi
 * adrese gittiğini söylemek, bağlantıyı ele geçiren birine ek bilgi vermek
 * olurdu; sıfırlamayı yapan zaten kim olduğunu biliyor.
 *
 * ## Ham jeton hiçbir yere yazılmıyor
 *
 * Depoda yalnız SHA-256 özeti var (`resetTokenHash`). Blob'u okuyabilen biri
 * (ya da bir yedek görüntüsü) bekleyen sıfırlama bağlantılarını elde
 * edememeli.
 */

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(req: NextRequest) {
  const rl = await rateLimitShared(`reset-token:${ipOf(req)}`, { capacity: 10, refillPerSec: 0.02 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let token = "";
  let newPassword = "";
  try {
    const body = (await req.json()) as { token?: unknown; newPassword?: unknown };
    token = typeof body.token === "string" ? body.token : "";
    newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  if (!token) return NextResponse.json({ error: "Bağlantı geçersiz." }, { status: 400 });
  if (newPassword.length < 6)
    return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });

  const ozet = sha256(token);
  let users: Awaited<ReturnType<typeof getUsersData>>["users"];
  try {
    ({ users } = await getUsersData());
  } catch (e) {
    /*
     * Depo okunamadı. Kullanıcı süresi dolmuş bir bağlantıya tıkladığında
     * ham 500 görmemeli; ekranda ne yapacağını söyleyen tek mesaj dursun.
     */
    console.error("[51] hesap listesi okunamadı:", (e as Error).message);
    return NextResponse.json(
      { error: "Bağlantı geçersiz ya da süresi dolmuş. Yeniden sıfırlama isteyin." },
      { status: 400 }
    );
  }

  /*
   * Hesabı JETON ÖZETİNDEN buluyoruz, kullanıcının verdiği bir addan değil:
   * bağlantı zaten hangi hesap olduğunu taşıyor ve ad sormak, saldırgana
   * "bu jeton şu hesaba ait mi?" diye deneme imkânı verirdi.
   */
  const user = users.find((u) => !!u.resetTokenHash && u.resetTokenHash === ozet);
  const durum = checkResetToken(user ?? null, ozet, new Date());
  if (!durum.ok) {
    /*
     * Tek mesaj: "yok", "süresi dolmuş" ve "eşleşmiyor" ayırt edilmiyor.
     * Ayrılsaydı, geçerli ama süresi dolmuş bir jetonun VARLIĞI doğrulanmış
     * olurdu.
     */
    console.warn(`[51] sıfırlama jetonu reddedildi (${durum.reason})`);
    return NextResponse.json(
      { error: "Bağlantı geçersiz ya da süresi dolmuş. Yeniden sıfırlama isteyin." },
      { status: 400 }
    );
  }

  const newPasswordHash = await hash(newPassword, 12);
  // `updateUserPassword` bekleyen sıfırlama jetonunu da düşürüyor (tek kullanım).
  await updateUserPassword(user!.familyName, newPasswordHash);
  // Kuşak-kemer: şifre yolu değişse bile jetonun düştüğünden emin ol.
  await updateUserResetToken(user!.id, { resetTokenHash: null, resetTokenExpires: null });

  /*
   * Supabase Auth şifresini de senkronla — yoksa SIFIRLANMIŞ ESKİ şifre
   * Supabase üzerinden hâlâ kabul edilirdi. Best-effort: bcrypt zaten
   * güncellendi, hata sıfırlamayı geri almaz.
   */
  try {
    await updateAccountAuthPassword(user!.id, newPassword);
  } catch (e) {
    console.warn(`[3c] Supabase Auth şifre senkronu başarısız (${user!.id}):`, (e as Error).message);
  }

  return NextResponse.json({ ok: true });
}
