import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { findUserByFamilyName, createUser, issueRecoveryCode } from "@/lib/users";
import { rateLimitShared } from "@/lib/rate-limit";

function ipOf(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "bilinmiyor"
  );
}

/*
 * Kurtarma kodu üretimi burada DEĞİL, `lib/users.ts` → `issueRecoveryCode`
 * içinde: web ve mobil kayıt aynı kodu kopyalıyordu ve kopyaların ikisi de
 * benzersizlik denetimi yapmıyordu (üstelik `Math.random()` ile — bir kimlik
 * doğrulama sırrı için).
 */

export async function POST(req: NextRequest) {
  /*
   * SINIRLI. Hesap sınırsız açılabiliyorsa hesap başına ölçülen her şey (AI,
   * yükleme, e-posta) ölçüsüz hale gelir — ve buradan açılan hesaplar hiçbir
   * kısıtı olmayan tam yetkili hesaplar. Mobil ikizi (`/api/mobile/register`)
   * zaten sınırlıydı; web ucu atlanmıştı.
   */
  const rl = await rateLimitShared(`register:${ipOf(req)}`, { capacity: 5, refillPerSec: 0.02 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  try {
    const { familyName, password } = await req.json();

    if (!familyName || typeof familyName !== "string" || familyName.trim().length < 2) {
      return NextResponse.json({ error: "Ağaç adı en az 2 karakter olmalı." }, { status: 400 });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });
    }

    const existing = await findUserByFamilyName(familyName.trim());
    if (existing) {
      return NextResponse.json(
        { error: "Bu adla zaten bir hesap var." },
        { status: 409 }
      );
    }

    const [passwordHash, kurtarma] = await Promise.all([hash(password, 12), issueRecoveryCode()]);

    await createUser(
      crypto.randomUUID(),
      familyName.trim(),
      passwordHash,
      kurtarma.hash,
      kurtarma.index
    );

    // Düz kod YALNIZ burada, bir kez dönüyor; depoda yalnız hash'i ve indeksi var.
    return NextResponse.json({ success: true, recoveryCode: kurtarma.code }, { status: 201 });
  } catch (err) {
    console.error("Register error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const isBlobAuth = message.includes("No blob credentials") || message.includes("BLOB_READ_WRITE_TOKEN");
    return NextResponse.json(
      {
        error: isBlobAuth
          ? "Depolama yapılandırması eksik (BLOB_READ_WRITE_TOKEN). Vercel proje ayarlarında Blob store bağlantısını kontrol edin."
          : `Sunucu hatası: ${message}`,
      },
      { status: 500 }
    );
  }
}
