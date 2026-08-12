import type { Gender, LifeEvent, ParentLink, Person, Source } from "@/types/family";

export type RelationType = "parent" | "child" | "spouse" | "sibling";

export const RELATION_LABELS: Record<RelationType, { title: string; verb: string }> = {
  parent: { title: "Ebeveyn ekle", verb: "ebeveyni" },
  child: { title: "Çocuk ekle", verb: "çocuğu" },
  spouse: { title: "Eş ekle", verb: "eşi" },
  sibling: { title: "Kardeş ekle", verb: "kardeşi" },
};

export interface PersonPayload {
  firstName: string;
  lastName: string;
  gender: Gender;
  nickname?: string;
  patronymic?: string;
  orientation?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  religion?: string;
  denomination?: string;
  language?: string;
  ethnicity?: string;
  nationality?: string;
  occupation?: string;
  congenitalCondition?: string;
  healthCondition?: string;
  deathCause?: string;
  photo?: string;
  photos?: string[];
  bio?: string;
  events?: LifeEvent[];
  sources?: Source[];
  parentIds?: string[];
  parentLinks?: Record<string, ParentLink>;
  spouseIds?: string[];
  formerSpouseIds?: string[];
  relation?: { type: RelationType; targetId: string };
}

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function createPerson(payload: PersonPayload): Promise<Person> {
  const res = await fetch("/api/family/person", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Kişi eklenemedi."));
  return res.json();
}

export async function updatePerson(id: string, payload: PersonPayload): Promise<Person> {
  const res = await fetch(`/api/family/person/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Kişi güncellenemedi."));
  return res.json();
}

export async function deletePerson(id: string): Promise<void> {
  const res = await fetch(`/api/family/person/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res, "Kişi silinemedi."));
}

export async function uploadPhoto(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Fotoğraf yüklenemedi."));
  const { url } = await res.json();
  return url;
}
