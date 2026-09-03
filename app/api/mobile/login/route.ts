import { NextRequest, NextResponse } from "next/server";
import { verifyLogin } from "@/lib/credentials";
import { signMobileToken } from "@/lib/mobile-token";
import { rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Native mobil giriş — soyadı + şifre → imzalı JWT. Web tarafı NextAuth çerezi
 * kullanır; mobil bu jetonu SecureStore'da saklar ve `Authorization: Bearer`
 * ile gönderir. Doğrulama mantığı web ile ortak (lib/credentials).
 */
export async function POST(req: NextRequest) {
  // Kaba-kuvvet koruması: IP başına.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = await rateLimitShared(`mobile:login:${ip}`, { capacity: 10, refillPerSec: 0.1 });
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
  if (!familyName || !password)
    return NextResponse.json({ error: "Ağaç adı ve şifre gerekli." }, { status: 400 });

  const user = await verifyLogin(familyName, password);
  if (!user) return NextResponse.json({ error: "Ağaç adı veya şifre hatalı." }, { status: 401 });

  const token = await signMobileToken({
    sub: user.id,
    name: user.name,
    role: user.role,
    isFounder: user.isFounder,
    treeName: user.treeName,
    memberId: user.memberId,
  });

  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, treeName: user.treeName, isFounder: user.isFounder },
  });
}
