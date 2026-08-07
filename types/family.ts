/**
 * `other` — ikili olmayan / interseks kimlikler için.
 * `unknown` — kaydı bilinmeyen eski kuşaklar için. İkisi ayrı şeylerdir.
 */
export type Gender = "male" | "female" | "other" | "unknown";

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  photo?: string;
  bio?: string;
  parentIds: string[];
  /** Süregelen evlilikler. Aynı anda birden fazla olabilir. */
  spouseIds: string[];
  /** Boşanmayla biten evlilikler. Ortak çocuklar `parentIds` üzerinden korunur. */
  formerSpouseIds?: string[];
}

export interface FamilyData {
  people: Person[];
  updatedAt: string;
}
