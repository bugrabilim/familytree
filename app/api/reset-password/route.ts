import { NextRequest, NextResponse } from "next/server";
import { hash, compare } from "bcryptjs";
import { findUserByFamilyName, updateUserPassword } from "@/lib/users";
import { updateAccountAuthPassword } from "@/lib/auth-users";

export async function POST(req: NextRequest) {
  try {
    const { familyName, recoveryCode, newPassword } = await req.json();

    if (!familyName || !recoveryCode || !newPassword) {
      return NextResponse.json({ error: "Tüm alanlar zorunludur." }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });
    }

    const user = await findUserByFamilyName(familyName.trim());
    if (!user) {
      return NextResponse.json({ error: "Bu adla bir hesap bulunamadı." }, { status: 404 });
    }

    const codeClean = recoveryCode.replace(/-/g, "").toUpperCase();
    const storedClean = recoveryCode; // compare with original input

    const valid = await compare(storedClean, user.recoveryCodeHash);
    if (!valid) {
      // also try without dashes
      const validNoDash = await compare(codeClean, user.recoveryCodeHash);
      if (!validNoDash) {
        return NextResponse.json({ error: "Kurtarma kodu hatalı." }, { status: 401 });
      }
    }

    const newPasswordHash = await hash(newPassword, 12);
    await updateUserPassword(familyName.trim(), newPasswordHash);

    // Faz 3c — Supabase Auth şifresini de senkronla (düz-metinle, en güvenilir
    // yol). Böylece sıfırlanmış ESKİ şifre Supabase üzerinden kabul edilemez.
    // Best-effort: hata sıfırlamayı bozmaz (bcrypt zaten güncellendi).
    try {
      await updateAccountAuthPassword(user.id, newPassword);
    } catch (e) {
      console.warn(`[3c] Supabase Auth şifre senkronu başarısız (${user.id}):`, (e as Error).message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
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
