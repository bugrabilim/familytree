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
    if (!res.ok) return empty();
    return normalizeBoard((await res.json()) as ObituaryBoard);
  } catch {
    return empty();
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

export async function addObituary(treeId: string, input: Partial<Obituary>): Promise<Obituary | null> {
  const board = await getBoard(treeId);
  if (board.obituaries.length >= MAX_OBITUARIES) return null;
  const o = normalizeObituary(input, new Date().toISOString());
  if (!o) return null;
  o.id = randomUUID();
  board.obituaries.push(o);
  await saveBoard(treeId, board);
  return o;
}

export async function updateObituary(
  treeId: string,
  id: string,
  input: Partial<Obituary>
): Promise<Obituary | null> {
  const board = await getBoard(treeId);
  const i = board.obituaries.findIndex((o) => o.id === id);
  if (i === -1) return null;
  const next = normalizeObituary(input, new Date().toISOString(), board.obituaries[i]);
  if (!next) return null;
  board.obituaries[i] = next;
  await saveBoard(treeId, board);
  return next;
}

export async function deleteObituary(treeId: string, id: string): Promise<boolean> {
  const board = await getBoard(treeId);
  const before = board.obituaries.length;
  board.obituaries = board.obituaries.filter((o) => o.id !== id);
  if (board.obituaries.length === before) return false;
  await saveBoard(treeId, board);
  return true;
}

export async function countObituaries(treeId: string): Promise<number> {
  return (await getBoard(treeId)).obituaries.length;
}
