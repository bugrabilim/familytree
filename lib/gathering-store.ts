import "server-only";
import { put, list, get } from "@vercel/blob";
import { randomUUID, randomBytes } from "node:crypto";
import type { Gathering, GatheringBox, Rsvp } from "@/types/gathering";
import {
  MAX_GATHERINGS,
  normalizeGathering,
  normalizeRsvp,
  type RsvpError,
} from "@/lib/gathering";

/**
 * Aile etkinliği deposu — ağaç başına `gatherings-<treeId>.json`.
 *
 * KAPININ YERİ. Anonim yazma tek bir işlevden geçiyor (`addRsvp`) ve o
 * işlev jetonu kendi doğruluyor; çağıran rotaya "önce jetonu kontrol et"
 * diye güvenmiyoruz. Bir yazma yolunun doğrulamayı atlaması, kimliksiz bir
 * uçta doğrudan açık kapı demek olurdu.
 */

function pathname(treeId: string) {
  return `gatherings-${treeId}.json`;
}

const empty = (): GatheringBox => ({ gatherings: [], updatedAt: new Date(0).toISOString() });

async function getBox(treeId: string): Promise<GatheringBox> {
  const path = pathname(treeId);
  try {
    const direct = await get(path, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      return normalizeBox((await new Response(direct.stream).json()) as Partial<GatheringBox>);
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
    return normalizeBox((await res.json()) as Partial<GatheringBox>);
  } catch {
    return empty();
  }
}

function normalizeBox(raw: Partial<GatheringBox> | null): GatheringBox {
  const arr = Array.isArray(raw?.gatherings) ? raw!.gatherings : [];
  return {
    gatherings: arr.filter(
      (g): g is Gathering =>
        !!g && typeof g.id === "string" && typeof g.title === "string" && Array.isArray(g.rsvps)
    ),
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

async function saveBox(treeId: string, box: GatheringBox): Promise<void> {
  box.updatedAt = new Date().toISOString();
  await put(pathname(treeId), JSON.stringify(box), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Aile içi (düzenleyici) görünüm — katılımcı listesi DÂHİL. */
export async function readGatherings(treeId: string): Promise<Gathering[]> {
  return (await getBox(treeId)).gatherings;
}

export async function addGathering(
  treeId: string,
  input: Partial<Gathering>
): Promise<Gathering | null> {
  const box = await getBox(treeId);
  if (box.gatherings.length >= MAX_GATHERINGS) return null;
  const g = normalizeGathering(input, new Date().toISOString());
  if (!g) return null;
  g.id = randomUUID();
  /*
   * Jeton TAHMİN EDİLEMEZ olmalı: bu, anonim yazma kapısının anahtarı.
   * Kimlik doğrulaması olmadığı için jetonun kendisi tek koruma — kısa ya
   * da sıralı bir değer, kaba kuvvetle bulunabilirdi.
   */
  g.token = randomBytes(18).toString("base64url");
  box.gatherings.push(g);
  await saveBox(treeId, box);
  return g;
}

export async function updateGathering(
  treeId: string,
  id: string,
  input: Partial<Gathering>
): Promise<Gathering | null> {
  const box = await getBox(treeId);
  const i = box.gatherings.findIndex((g) => g.id === id);
  if (i === -1) return null;
  const next = normalizeGathering(input, new Date().toISOString(), box.gatherings[i]);
  if (!next) return null;
  box.gatherings[i] = next;
  await saveBox(treeId, box);
  return next;
}

export async function deleteGathering(treeId: string, id: string): Promise<boolean> {
  const box = await getBox(treeId);
  const before = box.gatherings.length;
  box.gatherings = box.gatherings.filter((g) => g.id !== id);
  if (box.gatherings.length === before) return false;
  await saveBox(treeId, box);
  return true;
}

/** Katılımcının kendi kaydını silmek düzenleyicinin işi. */
export async function deleteRsvp(treeId: string, gatheringId: string, rsvpId: string): Promise<boolean> {
  const box = await getBox(treeId);
  const g = box.gatherings.find((x) => x.id === gatheringId);
  if (!g) return false;
  const before = g.rsvps.length;
  g.rsvps = g.rsvps.filter((r) => r.id !== rsvpId);
  if (g.rsvps.length === before) return false;
  await saveBox(treeId, box);
  return true;
}

/**
 * Jetondan etkinliği bulur — anonim okuma/yazma için tek giriş.
 *
 * Jeton BOŞ olamaz: eski/bozuk bir kayıtta `token` boş kalırsa, boş bir
 * jetonla gelen istek onunla eşleşir ve kapı kendiliğinden açılırdı.
 */
export async function findByToken(
  treeId: string,
  token: string
): Promise<Gathering | null> {
  const t = token.trim();
  if (!t) return null;
  const box = await getBox(treeId);
  return box.gatherings.find((g) => g.token && g.token === t) ?? null;
}

/**
 * ANONİM YAZMA. Jeton doğrulaması burada, çağıranda değil.
 *
 * `normalizeRsvp` ayrıca `rsvpOpen`u denetliyor: geçerli bir jeton, kapalı
 * bir etkinliğe yazma hakkı vermiyor. İki kapı ayrı — biri "hangi
 * etkinlik", öteki "yazma açık mı".
 */
export async function addRsvp(
  treeId: string,
  token: string,
  input: { name?: unknown; answer?: unknown; headcount?: unknown; note?: unknown }
): Promise<{ rsvp: Rsvp } | { error: RsvpError | "yok" }> {
  const t = token.trim();
  if (!t) return { error: "yok" };

  const box = await getBox(treeId);
  const g = box.gatherings.find((x) => x.token && x.token === t);
  if (!g) return { error: "yok" };

  const res = normalizeRsvp(g, input, new Date().toISOString());
  if ("error" in res) return res;

  if (res.replacesId) {
    const i = g.rsvps.findIndex((r) => r.id === res.replacesId);
    res.rsvp.id = res.replacesId;
    g.rsvps[i] = res.rsvp;
  } else {
    res.rsvp.id = randomUUID();
    g.rsvps.push(res.rsvp);
  }

  await saveBox(treeId, box);
  return { rsvp: res.rsvp };
}
