import type { Association, Person } from "@/types/family";

/**
 * "Çevre" (aile-dışı yakınlar) yardımcıları — SAF, test edilebilir. Yalnız
 * `Person`/`Association` tür'lerini içe aktarır.
 *
 * Temel kural: `kind === "cevre"` olan kişiler soy ağacına/akrabalık motoruna
 * KATILMAZ. Bu modül, üye/çevre ayrımını ve iki yönlü çevre bağı çözümünü tek
 * yerde toplar; böylece her yerde tutarlı süzgeç uygulanır.
 */

export function isAssociate(p: Person): boolean {
  return p.kind === "cevre";
}

export function isMember(p: Person): boolean {
  return p.kind !== "cevre";
}

/** Yalnız aile üyeleri (soy ağacı/istatistik/kitap için). */
export function familyMembers(people: Person[]): Person[] {
  return people.filter(isMember);
}

/** Yalnız çevre kişileri. */
export function onlyAssociates(people: Person[]): Person[] {
  return people.filter(isAssociate);
}

export interface ResolvedAssociation {
  person: Person;
  type: string;
  note?: string;
  /** Bağ karşı taraftan mı geliyor (kişinin kendi listesinde değil)? */
  incoming: boolean;
}

/**
 * Bir kişinin TÜM çevre bağlarını iki yönlü çözer: kendi `associations`
 * listesindekiler + başka kişilerin bu kişiye işaret eden bağları. Sonuç, kişi
 * kimliğine göre benzersizdir (kişinin kendi kaydı önceliklidir).
 */
export function resolveAssociations(person: Person, people: Person[]): ResolvedAssociation[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const out = new Map<string, ResolvedAssociation>();

  // Kişinin kendi bağları (giden)
  for (const a of person.associations ?? []) {
    const other = byId.get(a.personId);
    if (!other || other.id === person.id) continue;
    out.set(other.id, { person: other, type: a.type, note: a.note, incoming: false });
  }
  // Başkalarının bu kişiye işaret eden bağları (gelen) — kendi kaydı yoksa ekle
  for (const p of people) {
    if (p.id === person.id) continue;
    for (const a of p.associations ?? []) {
      if (a.personId !== person.id) continue;
      if (out.has(p.id)) continue; // kendi listesindeki öncelikli
      out.set(p.id, { person: p, type: a.type, note: a.note, incoming: true });
    }
  }
  return [...out.values()];
}

/** Geçerli (var olan bir kişiye işaret eden) çevre bağlarını süzer. */
export function sanitizeAssociations(associations: Association[] | undefined, ids: Set<string>): Association[] {
  if (!associations) return [];
  return associations.filter((a) => a.personId && ids.has(a.personId));
}
