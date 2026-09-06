import { compare } from "bcryptjs";
import { findUserByFamilyName } from "@/lib/users";
import { findMemberByPassword } from "@/lib/members";
import { authEmailForAccount, isSupabaseLoginEnabled, supabaseVerifyPassword } from "@/lib/auth-users";
import { isSoftDeleted } from "@/lib/retention";
import type { TreeRole, User } from "@/types/user";

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

  /*
   * SİLİNMEKTE OLAN HESABA GİRİLEMEZ (`lib/retention.ts`).
   *
   * Bekleme süresi verinin durması içindir, hesabın çalışmaya devam etmesi
   * için değil: "hesabımı sildim" diyen biri hâlâ girebiliyorsa silme
   * yapılmamış demektir. Kapı burada, çünkü web (`auth.ts`) ve mobil
   * (`/api/mobile/login`) doğrulamayı bu tek işlevden geçiriyor — rota başına
   * eklenseydi biri unutulurdu.
   *
   * ÜYELER DE GİREMEZ: aşağıdaki üye yolu da bu erken dönüşün arkasında.
   * Hesap beklemedeyken davetlisinin girebilmesi, ağacı sahibi olmadan
   * yaşatmak olurdu.
   *
   * Geri alma yolu ayrı ve yine şifreye bağlı: `POST /api/account/restore`.
   */
  if (isSoftDeleted(user)) return null;

  const founderSession: SessionUser = {
    id: user.id,
    name: user.familyName,
    role: "yonetici",
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

/**
 * Founder'ın şifresini doğrular — OTURUM AÇMAZ, üye şifrelerine BAKMAZ.
 *
 * İki ayrı iş için var:
 *  · geri alma (`/api/account/restore`) — hesap beklemede olduğu için
 *    `verifyLogin` bilerek `null` dönüyor, ama kimliği yine de kanıtlamak
 *    gerek;
 *  · silme teyidi (`/api/account/delete`) — oturum zaten var; sorulan şey
 *    "klavyenin başındaki gerçekten hesap sahibi mi".
 *
 * Üye şifresi KABUL EDİLMEZ: davetli bir `viewer`, ağacın tamamını silme ya
 * da geri getirme kararını veremez.
 */
export async function verifyFounderPassword(
  user: Pick<User, "id" | "passwordHash">,
  password: string
): Promise<boolean> {
  if (!password || !user?.passwordHash) return false;
  if (isSupabaseLoginEnabled()) {
    if (await supabaseVerifyPassword(authEmailForAccount(user.id), password)) return true;
  }
  return compare(password, user.passwordHash);
}
