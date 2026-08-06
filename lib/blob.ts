import { put, list } from "@vercel/blob";
import type { FamilyData } from "@/types/family";

function pathname(userId: string) {
  return `family-data-${userId}.json`;
}

export async function getFamilyData(userId: string): Promise<FamilyData> {
  try {
    const key = pathname(userId);
    const { blobs } = await list({ prefix: key });
    if (blobs.length === 0) return { people: [], updatedAt: new Date().toISOString() };
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    const res = await fetch(latest.url, { cache: "no-store" });
    return await res.json();
  } catch {
    return { people: [], updatedAt: new Date().toISOString() };
  }
}

export async function saveFamilyData(userId: string, data: FamilyData): Promise<void> {
  data.updatedAt = new Date().toISOString();
  await put(pathname(userId), JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}
