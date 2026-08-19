import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { findUserByFamilyName, createUser } from "@/lib/users";
import { signMobileToken } from "@/lib/mobile-token";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function generateRecoveryCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Native mobil kayıt — hesap oluşturur, kurtarma kodunu döner ve doğrudan
 * giriş için bir JWT verir. Web'deki /api/register ile aynı kurallar.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = rateLimit(`mobile:register:${ip}`, { capacity: 5, refillPerSec: 0.02 });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen biraz bekleyin." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );

  let body: { familyName?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const familyName = (body.familyName ?? "").trim();
  const password = body.password ?? "";
  if (familyName.length < 2)
    return NextResponse.json({ error: "Ağaç adı en az 2 karakter olmalı." }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });

  if (await findUserByFamilyName(familyName))
    return NextResponse.json({ error: "Bu adla zaten bir hesap var." }, { status: 409 });

  const recoveryCode = generateRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([hash(password, 12), hash(recoveryCode, 10)]);
  const id = crypto.randomUUID();
  await createUser(id, familyName, passwordHash, recoveryCodeHash);

  const token = await signMobileToken({ sub: id, name: familyName, role: "admin", isFounder: true, treeName: familyName });

  return NextResponse.json(
    {
      token,
      recoveryCode,
      user: { id, name: familyName, role: "admin", treeName: familyName, isFounder: true },
    },
    { status: 201 }
  );
}
