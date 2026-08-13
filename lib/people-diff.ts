import type { Person } from "@/types/family";

/**
 * Saf fark hesabı — `@/` DEĞER içe aktarımı yok, böylece test edilebilir.
 *
 * İki kişi listesini karşılaştırır: kimlik bazlı olarak değişen/yeni olanlar
 * (upsert edilecek) ve silinenler (id). İçerik farkı JSON string
 * karşılaştırmasıyla bulunur. Yanlış-pozitif (aynı içerik, farklı anahtar
 * sırası) yalnız gereksiz bir upsert'e yol açar — zararsız.
 */
export function diffPeople(
  oldPeople: Person[],
  newPeople: Person[]
): { changed: Person[]; removed: string[] } {
  const oldById = new Map(oldPeople.map((p) => [p.id, JSON.stringify(p)]));
  const newIds = new Set<string>();
  const changed: Person[] = [];
  for (const p of newPeople) {
    newIds.add(p.id);
    if (oldById.get(p.id) !== JSON.stringify(p)) changed.push(p);
  }
  const removed: string[] = [];
  for (const p of oldPeople) if (!newIds.has(p.id)) removed.push(p.id);
  return { changed, removed };
}
