/**
 * Saf çoklu-ağaç yetki mantığı — `@/` değer içe aktarımı YOK, böylece
 * `tests/trees.test.mts` bunu doğrudan (node --experimental-strip-types)
 * içe aktarıp sınayabilir. Değer bağımlılığı olan kayıt işlemleri `lib/trees.ts`de.
 */

import type { ShareLink, TreeAccess } from "@/types/user";

export interface TreeMeta {
  treeId: string;
  name: string;
  createdAt: string;
}

/**
 * Founder'ın bir ağaca erişimi var mı? Ana ağaç (treeId === accountId) daima
 * erişilebilir; sonradan oluşturulan ağaçlar `ownedIds` içinde olmalı.
 * SAF: yetki denetimi bununla yapılır.
 */
export function hasTreeAccess(accountId: string, treeId: string, ownedIds: string[]): boolean {
  return treeId === accountId || ownedIds.includes(treeId);
}

/* ── Erişim kaydı normalleştirme (saf) ─────────────────────────────────────
 * Blob'dan okunan erişim kaydını tamamlar. Buradaki en kritik kural:
 * `shares` ASLA DÜŞÜRÜLMEZ. Eskiden bu alan normalleştirmede yeniden kurulan
 * nesneye konmuyordu; `shares` tipte OPSİYONEL olduğu için TypeScript de
 * uyarmıyordu. Sonuç: her okumada tüm paylaşım bağlantıları kayboluyor,
 * `/g/<jeton>` "Bağlantı geçersiz" diyor ve yeni paylaşım eskileri siliyordu.
 * ------------------------------------------------------------------------ */

/** Okunan erişim kaydını eksiksiz hâle getirir (alan DÜŞÜRMEZ). */
export function normalizeAccess(data: TreeAccess): TreeAccess {
  return {
    members: data.members ?? [],
    invites: data.invites ?? [],
    share: data.share ?? null,
    shares: data.shares ?? [],
    pairings: data.pairings ?? [],
    pairInvites: data.pairInvites ?? [],
  };
}

/**
 * Paylaşım bağlantılarını tek listede toplar: çoklu `shares` + (varsa) eski
 * tekil `share` (geri uyumluluk). Eski kayıt listede yoksa başa eklenir.
 */
export function normalizeShares(
  data: { share?: ShareLink | null; shares?: ShareLink[] }
): ShareLink[] {
  const list = Array.isArray(data.shares) ? [...data.shares] : [];
  if (data.share && !list.some((s) => s.token === data.share!.token)) {
    const legacy = data.share;
    list.unshift({ ...legacy, id: legacy.id ?? `legacy-${legacy.token.slice(-8)}` });
  }
  return list;
}
