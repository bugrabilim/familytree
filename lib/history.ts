import { put, list, get } from "@vercel/blob";
import type { Person } from "@/types/family";

/**
 * Güncelleme günlüğü (geri alma). Her kaydetmeden ÖNCEki durum, ayrı bir
 * geçmiş blob'una (`family-history-<treeId>.json`) anlık görüntü olarak eklenir.
 * Kullanıcı bir hatadan sonra tarihe göre önceki bir duruma dönebilir.
 *
 * Anlık görüntüler tam kişi listesini taşır (basit ve güvenilir); en yeni MAX
 * tanesi tutulur. Büyük ağaçlarda blob'u şişirmemek için sınır düşük.
 */

const MAX_SNAPSHOTS = 15;

function historyPath(treeId: string) {
  return `family-history-${treeId}.json`;
}

interface Snapshot {
  id: string;
  at: string;
  people: Person[];
  /**
   * Bu anlık görüntünün ÜZERİNE yazan değişikliği kimin yaptığı.
   *
   * Kafa karıştırıcı ama tutarlı: bir anlık görüntü, bir kaydetmeden ÖNCEKİ
   * durumu tutar. Dolayısıyla `by`, o görüntüyü bir sonrakine (ya da en
   * yenisi için canlı veriye) dönüştüren kişidir. Katkı akışı iki komşu
   * görüntüyü karşılaştırırken yazarı buradan okur.
   */
  by?: string;
}
interface HistoryFile {
  snapshots: Snapshot[];
}

/** Geri yüklemede listelenen özet (kişi listesi taşınmaz). */
export interface HistoryEntry {
  id: string;
  at: string;
  count: number;
  by?: string;
}

async function readHistory(treeId: string): Promise<HistoryFile> {
  try {
    const { blobs } = await list({ prefix: historyPath(treeId) });
    if (blobs.length === 0) return { snapshots: [] };
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    const result = await get(latest.pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return { snapshots: [] };
    const parsed = JSON.parse(await new Response(result.stream).text()) as HistoryFile;
    return Array.isArray(parsed.snapshots) ? parsed : { snapshots: [] };
  } catch {
    return { snapshots: [] };
  }
}

async function writeHistory(treeId: string, file: HistoryFile): Promise<void> {
  await put(historyPath(treeId), JSON.stringify(file), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Bir anlık görüntüyü günlüğe ekler (en yeni başa; MAX ile sınırlı). */
export async function pushHistorySnapshot(
  treeId: string,
  people: Person[],
  by?: string
): Promise<void> {
  const file = await readHistory(treeId);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  file.snapshots.unshift({ id, at: new Date().toISOString(), people, by });
  if (file.snapshots.length > MAX_SNAPSHOTS) file.snapshots.length = MAX_SNAPSHOTS;
  await writeHistory(treeId, file);
}

/** Günlüğü özet olarak listeler (en yeni önce). */
export async function listHistorySnapshots(treeId: string): Promise<HistoryEntry[]> {
  const file = await readHistory(treeId);
  return file.snapshots.map((s) => ({ id: s.id, at: s.at, count: s.people.length, by: s.by }));
}

/** Belirli bir anlık görüntünün kişi listesini döndürür (yoksa null). */
export async function getHistorySnapshot(treeId: string, id: string): Promise<Person[] | null> {
  const file = await readHistory(treeId);
  const s = file.snapshots.find((x) => x.id === id);
  return s ? s.people : null;
}

/**
 * Katkı akışı için: kişi listeleriyle BİRLİKTE anlık görüntüler (en yeni önce).
 *
 * `listHistorySnapshots` bilerek kişi listesi taşımaz (geri yükleme ekranı
 * için özet yeter). Akış ise iki komşu görüntüyü karşılaştırmak zorunda, o
 * yüzden ayrı bir okuma yolu var — ve `limit` ile sınırlı, çünkü tüm günlüğü
 * belleğe almak gereksiz.
 */
export async function readSnapshotsForActivity(
  treeId: string,
  limit: number
): Promise<Array<{ id: string; at: string; by?: string; people: Person[] }>> {
  const file = await readHistory(treeId);
  return file.snapshots.slice(0, Math.max(0, limit));
}
