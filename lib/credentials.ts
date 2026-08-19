import { compare } from "bcryptjs";
import { findUserByFamilyName } from "@/lib/users";
import { findMemberByPassword } from "@/lib/members";
import { authEmailForAccount, isSupabaseLoginEnabled, supabaseVerifyPassword } from "@/lib/auth-users";
import type { TreeRole } from "@/types/user";

/** Giriş sonucu — hem web (NextAuth) hem mobil (jeton) tarafında ortak. */
export interface SessionUser {
  id: string;
  name: string;
  role: TreeRole;
  treeName: string;
  isFounder: boolean;
}

/**
 * Soyadı + şifre doğrular. Sıra: (bayrak açıksa) Supabase Auth → bcrypt (founder)
 * → davetli üye şifresi. Web `authorize()` ve mobil `/api/mobile/login` bunu
 * paylaşır — tek kaynak. Doğrulama başarısızsa `null`.
 */
export async function verifyLogin(familyName: string, password: string): Promise<SessionUser | null> {
  if (!familyName || !password) return null;

  const user = await findUserByFamilyName(familyName);
  if (!user) return null;

  const founderSession: SessionUser = {
    id: user.id,
    name: user.familyName,
    role: "admin",
    treeName: user.familyName,
    isFounder: true,
  };

  if (isSupabaseLoginEnabled()) {
    if (await supabaseVerifyPassword(authEmailForAccount(user.id), password)) {
      return founderSession;
    }
  }

  if (await compare(password, user.passwordHash)) {
    return founderSession;
  }

  const member = await findMemberByPassword(user.id, password);
  if (member) {
    return { id: user.id, name: member.displayName, role: member.role, treeName: user.familyName, isFounder: false };
  }

  return null;
}
