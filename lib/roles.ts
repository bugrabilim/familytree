import type { TreeRole } from "../types/user";

/**
 * Rol hiyerarşisi — saf, test edilebilir. Sunucu tarafı yetki denetimleri
 * bunu kullanır (istemci yalnızca gösterim; asıl kapı API'de).
 */
const ORDER: TreeRole[] = ["viewer", "contributor", "editor", "admin"];

/** `role`, en az `min` yetkisine sahip mi? Bilinmeyen/rolsüz → false. */
export function roleAtLeast(role: TreeRole | undefined | null, min: TreeRole): boolean {
  if (!role) return false;
  const r = ORDER.indexOf(role);
  const m = ORDER.indexOf(min);
  return r >= 0 && m >= 0 && r >= m;
}

/**
 * EKLEME yetkisi: contributor ve üstü.
 *
 * `canEdit`ten AYRI durması bilinçli. Tek bir "yazma" kapısı olsaydı, katkı
 * vericiye kişi eklettirmek istediğimiz anda ona toplu silmeyi, ağacı
 * temizlemeyi ve başkasının kaydını değiştirmeyi de açmış olurduk — hepsi
 * aynı kapıdan geçiyor. İki ayrı soru, iki ayrı işlev:
 *
 *   canContribute → "yeni bir şey ekleyebilir mi?"
 *   canEdit       → "VAR OLANI değiştirebilir/silebilir mi?"
 *
 * Uçların çoğu `canEdit`te KALDI; katkı vericiye açılanlar tek tek seçildi.
 */
export function canContribute(role: TreeRole | undefined | null): boolean {
  return roleAtLeast(role, "contributor");
}

/**
 * Var olanı değiştirme/silme yetkisi: editor ve üstü.
 *
 * Katkı verici buradan GEÇEMEZ — onun yolu değişiklik önerisi
 * (madde 35'in ikinci parçası).
 */
export function canEdit(role: TreeRole | undefined | null): boolean {
  return roleAtLeast(role, "editor");
}

/** Üye/davet yönetimi: yalnızca admin. */
export function canManage(role: TreeRole | undefined | null): boolean {
  return roleAtLeast(role, "admin");
}
