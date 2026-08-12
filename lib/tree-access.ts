/**
 * Saf çoklu-ağaç yetki mantığı — `@/` değer içe aktarımı YOK, böylece
 * `tests/trees.test.mts` bunu doğrudan (node --experimental-strip-types)
 * içe aktarıp sınayabilir. Değer bağımlılığı olan kayıt işlemleri `lib/trees.ts`de.
 */

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
