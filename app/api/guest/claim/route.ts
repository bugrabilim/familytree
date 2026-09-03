import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { resolveActiveTree } from "@/lib/tree-context";
import { claimGuestUser, findUserById, findUserByFamilyName } from "@/lib/users";
import { CLAIM_MESSAGES, planClaim } from "@/lib/guest";
import { importAccountToAuth } from "@/lib/auth-users";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * SAHİPLENME (Faz 3d) — `POST /api/guest/claim { familyName, password }`.
 *
 * Misafir ağacını gerçek hesaba çevirir: ad + şifre verilir, `guest` bayrağı
 * düşer ve hesap normal founder hesabı olur.
 *
 * Doğrulama kuralları KAYIT rotasıyla aynı (`lib/guest.ts`, `planClaim`):
 * sahiplenme "arka kapıdan kayıt" olduğu için ondan gevşek olamaz — gevşek
 * olsaydı kayıt kurallarını atlamak için önce misafir açıp sonra sahiplenmek
 * yeterdi.
 *
 * Kurtarma kodu yanıtta DÖNÜYOR ve yalnız burada: kayıt akışıyla aynı, çünkü
 * kullanıcı o kodu bir yere yazmalı.
 */

function generateRecoveryCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

export async function POST(req: NextRequest) {
  const ctx = await resolveActiveTree();
  if (!ctx.ok) return NextResponse.json({ error: "Yetkisiz" }, { status: ctx.status });

  /*
   * Sınırlı: ad benzersizliği denetlendiği için bu uç aynı zamanda "bu ad
   * alınmış mı" sorgusuna dönüşebilir. Sınır o taramayı pahalı kılıyor.
   */
  const rl = await rateLimitShared(`guest:claim:${ctx.accountId}:${ipOf(req)}`, {
    capacity: 8,
    refillPerSec: 0.05,
  });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let body: { familyName?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { familyName?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const u = await findUserById(ctx.accountId);
  if (!u) return NextResponse.json({ error: "Hesap bulunamadı." }, { status: 404 });

  /*
   * Ad denetimi ASENKRON olduğu için önce sorulup saf plana veriliyor.
   * `planClaim` senkron kalsın diye: karar mantığı test edilebilir olmalı.
   */
  const ad = typeof body.familyName === "string" ? body.familyName.trim() : "";
  const dolu = ad ? !!(await findUserByFamilyName(ad)) : false;

  const plan = planClaim(u, body, () => dolu);
  if (!plan.ok)
    return NextResponse.json(
      { error: CLAIM_MESSAGES[plan.error] },
      { status: plan.error === "ad-dolu" ? 409 : 400 }
    );

  const recoveryCode = generateRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hash(body.password as string, 12),
    hash(recoveryCode, 10),
  ]);

  const guncel = await claimGuestUser(ctx.accountId, plan.plan.familyName, passwordHash, recoveryCodeHash);
  if (!guncel) return NextResponse.json({ error: CLAIM_MESSAGES["misafir-degil"] }, { status: 409 });

  // Artık gerçek hesap: Supabase Auth'a da aktar (best-effort, kaydı bozmaz).
  try {
    await importAccountToAuth(guncel);
  } catch (e) {
    console.warn(`[3d] sahiplenme→auth (${guncel.id}):`, (e as Error).message);
  }

  /*
   * Oturum hâlâ MİSAFİR jetonu taşıyor; kullanıcı yeni adı ve şifresiyle
   * yeniden giriş yapmalı. Bunu istemciye açıkça söylüyoruz ki arayüz
   * sessizce kısıtlı bir oturumla devam etmesin.
   */
  return NextResponse.json({ ok: true, familyName: guncel.familyName, recoveryCode, reloginRequired: true });
}
