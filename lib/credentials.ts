import { compare } from "bcryptjs";
import { findUserByFamilyName } from "@/lib/users";
import { findMemberByPassword, findMemberByUsername } from "@/lib/members";
import { authEmailForAccount, isSupabaseLoginEnabled, supabaseVerifyPassword } from "@/lib/auth-users";
import { isSoftDeleted } from "@/lib/retention";
import type { TreeRole, User } from "@/types/user";

/**
 * Bulunamayan kullanıcı adı için de bir bcrypt çalıştır — ZAMAN SIZINTISINA
 * karşı.
 *
 * Ad yoksa hemen `null` dönmek, "bu ad yok" yanıtını ölçülebilir biçimde
 * hızlandırır; dışarıdan biri hangi adların var olduğunu yalnız yanıt
 * süresine bakarak sayabilirdi. Özet gerçek bir bcrypt özeti (12 tur) ama
 * hiçbir hesaba ait değil.
 */
const SAHTE_OZET = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.CjR7SD.eaVFQBKQfxYBQAaVIL9L1Cbe";
async function bedeliOde(password: string): Promise<void> {
  try { await compare(password || "x", SAHTE_OZET); } catch { /* süre yakıldı, yeter */ }
}

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
 * Ağaç adı + şifre (+ isteğe bağlı kullanıcı adı) doğrular.
 *
 * Sıra: kullanıcı adı verildiyse YALNIZ o üye; verilmediyse (bayrak açıksa)
 * Supabase Auth → bcrypt (kurucu) → adsız üyeler arasında şifre eşleşmesi.
 * Web `authorize()` ve mobil `/api/mobile/login` bunu paylaşır — tek kaynak.
 * Doğrulama başarısızsa `null`.
 */
export async function verifyLogin(
  familyName: string,
  password: string,
  /**
   * Üyenin giriş adı (madde 36). Verildiğinde KURUCU YOLU HİÇ DENENMİYOR:
   * kurucunun kullanıcı adı yok, dolayısıyla ad yazıp kurucu şifresiyle
   * girilebilseydi ad bir kimlik değil, göz ardı edilen bir süs olurdu.
   */
  username?: string
): Promise<SessionUser | null> {
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

  const uyeAdi = (username ?? "").trim();
  if (uyeAdi) {
    /*
     * ADLA GİRİŞ. Kimlik adla çözülüyor, şifre YALNIZ o üyenin özetiyle
     * karşılaştırılıyor — eski yol her üye için bir bcrypt çalıştırıyordu
     * ve maliyeti ağacın üye sayısıyla büyüyordu.
     *
     * Ad bulunamadığında da bir bcrypt yürütülüyor (`bedeliOde`): yoksa
     * "böyle bir kullanıcı yok" yanıtı ölçülebilir biçimde hızlı döner ve
     * dışarıdan biri, hangi adların var olduğunu yalnız SÜREYE bakarak
     * çıkarabilirdi.
     */
    const member = await findMemberByUsername(user.id, uyeAdi);
    if (!member) {
      await bedeliOde(password);
      return null;
    }
    if (!(await compare(password, member.passwordHash))) return null;
    return {
      id: user.id,
      memberId: member.id,
      name: member.displayName,
      role: member.role,
      treeName: user.familyName,
      isFounder: false,
    };
  }

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
