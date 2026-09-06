import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { verifyMobileToken } from "@/lib/mobile-token";
import { accessibleTreeIds, hasTreeAccess } from "@/lib/trees";
import { isAccountDeleted } from "@/lib/users";
import type { TreeRole } from "@/types/user";

/** Aktif ağaç kimliğini taşıyan çerez. */
export const ACTIVE_TREE_COOKIE = "soyagaci_tree";
/** Mobil: aktif ağacı seçen başlık (çoklu ağaçta çerez yerine). */
export const ACTIVE_TREE_HEADER = "x-tree-id";

export type TreeContext =
  | { ok: false; status: number }
  | {
      ok: true;
      accountId: string;
      treeId: string;
      role: TreeRole;
      isFounder: boolean;
      /**
       * Bu değişikliği YAPAN kişinin kimliği — katkı akışı için.
       *
       * Davetli üyede kendi üye kimliği, kurucuda ağacın kimliği.
       * `accountId`den ayrı olması şart: o "hangi ağaç" sorusunun yanıtı ve
       * bir ağaçtaki HERKES için aynı. Kaydetmeleri onunla imzaladığımız
       * sürece katkı akışı kimseyi adlandıramıyor, iki farklı üyenin
       * düzenlemesi veride de ayırt edilemiyordu.
       */
      authorId: string;
    };

/**
 * Oturumu iki kaynaktan çözer: önce `Authorization: Bearer` (native mobil jeton),
 * yoksa NextAuth çerez oturumu (web). Böylece tüm API rotaları hem web hem mobil
 * için çalışır — rota başına değişiklik gerekmez.
 */
async function resolveSessionUser(): Promise<{
  id: string;
  isFounder: boolean;
  role: TreeRole;
  memberId?: string;
} | null> {
  const h = await headers();
  const authz = h.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const claims = await verifyMobileToken(authz.slice(7).trim());
    if (claims)
      return {
        id: claims.sub,
        isFounder: claims.isFounder,
        role: claims.role,
        memberId: claims.memberId,
      };
    return null; // geçersiz jeton → doğrudan reddet (çerezle karışmasın)
  }
  const session = await auth();
  if (session?.user?.id) {
    return {
      id: session.user.id,
      isFounder: session.user.isFounder ?? true,
      role: (session.user.role as TreeRole | undefined) ?? "admin",
      memberId: session.user.memberId,
    };
  }
  return null;
}

/**
 * Aktif ağaç + rol çözümü (çoklu ağaç). Founder değilse (davetli üye) daima
 * giriş yaptığı ağaç ve kendi rolü. Founder ise çerezdeki ağaç, YALNIZ sahip
 * olduğu ağaçlardan biriyse (yetki denetimi); değilse ana ağaç. Founder sahip
 * olduğu her ağacın adminidir.
 */
export async function resolveActiveTree(): Promise<TreeContext> {
  const sessionUser = await resolveSessionUser();
  if (!sessionUser) return { ok: false, status: 401 };

  const accountId = sessionUser.id;

  /*
   * SİLİNMEKTE OLAN HESABIN OTURUMU DA ÇÖZÜLMEZ.
   *
   * Girişi kapatmak (`lib/credentials.ts`) tek başına yetmiyor: silmeden
   * önce verilmiş NextAuth çerezi ve mobil JWT günlerce geçerli kalıyor ve
   * ikisi de geri çağrılamıyor. Bu satır olmasaydı "hesabımı sildim" diyen
   * kullanıcı, açık sekmesinden uygulamayı kullanmaya devam ederdi.
   *
   * Bedeli her istekte bir hesap listesi okuması olurdu; `isAccountDeleted`
   * bu yüzden birkaç saniyelik bir önbellek tutuyor (`lib/users.ts`).
   */
  if (await isAccountDeleted(accountId)) return { ok: false, status: 401 };

  const isFounder = sessionUser.isFounder;
  const homeRole = sessionUser.role;
  // Kurucuda üye kimliği yok; ağacın kimliği onu temsil eder.
  const authorId = sessionUser.memberId ?? accountId;

  if (!isFounder) {
    return { ok: true, accountId, treeId: accountId, role: homeRole, isFounder: false, authorId };
  }

  // Aktif ağaç seçimi: mobil `x-tree-id` başlığı, yoksa web çerezi.
  const h = await headers();
  const cookieVal = h.get(ACTIVE_TREE_HEADER)?.trim() || (await cookies()).get(ACTIVE_TREE_COOKIE)?.value;
  if (cookieVal && cookieVal !== accountId) {
    const owned = await accessibleTreeIds(accountId);
    if (hasTreeAccess(accountId, cookieVal, owned)) {
      return { ok: true, accountId, treeId: cookieVal, role: "admin", isFounder: true, authorId };
    }
  }
  return { ok: true, accountId, treeId: accountId, role: homeRole, isFounder: true, authorId };
}
