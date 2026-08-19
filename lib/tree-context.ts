import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { verifyMobileToken } from "@/lib/mobile-token";
import { accessibleTreeIds, hasTreeAccess } from "@/lib/trees";
import type { TreeRole } from "@/types/user";

/** Aktif ağaç kimliğini taşıyan çerez. */
export const ACTIVE_TREE_COOKIE = "soyagaci_tree";
/** Mobil: aktif ağacı seçen başlık (çoklu ağaçta çerez yerine). */
export const ACTIVE_TREE_HEADER = "x-tree-id";

export type TreeContext =
  | { ok: false; status: number }
  | { ok: true; accountId: string; treeId: string; role: TreeRole; isFounder: boolean };

/**
 * Oturumu iki kaynaktan çözer: önce `Authorization: Bearer` (native mobil jeton),
 * yoksa NextAuth çerez oturumu (web). Böylece tüm API rotaları hem web hem mobil
 * için çalışır — rota başına değişiklik gerekmez.
 */
async function resolveSessionUser(): Promise<{ id: string; isFounder: boolean; role: TreeRole } | null> {
  const h = await headers();
  const authz = h.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const claims = await verifyMobileToken(authz.slice(7).trim());
    if (claims) return { id: claims.sub, isFounder: claims.isFounder, role: claims.role };
    return null; // geçersiz jeton → doğrudan reddet (çerezle karışmasın)
  }
  const session = await auth();
  if (session?.user?.id) {
    return {
      id: session.user.id,
      isFounder: session.user.isFounder ?? true,
      role: (session.user.role as TreeRole | undefined) ?? "admin",
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
  const isFounder = sessionUser.isFounder;
  const homeRole = sessionUser.role;

  if (!isFounder) {
    return { ok: true, accountId, treeId: accountId, role: homeRole, isFounder: false };
  }

  // Aktif ağaç seçimi: mobil `x-tree-id` başlığı, yoksa web çerezi.
  const h = await headers();
  const cookieVal = h.get(ACTIVE_TREE_HEADER)?.trim() || (await cookies()).get(ACTIVE_TREE_COOKIE)?.value;
  if (cookieVal && cookieVal !== accountId) {
    const owned = await accessibleTreeIds(accountId);
    if (hasTreeAccess(accountId, cookieVal, owned)) {
      return { ok: true, accountId, treeId: cookieVal, role: "admin", isFounder: true };
    }
  }
  return { ok: true, accountId, treeId: accountId, role: homeRole, isFounder: true };
}
