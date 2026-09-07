import { mutateStore } from "@/lib/store-mutate";
import "server-only";
import { put, list, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import type { Obituary, ObituaryBoard } from "@/types/obituary";
import { MAX_OBITUARIES, normalizeObituary, publicObituaries, sortObituaries } from "@/lib/obituaries";

/** Taziye duyuruları — ağaç başına `obituaries-<treeId>.json`. */

function pathname(treeId: string) {
  return `obituaries-${treeId}.json`;
}

const empty = (): ObituaryBoard => ({ obituaries: [], updatedAt: new Date(0).toISOString() });

async function getBoard(treeId: string): Promise<ObituaryBoard> {
  const path = pathname(treeId);
  try {
    const direct = await get(path, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      return normalizeBoard((await new Response(direct.stream).json()) as ObituaryBoard);
    }
  } catch {
    /* (2)'ye düş */
  }
  try {
    const found = await list({ prefix: path, limit: 1 });
    const blob = found.blobs[0];
    if (!blob) return empty();
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`vefat ilanları okunamadı (HTTP ${res.status})`);
    return normalizeBoard((await res.json()) as ObituaryBoard);
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

function normalizeBoard(raw: Partial<ObituaryBoard> | null): ObituaryBoard {
  const arr = Array.isArray(raw?.obituaries) ? raw!.obituaries : [];
  return {
    obituaries: arr.filter(
      (o): o is Obituary => !!o && typeof o.id === "string" && typeof o.personId === "string"
    ),
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

async function saveBoard(treeId: string, board: ObituaryBoard): Promise<void> {
  board.updatedAt = new Date().toISOString();
  await put(pathname(treeId), JSON.stringify(board), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Aile üyeleri için: hepsi. */
export async function readObituaries(treeId: string): Promise<Obituary[]> {
  return sortObituaries((await getBoard(treeId)).obituaries);
}

/**
 * HERKESE AÇIK yüzey için: yalnız ailenin paylaşmayı SEÇTİKLERİ.
 *
 * `/g/<jeton>` gibi girişsiz bir sayfada kullanılacak tek okuma yolu budur.
 * Ayrı bir işlev olması bilinçli: "hepsini oku, sonra süz" demek, süzmeyi
 * unutmayı bir satırlık hata hâline getirirdi.
 */
export async function readPublicObituaries(treeId: string): Promise<Obituary[]> {
  return publicObituaries(sortObituaries((await getBoard(treeId)).obituaries));
}

/** Bu deponun oku→değiştir→yaz sarmalayıcısı (`lib/store-mutate.ts`). */
function mutate<T>(treeId: string, degistir: (board: ObituaryBoard) => { yaz: boolean; sonuc: T }): Promise<T> {
  return mutateStore(() => getBoard(treeId), (b) => saveBoard(treeId, b), degistir, "Duyuru");
}

export async function addObituary(treeId: string, input: Partial<Obituary>): Promise<Obituary | null> {
  return mutate<Obituary | null>(treeId, (board) => {
    if (board.obituaries.length >= MAX_OBITUARIES) return { yaz: false, sonuc: null };
    const o = normalizeObituary(input, new Date().toISOString());
    if (!o) return { yaz: false, sonuc: null };
    o.id = randomUUID();
    board.obituaries.push(o);
    return { yaz: true, sonuc: o };
  });
}

export async function updateObituary(
  treeId: string,
  id: string,
  input: Partial<Obituary>
): Promise<Obituary | null> {
  return mutate<Obituary | null>(treeId, (board) => {
    const i = board.obituaries.findIndex((o) => o.id === id);
    if (i === -1) return { yaz: false, sonuc: null };
    const next = normalizeObituary(input, new Date().toISOString(), board.obituaries[i]);
    if (!next) return { yaz: false, sonuc: null };
    board.obituaries[i] = next;
    return { yaz: true, sonuc: next };
  });
}

export async function deleteObituary(treeId: string, id: string): Promise<boolean> {
  return mutate<boolean>(treeId, (board) => {
    const before = board.obituaries.length;
    board.obituaries = board.obituaries.filter((o) => o.id !== id);
    if (board.obituaries.length === before) return { yaz: false, sonuc: false };
    return { yaz: true, sonuc: true };
  });
}

export async function countObituaries(treeId: string): Promise<number> {
  return (await getBoard(treeId)).obituaries.length;
}
