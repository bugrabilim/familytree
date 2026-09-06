import "server-only";
import { put, list, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import type { Bond, BondBox } from "@/types/bond";
import { MAX_BONDS, normalizeBond, normalizeBonds, pairKey } from "@/lib/bonds";

/**
 * Duygusal bağ deposu — ağaç başına `bonds-<treeId>.json`.
 *
 * Ayrı bir blob, `family-data`nın içinde değil. İki nedeni var:
 *
 * 1. Bu katman hassas. Aile verisi paylaşım bağlantısıyla, dışa aktarımla,
 *    kitapla, GEDCOM'la dışarı çıkıyor. Bağlar o dosyada dursaydı her yeni
 *    dışa aktarma yolunu tek tek "bunu hariç tut" diye düzeltmek gerekirdi
 *    ve biri unutulduğunda "amcamla aramız kopuk" notu bir paylaşım
 *    bağlantısında görünürdü. Ayrı dosyada varsayılan dışarıda kalmaktır.
 * 2. Bağ yazmak kişi listesini değiştirmiyor; aynı bloba yazsaydık her bağ
 *    düzenlemesi tüm kişi listesinin geçmiş anlık görüntüsünü tetiklerdi.
 */

function pathname(treeId: string) {
  return `bonds-${treeId}.json`;
}

const empty = (): BondBox => ({ bonds: [], updatedAt: new Date(0).toISOString() });

async function getBox(treeId: string): Promise<BondBox> {
  const path = pathname(treeId);
  try {
    const direct = await get(path, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      const raw = (await new Response(direct.stream).json()) as Partial<BondBox>;
      return normalizeBox(raw);
    }
  } catch {
    /* (2)'ye düş */
  }
  try {
    const found = await list({ prefix: path, limit: 1 });
    const blob = found.blobs[0];
    if (!blob) return empty();
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`duygusal bağlar okunamadı (HTTP ${res.status})`);
    return normalizeBox((await res.json()) as Partial<BondBox>);
  } catch (e) {
    /*
     * OKUNAMAYAN dosya, BOŞ dosya DEĞİLDİR.
     *
     * Burada eskiden `empty()` dönülüyordu ve çağıran onun üstüne yazıyordu:
     * tek bir geçici indirme hatası, o ana kadarki BÜTÜN kayıtları siliyordu.
     * Üstelik sessizce — uç 200 dönüyor, kullanıcı listeyi boş görüyor ve
     * yeniden yazmaya başlıyor; ilk yazma da eski dosyanın üstüne biniyor.
     *
     * Dosya GERÇEKTEN yoksa (yukarıdaki `!blob`) boş sayılıyor — o doğru.
     * Ama "var ama okuyamadım" hata olarak yükseliyor: gürültülü bir arıza,
     * sessiz bir veri kaybından her zaman iyidir.
     */
    throw e;
  }
}

function normalizeBox(raw: Partial<BondBox> | null): BondBox {
  return {
    bonds: normalizeBonds(raw?.bonds),
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

async function saveBox(treeId: string, box: BondBox): Promise<void> {
  box.updatedAt = new Date().toISOString();
  await put(pathname(treeId), JSON.stringify(box), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readBonds(treeId: string): Promise<Bond[]> {
  return (await getBox(treeId)).bonds;
}

export type BondWriteError = "dolu" | "gecersiz" | "kopya" | "yok";

/**
 * Bağ ekler.
 *
 * Aynı çift için ikinci bir bağ REDDEDİLİR (sessizce üstüne yazılmaz).
 * "Ali–Veli çatışmalı" varken "Ali–Veli yakın" eklemek bir çelişkidir;
 * kullanıcıya mevcut bağı göstermek, onu sessizce değiştirmekten iyidir.
 */
export async function addBond(
  treeId: string,
  input: Partial<Bond>
): Promise<{ bond: Bond } | { error: BondWriteError }> {
  const box = await getBox(treeId);
  if (box.bonds.length >= MAX_BONDS) return { error: "dolu" };
  const bond = normalizeBond(input, new Date().toISOString());
  if (!bond) return { error: "gecersiz" };
  const key = pairKey(bond.a, bond.b);
  if (box.bonds.some((x) => pairKey(x.a, x.b) === key)) return { error: "kopya" };
  bond.id = randomUUID();
  box.bonds.push(bond);
  await saveBox(treeId, box);
  return { bond };
}

export async function updateBond(
  treeId: string,
  id: string,
  input: Partial<Bond>
): Promise<{ bond: Bond } | { error: BondWriteError }> {
  const box = await getBox(treeId);
  const i = box.bonds.findIndex((x) => x.id === id);
  if (i === -1) return { error: "yok" };
  const next = normalizeBond(input, new Date().toISOString(), box.bonds[i]);
  if (!next) return { error: "gecersiz" };
  // Uçlar değiştiyse yeni çift başka bir bağla çakışmamalı.
  const key = pairKey(next.a, next.b);
  if (box.bonds.some((x, j) => j !== i && pairKey(x.a, x.b) === key)) return { error: "kopya" };
  box.bonds[i] = next;
  await saveBox(treeId, box);
  return { bond: next };
}

export async function deleteBond(treeId: string, id: string): Promise<boolean> {
  const box = await getBox(treeId);
  const before = box.bonds.length;
  box.bonds = box.bonds.filter((x) => x.id !== id);
  if (box.bonds.length === before) return false;
  await saveBox(treeId, box);
  return true;
}

/**
 * Bir kişiye dokunan tüm bağları siler — kişi silinirken çağrılır.
 *
 * `pruneBonds` okurken zaten süzüyor, ama bu ayrı bir iş: süzmek görüntüyü
 * temizler, bu ise ölü kaydı diskten kaldırır. İkisi birden gerekli, çünkü
 * silme rotası bu depoya erişemezse (hata, zaman aşımı) okuma yine de doğru
 * çalışmalı.
 */
export async function deleteBondsOfPerson(treeId: string, personId: string): Promise<number> {
  const box = await getBox(treeId);
  const before = box.bonds.length;
  box.bonds = box.bonds.filter((x) => x.a !== personId && x.b !== personId);
  const silinen = before - box.bonds.length;
  if (silinen) await saveBox(treeId, box);
  return silinen;
}
