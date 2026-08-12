import { cookies } from "next/headers";
import { auth } from "@/auth";
import { accessibleTreeIds, hasTreeAccess } from "@/lib/trees";
import type { TreeRole } from "@/types/user";

/** Aktif ağaç kimliğini taşıyan çerez. */
export const ACTIVE_TREE_COOKIE = "soyagaci_tree";

export type TreeContext =
  | { ok: false; status: number }
  | { ok: true; accountId: string; treeId: string; role: TreeRole; isFounder: boolean };

/**
 * Aktif ağaç + rol çözümü (çoklu ağaç). Founder değilse (davetli üye) daima
 * giriş yaptığı ağaç ve kendi rolü. Founder ise çerezdeki ağaç, YALNIZ sahip
 * olduğu ağaçlardan biriyse (yetki denetimi); değilse ana ağaç. Founder sahip
 * olduğu her ağacın adminidir.
 */
export async function resolveActiveTree(): Promise<TreeContext> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, status: 401 };

  const accountId = session.user.id;
  const isFounder = session.user.isFounder ?? true;
  const homeRole = (session.user.role as TreeRole | undefined) ?? "admin";

  if (!isFounder) {
    return { ok: true, accountId, treeId: accountId, role: homeRole, isFounder: false };
  }

  const cookieVal = (await cookies()).get(ACTIVE_TREE_COOKIE)?.value;
  if (cookieVal && cookieVal !== accountId) {
    const owned = await accessibleTreeIds(accountId);
    if (hasTreeAccess(accountId, cookieVal, owned)) {
      return { ok: true, accountId, treeId: cookieVal, role: "admin", isFounder: true };
    }
  }
  return { ok: true, accountId, treeId: accountId, role: homeRole, isFounder: true };
}
