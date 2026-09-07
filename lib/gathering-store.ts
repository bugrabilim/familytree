import { mutateStore } from "@/lib/store-mutate";
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
    if (!res.ok) throw new Error(`etkinlikler okunamadı (HTTP ${res.status})`);
    return normalizeBox((await res.json()) as Partial<GatheringBox>);
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

/**
 * Bu deponun oku→değiştir→yaz sarmalayıcısı (`lib/store-mutate.ts`).
 *
 * Burada kayıp yazmanın en olası hâli KATILIM BİLDİRİMİ: aynı davet
 * bağlantısı bir aileye toplu gidiyor ve birkaç kişinin aynı dakikada
 * yanıtlaması beklenen durum, istisna değil. Korumasızken sonuncusu
 * öncekilerin yanıtını siliyordu.
 */
function mutate<T>(treeId: string, degistir: (box: GatheringBox) => { yaz: boolean; sonuc: T }): Promise<T> {
  return mutateStore(() => getBox(treeId), (b) => saveBox(treeId, b), degistir, "Etkinlik");
}

export async function addGathering(
  treeId: string,
  input: Partial<Gathering>
): Promise<Gathering | null> {
  return mutate<Gathering | null>(treeId, (box) => {
    if (box.gatherings.length >= MAX_GATHERINGS) return { yaz: false, sonuc: null };
    const g = normalizeGathering(input, new Date().toISOString());
    if (!g) return { yaz: false, sonuc: null };
    g.id = randomUUID();
    /*
     * Jeton TAHMİN EDİLEMEZ olmalı: bu, anonim yazma kapısının anahtarı.
     * Kimlik doğrulaması olmadığı için jetonun kendisi tek koruma — kısa ya
     * da sıralı bir değer, kaba kuvvetle bulunabilirdi.
     */
    g.token = randomBytes(18).toString("base64url");
    box.gatherings.push(g);
    return { yaz: true, sonuc: g };
  });
}

export async function updateGathering(
  treeId: string,
  id: string,
  input: Partial<Gathering>
): Promise<Gathering | null> {
  return mutate<Gathering | null>(treeId, (box) => {
    const i = box.gatherings.findIndex((g) => g.id === id);
    if (i === -1) return { yaz: false, sonuc: null };
    const next = normalizeGathering(input, new Date().toISOString(), box.gatherings[i]);
    if (!next) return { yaz: false, sonuc: null };
    box.gatherings[i] = next;
    return { yaz: true, sonuc: next };
  });
}

export async function deleteGathering(treeId: string, id: string): Promise<boolean> {
  return mutate<boolean>(treeId, (box) => {
    const before = box.gatherings.length;
    box.gatherings = box.gatherings.filter((g) => g.id !== id);
    if (box.gatherings.length === before) return { yaz: false, sonuc: false };
    return { yaz: true, sonuc: true };
  });
}

/** Katılımcının kendi kaydını silmek düzenleyicinin işi. */
export async function deleteRsvp(treeId: string, gatheringId: string, rsvpId: string): Promise<boolean> {
  return mutate<boolean>(treeId, (box) => {
    const g = box.gatherings.find((x) => x.id === gatheringId);
    if (!g) return { yaz: false, sonuc: false };
    const before = g.rsvps.length;
    g.rsvps = g.rsvps.filter((r) => r.id !== rsvpId);
    if (g.rsvps.length === before) return { yaz: false, sonuc: false };
    return { yaz: true, sonuc: true };
  });
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

  type Sonuc = { rsvp: Rsvp } | { error: RsvpError | "yok" };
  return mutate<Sonuc>(treeId, (box) => {
    const g = box.gatherings.find((x) => x.token && x.token === t);
    if (!g) return { yaz: false, sonuc: { error: "yok" } };

    const res = normalizeRsvp(g, input, new Date().toISOString());
    if ("error" in res) return { yaz: false, sonuc: res };

    if (res.replacesId) {
      const i = g.rsvps.findIndex((r) => r.id === res.replacesId);
      res.rsvp.id = res.replacesId;
      g.rsvps[i] = res.rsvp;
    } else {
      res.rsvp.id = randomUUID();
      g.rsvps.push(res.rsvp);
    }

    return { yaz: true, sonuc: { rsvp: res.rsvp } };
  });
}
