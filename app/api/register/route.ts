import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { findUserByFamilyName, createUser } from "@/lib/users";

function generateRecoveryCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code; // e.g. ABCD-EFGH-IJKL-MNOP
}

export async function POST(req: NextRequest) {
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

    const recoveryCode = generateRecoveryCode();
    const [passwordHash, recoveryCodeHash] = await Promise.all([
      hash(password, 12),
      hash(recoveryCode, 10),
    ]);

    await createUser(crypto.randomUUID(), familyName.trim(), passwordHash, recoveryCodeHash);

    return NextResponse.json({ success: true, recoveryCode }, { status: 201 });
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
