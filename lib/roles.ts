import type { TreeRole } from "../types/user";

/**
 * Rol hiyerarşisi — saf, test edilebilir. Sunucu tarafı yetki denetimleri
 * bunu kullanır (istemci yalnızca gösterim; asıl kapı API'de).
 */
const ORDER: TreeRole[] = ["viewer", "editor", "admin"];

/** `role`, en az `min` yetkisine sahip mi? Bilinmeyen/rolsüz → false. */
export function roleAtLeast(role: TreeRole | undefined | null, min: TreeRole): boolean {
  if (!role) return false;
  const r = ORDER.indexOf(role);
  const m = ORDER.indexOf(min);
  return r >= 0 && m >= 0 && r >= m;
}

/** Değiştirme (ekle/düzenle/sil) yetkisi: editor ve üstü. */
export function canEdit(role: TreeRole | undefined | null): boolean {
  return roleAtLeast(role, "editor");
}

/** Üye/davet yönetimi: yalnızca admin. */
export function canManage(role: TreeRole | undefined | null): boolean {
  return roleAtLeast(role, "admin");
}
