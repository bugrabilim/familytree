import { put, list, get } from "@vercel/blob";
import type { FamilyData } from "@/types/family";
import { dbReplacePeople } from "@/lib/db";

function blobPathname(userId: string) {
  return `family-data-${userId}.json`;
}

/* ----------------------------------------------------------------------
 * Madde 10 — Kısa ömürlü bellek içi önbellek.
 *
 * Tüm veri tek bir JSON dosyası; her istekte tümünü indirmek/yazmak, ağaç
 * büyüdükçe pahalılaşıyor. Sıcak (warm) bir sunucusuz örnekte ardışık
 * okumalar dosyayı tekrar tekrar indirmesin diye küçük bir TTL önbelleği
 * tutuyoruz. Önbellek, JSON dizisi olarak saklanır: her okuma taze bir nesne
 * ayrıştırır, böylece çağıranın nesneyi değiştirmesi önbelleği bozamaz.
 *
 * Yazma yolları (POST/PUT/DELETE, import) `skipCache: true` ile taze okur:
 * `oku→değiştir→yaz` akışının bayat veriyle çalışıp bir başkasının
 * değişikliğini ezmesini istemiyoruz. Çakışma tespiti ise Madde 9'daki
 * sürüm (updatedAt) kontrolüyle yapılır.
 * -------------------------------------------------------------------- */
const CACHE_TTL_MS = 4000;
const cache = new Map<string, { json: string; at: number }>();

const emptyData = (): FamilyData => ({ people: [], updatedAt: new Date().toISOString() });

async function readFromBlob(userId: string): Promise<FamilyData> {
  const key = blobPathname(userId);
  const { blobs } = await list({ prefix: key });
  if (blobs.length === 0) return emptyData();
  const latest = blobs.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0];
  const result = await get(latest.pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return emptyData();
  const text = await new Response(result.stream).text();
  cache.set(userId, { json: text, at: Date.now() });
  return JSON.parse(text) as FamilyData;
}

/**
 * Sağlık kontrolü: Blob deposuna gerçekten ulaşılıyor mu? (sır sızdırmaz)
 *
 * Doğrudan bir `list()` çağrısı dener — token'ın env değişkeni ADINI tahmin
 * etmeye çalışmaz. Bu ortamdaki özelleştirilmiş `@vercel/blob`, kimlik
 * doğrulamayı `BLOB_READ_WRITE_TOKEN` dışında bir yolla çözebildiği için
 * (uygulama fiilen okuyup yazabiliyor) env-adı ön kontrolü yanlış negatif
 * veriyordu. Gerçek çağrı, yeteneği en doğru şekilde ölçer.
 */
export async function pingBlob(): Promise<{ ok: boolean; error?: string }> {
  try {
    await list({ limit: 1 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getFamilyData(
  userId: string,
  opts?: { skipCache?: boolean }
): Promise<FamilyData> {
  if (!opts?.skipCache) {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return JSON.parse(hit.json) as FamilyData;
    }
  }
  try {
    return await readFromBlob(userId);
  } catch {
    return emptyData();
  }
}

/* ----------------------------------------------------------------------
 * Madde 9 — İyimser kilitleme (optimistic locking).
 *
 * "Giriş yapan herkes düzenler" ve akış `oku→değiştir→yaz` olduğundan, iki
 * kişi aynı anda düzenlerse biri diğerinin değişikliğini eziyordu
 * (last-write-wins). İstemci, düzenlemeye başladığı sürümü (`updatedAt`)
 * `x-base-version` başlığıyla gönderir; sunucudaki güncel sürümle uyuşmuyorsa
 * yazma reddedilir (409) ve kullanıcıdan yenilemesi istenir.
 * -------------------------------------------------------------------- */
export function versionMismatch(
  req: { headers: { get(k: string): string | null } },
  current: string
): boolean {
  const base = req.headers.get("x-base-version");
  return !!base && base !== current;
}

export async function saveFamilyData(userId: string, data: FamilyData): Promise<void> {
  data.updatedAt = new Date().toISOString();
  const json = JSON.stringify(data);
  await put(blobPathname(userId), json, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  // Yazdıktan sonra önbelleği tazele: aynı örnekteki sonraki okumalar güncel.
  cache.set(userId, { json, at: Date.now() });

  // Faz 2c — çift-yazma (best-effort): Postgres'i de tazele. Blob kaynaktır;
  // Postgres yazması başarısız olursa kullanıcının kaydı ETKİLENMEZ (yalnız
  // uyarı loglanır). Okuma yolu Postgres'e çevrildiğinde bu tam-yenileme,
  // hedefli upsert'e dönüşecek.
  try {
    await dbReplacePeople(userId, data.people);
  } catch (e) {
    console.warn(`[cift-yazma] people→postgres (${userId}):`, (e as Error).message);
  }
}
