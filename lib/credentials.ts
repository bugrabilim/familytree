import { compare } from "bcryptjs";
import { findUserByFamilyName } from "@/lib/users";
import { findMemberByPassword } from "@/lib/members";
import { authEmailForAccount, isSupabaseLoginEnabled, supabaseVerifyPassword } from "@/lib/auth-users";
import type { TreeRole } from "@/types/user";

/** Giriş sonucu — hem web (NextAuth) hem mobil (jeton) tarafında ortak. */
export interface SessionUser {
  /** AĞACIN kimliği. `resolveActiveTree` `treeId`yi bundan türetir. */
  id: string;
  name: string;
  role: TreeRole;
  treeName: string;
  isFounder: boolean;
  /**
   * Davetli ÜYENİN kendi kimliği (`lib/members.ts`). Kurucuda yoktur —
   * onun kimliği zaten ağacın kimliğidir.
   *
   * `id` "hangi ağaç", bu alan "kim" sorusunun yanıtı. İkisi ayrılmadan
   * önce katkı akışı hiç kimseyi adlandıramıyordu: her kayıt ağacın
   * kimliğiyle imzalanıyordu.
   */
  memberId?: string;
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
    /*
     * `id` AĞACIN kimliği kalır — `resolveActiveTree` ondan `treeId`
     * türetiyor, değiştirmek ağaç çözümlemesini bozardı.
     *
     * `memberId` ise KİMİN girdiğini söyler. İkisi ayrı olmadığı için katkı
     * akışı hiç kimseyi adlandıramıyordu: her kayıt ağacın kimliğiyle
     * imzalanıyor, ad haritasında karşılığı bulunmayınca herkes "biri"
     * görünüyordu — ve iki farklı üyenin düzenlemesi veride de ayırt
     * edilemiyordu.
     */
    return {
      id: user.id,
      memberId: member.id,
      name: member.displayName,
      role: member.role,
      treeName: user.familyName,
      isFounder: false,
    };
  }

  return null;
}
