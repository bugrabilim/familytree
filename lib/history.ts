import { put, list, get } from "@vercel/blob";
import type { Person } from "@/types/family";
import {
  emptyHistory,
  parseHistory,
  pushSnapshot,
  snapshotById,
  snapshotsWithPeople,
  type HistoryFileV2,
} from "@/lib/history-delta";

/**
 * Güncelleme günlüğü (geri alma). Her kaydetmeden ÖNCEki durum, ayrı bir
 * geçmiş blob'una (`family-history-<treeId>.json`) anlık görüntü olarak eklenir.
 * Kullanıcı bir hatadan sonra tarihe göre önceki bir duruma dönebilir.
 *
 * FARK TABANLI. Eskiden her görüntü tüm kişi listesinin kopyasıydı; 300
 * kişilik bir ağaçta 15 görüntü ~835 KB tutuyordu ve `MAX` tam da bu yüzden
 * 15 gibi düşük bir sayıydı — yani kullanıcı, depolama yüzünden geri alma
 * derinliğinden oluyordu. Artık bir tam durum + geriye doğru farklar
 * saklanıyor (~61 KB, 13 kat küçük), bu yüzden sınır da yükseltildi.
 *
 * Zincir mantığı ve biçim geçişi `lib/history-delta.ts`te — saf ve birim
 * testi edilebilir. Burası yalnız blob okuma/yazma.
 */

const MAX_SNAPSHOTS = 50;

function historyPath(treeId: string) {
  return `family-history-${treeId}.json`;
}

/** Geri yüklemede listelenen özet (kişi listesi taşınmaz). */
export interface HistoryEntry {
  id: string;
  at: string;
  count: number;
  by?: string;
}

/**
 * Günlüğü okur.
 *
 * OKUNAMAYAN DOSYA, BOŞ DOSYA DEĞİL.
 *
 * İlk hâli her arızada `emptyHistory()` dönüyordu: HTTP hatası, bozuk JSON,
 * ağ kesintisi — hepsi "bu ağacın hiç geçmişi yok" diye okunuyordu. Ve
 * `pushHistorySnapshot` okuduğunun üstüne yazdığı için sonuç yalnız yanlış
 * bir liste değil, KALICI KAYIPTI: bir sonraki kaydetmede o boş dosya diske
 * iniyor ve elli anlık görüntünün tamamı — kullanıcının bütün geri alma
 * hakkı — tek bir geçici okuma hatasıyla siliniyordu.
 *
 * Aynı tuzak bu depoda `users.json`, `tree-access-*` ve `family-data-*`ta da
 * vardı (denetim A1–A3) ve orada da aynı yönde çözüldü: fırlat.
 *
 * DOSYA YOKSA (`blobs.length === 0`) boş dönmek DOĞRU — o gerçekten "hiç
 * geçmiş yok" demek, bir arıza değil.
 */
async function readHistory(treeId: string): Promise<HistoryFileV2> {
  const { blobs } = await list({ prefix: historyPath(treeId) });
  if (blobs.length === 0) return emptyHistory();
  const latest = blobs.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0];
  const result = await get(latest.pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200)
    throw new Error(`geçmiş okunamadı (HTTP ${result?.statusCode ?? "yanıt yok"})`);
  // `parseHistory` eski biçimi de kabul eder: geçiş YERİNDE olur, bir
  // sonraki yazmada dosya yeni biçimde diske iner. Ayrı taşıma betiği yok.
  return parseHistory(JSON.parse(await new Response(result.stream).text()));
}

async function writeHistory(treeId: string, file: HistoryFileV2): Promise<void> {
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
  await writeHistory(
    treeId,
    pushSnapshot(file, { id, at: new Date().toISOString(), by }, people, MAX_SNAPSHOTS)
  );
}

/** Günlüğü özet olarak listeler (en yeni önce). */
export async function listHistorySnapshots(treeId: string): Promise<HistoryEntry[]> {
  const file = await readHistory(treeId);
  return file.stamps.map((s) => ({ id: s.id, at: s.at, count: s.count, by: s.by }));
}

/** Belirli bir anlık görüntünün kişi listesini döndürür (yoksa null). */
export async function getHistorySnapshot(treeId: string, id: string): Promise<Person[] | null> {
  return snapshotById(await readHistory(treeId), id);
}

/**
 * Katkı akışı için: kişi listeleriyle BİRLİKTE anlık görüntüler (en yeni önce).
 *
 * `listHistorySnapshots` bilerek kişi listesi taşımaz (geri yükleme ekranı
 * için özet yeter). Akış ise iki komşu görüntüyü karşılaştırmak zorunda, o
 * yüzden ayrı bir okuma yolu var — ve `limit` ile sınırlı, çünkü zinciri
 * sonuna kadar açmak gereksiz.
 */
export async function readSnapshotsForActivity(
  treeId: string,
  limit: number
): Promise<Array<{ id: string; at: string; by?: string; people: Person[] }>> {
  return snapshotsWithPeople(await readHistory(treeId), limit);
}
