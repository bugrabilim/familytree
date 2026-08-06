import { put, list } from "@vercel/blob";
import type { FamilyData } from "@/types/family";

const BLOB_PATHNAME = "family-data.json";

export async function getFamilyData(): Promise<FamilyData> {
  try {
    const { blobs } = await list({ prefix: BLOB_PATHNAME });
    if (blobs.length === 0) {
      return { people: [], updatedAt: new Date().toISOString() };
    }

    const latestBlob = blobs.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];

    const res = await fetch(latestBlob.url, { cache: "no-store" });
    return await res.json();
  } catch {
    return { people: [], updatedAt: new Date().toISOString() };
  }
}

export async function saveFamilyData(data: FamilyData): Promise<void> {
  data.updatedAt = new Date().toISOString();
  await put(BLOB_PATHNAME, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}
