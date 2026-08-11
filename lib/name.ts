import type { Person } from "@/types/family";

type NameParts = Pick<Person, "firstName" | "lastName"> &
  Partial<Pick<Person, "nickname" | "patronymic">>;

/**
 * Kartın üst satırı. Soyadsız (eski) kayıtlarda baba adı önce gelir:
 * "Mehmet oğlu Hüseyin". Lakap da addan önce: "Topal Süleyman",
 * "Turgud oğlu Halıcı Ahmet". Ad boşsa (yeni kayıt) "İsimsiz".
 */
export function primaryName(p: NameParts): string {
  const parts: string[] = [];
  // Baba adı yalnızca resmî soyad yoksa (adın önünde) gösterilir
  if (!p.lastName?.trim() && p.patronymic?.trim()) parts.push(p.patronymic.trim());
  if (p.nickname?.trim()) parts.push(p.nickname.trim());
  parts.push(p.firstName?.trim() || "İsimsiz");
  return parts.join(" ");
}

/**
 * Kartın alt satırı: resmî soyad. Soyadsız (patronim) kayıtlarda baba adı
 * üst satıra taşındığından burası boştur.
 */
export function secondaryName(p: NameParts): string {
  return p.lastName?.trim() || "";
}

/** Tam ad — arama, başlık ve tek satırlık gösterim için. */
export function fullName(p: NameParts): string {
  const alt = secondaryName(p);
  const ust = primaryName(p);
  return alt ? `${ust} ${alt}` : ust;
}
