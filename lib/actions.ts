import type { Association, Gender, LifeEvent, Memory, ParentLink, Person, Source } from "@/types/family";

export type RelationType = "parent" | "child" | "spouse" | "sibling" | "associate";

export const RELATION_LABELS: Record<RelationType, { title: string; verb: string }> = {
  parent: { title: "Ebeveyn ekle", verb: "ebeveyni" },
  child: { title: "Çocuk ekle", verb: "çocuğu" },
  spouse: { title: "Eş ekle", verb: "eşi" },
  sibling: { title: "Kardeş ekle", verb: "kardeşi" },
  associate: { title: "Yakın çevre ekle", verb: "yakını" },
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
  education?: string;
  congenitalCondition?: string;
  healthCondition?: string;
  deathCause?: string;
  burialPlace?: string;
  /** null = konumu temizle; undefined = değiştirme; nesne = ayarla. */
  burialCoords?: { lat: number; lng: number } | null;
  photo?: string;
  photos?: string[];
  videos?: string[];
  documents?: string[];
  bio?: string;
  events?: LifeEvent[];
  sources?: Source[];
  memories?: Memory[];
  kind?: "uye" | "cevre";
  associations?: Association[];
  confidential?: boolean;
  privateFields?: string[];
  parentIds?: string[];
  parentLinks?: Record<string, ParentLink>;
  spouseIds?: string[];
  formerSpouseIds?: string[];
  /** `associate` bağında yeni kişi çevre (aile-dışı yakın) olur; `assocType`
   *  bağ türünü (arkadas, komsu…) belirler, verilmezse `arkadas`. */
  relation?: { type: RelationType; targetId: string; assocType?: string };
}

/* Madde 9 — İyimser kilitleme (istemci tarafı).
   Workspace, sunucudan gelen güncel sürümü (`updatedAt`) buraya bildirir;
   her değiştirme isteği bu sürümü `x-base-version` başlığıyla taşır. Sunucu
   sürüm uyuşmazsa 409 döner ve `parseError` mesajı kullanıcıya gösterilir. */
let baseVersion: string | null = null;

export function setBaseVersion(version: string | null): void {
  baseVersion = version;
}

function mutationHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = json ? { "Content-Type": "application/json" } : {};
  if (baseVersion) h["x-base-version"] = baseVersion;
  return h;
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
    headers: mutationHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Kişi eklenemedi."));
  return res.json();
}

export async function updatePerson(id: string, payload: PersonPayload): Promise<Person> {
  const res = await fetch(`/api/family/person/${id}`, {
    method: "PUT",
    headers: mutationHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Kişi güncellenemedi."));
  return res.json();
}

export async function deletePerson(id: string): Promise<void> {
  const res = await fetch(`/api/family/person/${id}`, {
    method: "DELETE",
    headers: mutationHeaders(false),
  });
  if (!res.ok) throw new Error(await parseError(res, "Kişi silinemedi."));
}

/** Kardeş grubunun yeni sırasını (id listesi) sunucuya bildirir. */
export async function reorderSiblings(ids: string[]): Promise<void> {
  const res = await fetch("/api/family/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Sıra güncellenemedi."));
}

export async function uploadPhoto(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Fotoğraf yüklenemedi."));
  const { url } = await res.json();
  return url;
}

export async function uploadAudio(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "audio");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Ses yüklenemedi."));
  const { url } = await res.json();
  return url;
}

export async function uploadVideo(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "video");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Video yüklenemedi."));
  const { url } = await res.json();
  return url;
}

export async function uploadDocument(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", "document");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res, "Belge yüklenemedi."));
  const { url } = await res.json();
  return url;
}
