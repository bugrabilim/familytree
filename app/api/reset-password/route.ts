import { NextRequest, NextResponse } from "next/server";
import { hash, compare } from "bcryptjs";
import { findUserByFamilyName, updateUserPassword } from "@/lib/users";

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
      return NextResponse.json({ error: "Bu soyisimle bir hesap bulunamadı." }, { status: 404 });
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Sunucu hatası. Lütfen tekrar deneyin." }, { status: 500 });
  }
}
