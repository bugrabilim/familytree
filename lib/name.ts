import type { Person } from "@/types/family";

type NameParts = Pick<Person, "firstName" | "lastName"> &
  Partial<Pick<Person, "nickname" | "patronymic">>;

/**
 * Kartın üst satırı: varsa lakap + ad. "Topal Mehmed".
 * Ad boşsa (yeni kayıt) "İsimsiz".
 */
export function primaryName(p: NameParts): string {
  const lakap = p.nickname?.trim();
  const ad = p.firstName?.trim() || "İsimsiz";
  return lakap ? `${lakap} ${ad}` : ad;
}

/**
 * Kartın alt satırı: resmî soyad, yoksa baba adı (patronim), yoksa boş.
 * Soyadı Kanunu öncesi kayıtlarda soyad yerine "Şaban oğlu" gösterilir.
 */
export function secondaryName(p: NameParts): string {
  return p.lastName?.trim() || p.patronymic?.trim() || "";
}

/** Tam ad — arama, başlık ve tek satırlık gösterim için. */
export function fullName(p: NameParts): string {
  const alt = secondaryName(p);
  const ust = primaryName(p);
  return alt ? `${ust} ${alt}` : ust;
}
