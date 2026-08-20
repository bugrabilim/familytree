/**
 * Mobil-yerel Person tipi — web `types/family.ts` ile hizalı ama bağımsız
 * (mobil kendi araç zincirinde derlenir, web tiplerini içe aktaramaz).
 * Görüntü için gereken alt kümeyi taşır; sunucu ham veriyi döndürür.
 */
export type Gender = "male" | "female" | "other" | "unknown";

export interface Person {
  id: string;
  code?: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  nickname?: string;
  patronymic?: string;
  orientation?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  burialPlace?: string;
  photo?: string;
  bio?: string;
  occupation?: string;
  education?: string;
  religion?: string;
  ethnicity?: string;
  nationality?: string;
  language?: string;
  parentIds: string[];
  spouseIds: string[];
  formerSpouseIds?: string[];
  confidential?: boolean;
}

export interface FamilyData {
  people: Person[];
  updatedAt: string;
}
