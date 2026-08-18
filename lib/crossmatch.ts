import type { Person } from "@/types/family";

/**
 * İki AYRI ağaç arasında olası ortak kişileri (kesişim) bulur — P2.
 *
 * Kimlikler ağaçlar arasında anlamsız olduğundan eşleştirme AD + doğrulayıcıya
 * dayanır: aynı ad + (aynı doğum yılı ±1) ya da (ortak ebeveyn ADI) ya da
 * (ortak eş ADI). Saf mantık, test edilebilir.
 */

export interface CrossMatch {
  /** A ağacındaki kişi kimliği. */
  aId: string;
  /** B ağacındaki kişi kimliği. */
  bId: string;
  reason: "yearMatch" | "sharedParent" | "sharedSpouse";
}

function normName(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fullKey(p: Person): string {
  return `${normName(p.firstName)}|${normName(p.lastName)}`;
}

function birthYear(p: Person): number | null {
  const y = p.birthDate ? parseInt(p.birthDate.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) ? y : null;
}

/** Kişinin ebeveyn/eş adlarını (normalize) döndürür — ağaç-içi id çözümüyle. */
function relNames(p: Person, idx: Map<string, Person>, rel: "parents" | "spouses"): Set<string> {
  const ids =
    rel === "parents"
      ? p.parentIds ?? []
      : [...(p.spouseIds ?? []), ...(p.formerSpouseIds ?? [])];
  const names = new Set<string>();
  for (const id of ids) {
    const r = idx.get(id);
    if (r) {
      const n = normName(r.firstName);
      if (n) names.add(n);
    }
  }
  return names;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** A ve B ağaçları arasındaki olası ortak kişiler. */
export function findCrossMatches(peopleA: Person[], peopleB: Person[]): CrossMatch[] {
  const idxA = new Map(peopleA.map((p) => [p.id, p]));
  const idxB = new Map(peopleB.map((p) => [p.id, p]));

  // B'yi ad-anahtarına göre grupla.
  const bByName = new Map<string, Person[]>();
  for (const b of peopleB) {
    const key = fullKey(b);
    if (key === "|") continue;
    const arr = bByName.get(key);
    if (arr) arr.push(b);
    else bByName.set(key, [b]);
  }

  const matches: CrossMatch[] = [];
  const seen = new Set<string>();
  for (const a of peopleA) {
    const key = fullKey(a);
    if (key === "|") continue;
    const candidates = bByName.get(key);
    if (!candidates) continue;

    const ya = birthYear(a);
    let aParents: Set<string> | null = null;
    let aSpouses: Set<string> | null = null;

    for (const b of candidates) {
      const pairKey = `${a.id}|${b.id}`;
      if (seen.has(pairKey)) continue;

      const yb = birthYear(b);
      if (ya !== null && yb !== null && Math.abs(ya - yb) > 1) continue; // yıllar çelişiyor

      let reason: CrossMatch["reason"] | null = null;
      if (ya !== null && yb !== null) {
        reason = "yearMatch";
      } else {
        aParents ??= relNames(a, idxA, "parents");
        if (intersects(aParents, relNames(b, idxB, "parents"))) reason = "sharedParent";
        else {
          aSpouses ??= relNames(a, idxA, "spouses");
          if (intersects(aSpouses, relNames(b, idxB, "spouses"))) reason = "sharedSpouse";
        }
      }

      if (reason) {
        matches.push({ aId: a.id, bId: b.id, reason });
        seen.add(pairKey);
      }
    }
  }
  return matches;
}
