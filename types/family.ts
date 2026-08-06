export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  gender: "male" | "female" | "unknown";
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  photo?: string;
  bio?: string;
  parentIds: string[];
  spouseIds: string[];
}

export interface FamilyData {
  people: Person[];
  updatedAt: string;
}
