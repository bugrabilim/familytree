import { put, list, get } from "@vercel/blob";
import type { FamilyData } from "@/types/family";

function blobPathname(userId: string) {
  return `family-data-${userId}.json`;
}

export async function getFamilyData(userId: string): Promise<FamilyData> {
  try {
    const key = blobPathname(userId);
    const { blobs } = await list({ prefix: key });
    if (blobs.length === 0) return { people: [], updatedAt: new Date().toISOString() };
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    const result = await get(latest.pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return { people: [], updatedAt: new Date().toISOString() };
    return await new Response(result.stream).json();
  } catch {
    return { people: [], updatedAt: new Date().toISOString() };
  }
}

export async function saveFamilyData(userId: string, data: FamilyData): Promise<void> {
  data.updatedAt = new Date().toISOString();
  await put(blobPathname(userId), JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
