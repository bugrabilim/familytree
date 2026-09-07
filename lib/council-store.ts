import { mutateStore } from "@/lib/store-mutate";
import "server-only";
import { put, list, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import type {
  Ballot,
  Campaign,
  CouncilBox,
  Debt,
  Decision,
  Pledge,
} from "@/types/council";
import {
  MAX_CAMPAIGNS,
  MAX_DEBTS,
  MAX_DECISIONS,
  MAX_PLEDGES,
  closeDecision,
  isFrozen,
  normalizeBallot,
  normalizeCampaign,
  normalizeDebt,
  normalizeDecision,
  normalizePledge,
  type BallotError,
  type DebtInput,
  type PledgeInput,
} from "@/lib/council";

/**
 * Aile meclisi deposu — ağaç başına `council-<treeId>.json`.
 *
 * ## Burada PARA YOK
 *
 * Bu depo bir defter dosyası: taahhüt, beyan, borç kaydı ve karar tutanağı.
 * Hiçbir bakiye tutmuyor, hiçbir ödeme sağlayıcısına bağlanmıyor, hiçbir
 * kart/IBAN alanı taşımıyor. Gerekçe `types/council.ts`in başında: uygulama
 * içinde para hareketi 6493 sayılı kanun kapsamında ödeme kuruluşu lisansı
 * ister. Kilidi `tests/council-gate.test.mts` tutuyor.
 *
 * ## TUTANAK KAPISI
 *
 * Donmuş kararın (`closedAt` dolu) değiştirilmesi ve silinmesi BU DOSYADA
 * reddediliyor — çağıran rotanın önceden denetlemesine güvenmiyoruz. Bir
 * meclis kararının değeri değiştirilemezliğinde; o kuralın tek bir yazma
 * yolundan kaçması, kuralın hiç olmamasıyla aynı kapıya çıkar.
 */

function pathname(treeId: string) {
  return `council-${treeId}.json`;
}

const empty = (): CouncilBox => ({
  campaigns: [],
  debts: [],
  decisions: [],
  updatedAt: new Date(0).toISOString(),
});

function normalizeBox(raw: Partial<CouncilBox> | null): CouncilBox {
  const dizi = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    campaigns: dizi<Campaign>(raw?.campaigns).filter(
      (c) => !!c && typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.pledges)
    ),
    debts: dizi<Debt>(raw?.debts).filter(
      (d) => !!d && typeof d.id === "string" && typeof d.amountKurus === "number"
    ),
    decisions: dizi<Decision>(raw?.decisions).filter(
      (d) => !!d && typeof d.id === "string" && typeof d.title === "string" && Array.isArray(d.ballots)
    ),
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

async function getBox(treeId: string): Promise<CouncilBox> {
  const path = pathname(treeId);
  try {
    const direct = await get(path, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      return normalizeBox((await new Response(direct.stream).json()) as Partial<CouncilBox>);
    }
  } catch {
    /* (2)'ye düş */
  }
  try {
    const found = await list({ prefix: path, limit: 1 });
    const blob = found.blobs[0];
    if (!blob) return empty();
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`meclis defteri okunamadı (HTTP ${res.status})`);
    return normalizeBox((await res.json()) as Partial<CouncilBox>);
  } catch (e) {
    /*
     * OKUNAMAYAN dosya, BOŞ dosya DEĞİLDİR — `lib/gathering-store.ts`teki
     * aynı karar. Burada bedeli daha da ağır: boş sayılan bir defterin
     * üstüne yazmak, kapanmış bir meclis kararını yok etmek demek.
     */
    throw e;
  }
}

async function saveBox(treeId: string, box: CouncilBox): Promise<void> {
  box.updatedAt = new Date().toISOString();
  await put(pathname(treeId), JSON.stringify(box), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/**
 * Bu deponun oku→değiştir→yaz sarmalayıcısı (`lib/store-mutate.ts`).
 *
 * Kayıp yazmanın en olası hâli OYLAMA: bir karar aileye duyurulunca
 * birkaç üyenin aynı dakikada oy vermesi beklenen durum. Korumasızken
 * sonuncunun yazması öncekilerin oyunu siler — ve silinen oy, tutanağın
 * sonucunu değiştirir.
 */
function mutate<T>(
  treeId: string,
  degistir: (box: CouncilBox) => { yaz: boolean; sonuc: T }
): Promise<T> {
  return mutateStore(() => getBox(treeId), (b) => saveBox(treeId, b), degistir, "Meclis");
}

/** Aile içi görünüm — defterin tamamı. Dışarıya açılan bir yüzeyi YOK. */
export async function readCouncil(treeId: string): Promise<CouncilBox> {
  return getBox(treeId);
}

/* ── Kampanyalar ──────────────────────────────────────────────────────── */

export async function addCampaign(
  treeId: string,
  input: Partial<Campaign> & { targetText?: unknown }
): Promise<Campaign | null> {
  return mutate<Campaign | null>(treeId, (box) => {
    if (box.campaigns.length >= MAX_CAMPAIGNS) return { yaz: false, sonuc: null };
    const c = normalizeCampaign(input, new Date().toISOString());
    if (!c) return { yaz: false, sonuc: null };
    c.id = randomUUID();
    box.campaigns.push(c);
    return { yaz: true, sonuc: c };
  });
}

export async function updateCampaign(
  treeId: string,
  id: string,
  input: Partial<Campaign> & { targetText?: unknown }
): Promise<Campaign | null> {
  return mutate<Campaign | null>(treeId, (box) => {
    const i = box.campaigns.findIndex((c) => c.id === id);
    if (i === -1) return { yaz: false, sonuc: null };
    const next = normalizeCampaign(input, new Date().toISOString(), box.campaigns[i]);
    if (!next) return { yaz: false, sonuc: null };
    box.campaigns[i] = next;
    return { yaz: true, sonuc: next };
  });
}

export async function deleteCampaign(treeId: string, id: string): Promise<boolean> {
  return mutate<boolean>(treeId, (box) => {
    const before = box.campaigns.length;
    box.campaigns = box.campaigns.filter((c) => c.id !== id);
    if (box.campaigns.length === before) return { yaz: false, sonuc: false };
    return { yaz: true, sonuc: true };
  });
}

export type PledgeError = "yok" | "kapali" | "gecersiz" | "dolu";

/**
 * Katkı satırı ekler ya da günceller.
 *
 * KAPALI kampanyaya yazılamaz: kapatmak "defter bitti" demek ve sonradan
 * eklenen bir satır, ailenin üzerinde anlaştığı toplamı sessizce değiştirir.
 */
export async function savePledge(
  treeId: string,
  campaignId: string,
  input: PledgeInput & { id?: string }
): Promise<{ pledge: Pledge } | { error: PledgeError }> {
  type Sonuc = { pledge: Pledge } | { error: PledgeError };
  return mutate<Sonuc>(treeId, (box) => {
    const c = box.campaigns.find((x) => x.id === campaignId);
    if (!c) return { yaz: false, sonuc: { error: "yok" } };
    if (c.closed) return { yaz: false, sonuc: { error: "kapali" } };

    const mevcut = input.id ? c.pledges.find((p) => p.id === input.id) : undefined;
    if (input.id && !mevcut) return { yaz: false, sonuc: { error: "yok" } };
    if (!mevcut && c.pledges.length >= MAX_PLEDGES) return { yaz: false, sonuc: { error: "dolu" } };

    const p = normalizePledge(input, new Date().toISOString(), mevcut);
    if (!p) return { yaz: false, sonuc: { error: "gecersiz" } };

    if (mevcut) {
      p.id = mevcut.id;
      c.pledges[c.pledges.indexOf(mevcut)] = p;
    } else {
      p.id = randomUUID();
      c.pledges.push(p);
    }
    c.updatedAt = new Date().toISOString();
    return { yaz: true, sonuc: { pledge: p } };
  });
}

export async function deletePledge(
  treeId: string,
  campaignId: string,
  pledgeId: string
): Promise<boolean> {
  return mutate<boolean>(treeId, (box) => {
    const c = box.campaigns.find((x) => x.id === campaignId);
    if (!c) return { yaz: false, sonuc: false };
    const before = c.pledges.length;
    c.pledges = c.pledges.filter((p) => p.id !== pledgeId);
    if (c.pledges.length === before) return { yaz: false, sonuc: false };
    c.updatedAt = new Date().toISOString();
    return { yaz: true, sonuc: true };
  });
}

/* ── Borç-alacak ──────────────────────────────────────────────────────── */

export async function addDebt(treeId: string, input: DebtInput): Promise<Debt | null> {
  return mutate<Debt | null>(treeId, (box) => {
    if (box.debts.length >= MAX_DEBTS) return { yaz: false, sonuc: null };
    const d = normalizeDebt(input, new Date().toISOString());
    if (!d) return { yaz: false, sonuc: null };
    d.id = randomUUID();
    box.debts.push(d);
    return { yaz: true, sonuc: d };
  });
}

export async function updateDebt(
  treeId: string,
  id: string,
  input: DebtInput
): Promise<Debt | null> {
  return mutate<Debt | null>(treeId, (box) => {
    const i = box.debts.findIndex((d) => d.id === id);
    if (i === -1) return { yaz: false, sonuc: null };
    const next = normalizeDebt(input, new Date().toISOString(), box.debts[i]);
    if (!next) return { yaz: false, sonuc: null };
    box.debts[i] = next;
    return { yaz: true, sonuc: next };
  });
}

export async function deleteDebt(treeId: string, id: string): Promise<boolean> {
  return mutate<boolean>(treeId, (box) => {
    const before = box.debts.length;
    box.debts = box.debts.filter((d) => d.id !== id);
    if (box.debts.length === before) return { yaz: false, sonuc: false };
    return { yaz: true, sonuc: true };
  });
}

/* ── Kararlar ve oylama ───────────────────────────────────────────────── */

export async function addDecision(
  treeId: string,
  input: Partial<Decision>
): Promise<Decision | null> {
  return mutate<Decision | null>(treeId, (box) => {
    if (box.decisions.length >= MAX_DECISIONS) return { yaz: false, sonuc: null };
    const d = normalizeDecision(input, new Date().toISOString());
    if (!d) return { yaz: false, sonuc: null };
    d.id = randomUUID();
    box.decisions.push(d);
    return { yaz: true, sonuc: d };
  });
}

/**
 * Kararın metnini günceller — YALNIZ kapanmadan önce.
 *
 * `normalizeDecision` donmuş kaydı zaten reddediyor; buradaki erken dönüş
 * ondan bağımsız bir ikinci kapı değil, aynı işlevin sonucunu okuyor.
 */
export async function updateDecision(
  treeId: string,
  id: string,
  input: Partial<Decision>
): Promise<Decision | null> {
  return mutate<Decision | null>(treeId, (box) => {
    const i = box.decisions.findIndex((d) => d.id === id);
    if (i === -1) return { yaz: false, sonuc: null };
    const next = normalizeDecision(input, new Date().toISOString(), box.decisions[i]);
    if (!next) return { yaz: false, sonuc: null };
    box.decisions[i] = next;
    return { yaz: true, sonuc: next };
  });
}

/**
 * KAPANMIŞ TUTANAK SİLİNEMEZ.
 *
 * Silmeyi açık bırakmak, değiştirilemezliği anlamsız kılardı: değiştiremeyen
 * ama silebilen biri, kararı yok edip yenisini yazar. Kapalı bir kararla
 * ilgili itiraz varsa yolu YENİ bir karar açmaktır.
 */
export async function deleteDecision(treeId: string, id: string): Promise<boolean> {
  return mutate<boolean>(treeId, (box) => {
    const d = box.decisions.find((x) => x.id === id);
    if (!d) return { yaz: false, sonuc: false };
    if (isFrozen(d)) return { yaz: false, sonuc: false };
    box.decisions = box.decisions.filter((x) => x.id !== id);
    return { yaz: true, sonuc: true };
  });
}

export async function castBallot(
  treeId: string,
  decisionId: string,
  input: { voterId: string; voterName: string; vote: unknown }
): Promise<{ ballot: Ballot } | { error: BallotError | "yok" }> {
  type Sonuc = { ballot: Ballot } | { error: BallotError | "yok" };
  return mutate<Sonuc>(treeId, (box) => {
    const d = box.decisions.find((x) => x.id === decisionId);
    if (!d) return { yaz: false, sonuc: { error: "yok" } };

    const res = normalizeBallot(d, input, new Date().toISOString());
    if ("error" in res) return { yaz: false, sonuc: res };

    if (res.replacesId) {
      const i = d.ballots.findIndex((b) => b.id === res.replacesId);
      res.ballot.id = res.replacesId;
      d.ballots[i] = res.ballot;
    } else {
      res.ballot.id = randomUUID();
      d.ballots.push(res.ballot);
    }
    d.updatedAt = new Date().toISOString();
    return { yaz: true, sonuc: { ballot: res.ballot } };
  });
}

/** Kararı kapatır ve sonucu DONDURUR. İkinci kez kapatılamaz. */
export async function closeCouncilDecision(
  treeId: string,
  id: string
): Promise<Decision | null> {
  return mutate<Decision | null>(treeId, (box) => {
    const i = box.decisions.findIndex((d) => d.id === id);
    if (i === -1) return { yaz: false, sonuc: null };
    const next = closeDecision(box.decisions[i], new Date().toISOString());
    if (!next) return { yaz: false, sonuc: null };
    box.decisions[i] = next;
    return { yaz: true, sonuc: next };
  });
}
