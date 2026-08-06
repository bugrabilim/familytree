import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { findUserByFamilyName, createUser } from "@/lib/users";

export async function POST(req: NextRequest) {
  const { familyName, password } = await req.json();

  if (!familyName || typeof familyName !== "string" || familyName.trim().length < 2) {
    return NextResponse.json({ error: "Soyisim en az 2 karakter olmalı." }, { status: 400 });
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "Şifre en az 6 karakter olmalı." }, { status: 400 });
  }

  const existing = await findUserByFamilyName(familyName.trim());
  if (existing) {
    return NextResponse.json(
      { error: "Bu soyisimle zaten bir hesap var." },
      { status: 409 }
    );
  }

  const passwordHash = await hash(password, 12);
  await createUser(crypto.randomUUID(), familyName.trim(), passwordHash);

  return NextResponse.json({ success: true }, { status: 201 });
}
