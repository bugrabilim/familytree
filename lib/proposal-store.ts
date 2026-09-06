import "server-only";
import { put, list, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { planProposal, type Proposal } from "@/lib/proposals";

/**
 * DEĞİŞİKLİK ÖNERİLERİ DEPOSU — ağaç başına: `proposals-<treeId>.json`.
 *
 * `family-data-<treeId>.json`e katılmadı: bir öneri, ağacın kendisi değil
 * ağaç HAKKINDA bir talep. Aynı dosyada dursaydı her öneri ağacın sürüm
 * damgasını ilerletir, açık olan her düzenleme ekranına "ağaç değişti"
 * çakışması düşürürdü.
 */

function pathname(treeId: string) {
  return `proposals-${treeId}.json`;
}

export interface ProposalBook {
  proposals: Proposal[];
  updatedAt: string;
}

const empty = (): ProposalBook => ({ proposals: [], updatedAt: new Date(0).toISOString() });

function normalizeBook(raw: ProposalBook | null | undefined): ProposalBook {
  if (!raw || !Array.isArray(raw.proposals)) return empty();
  return { proposals: raw.proposals, updatedAt: raw.updatedAt ?? new Date(0).toISOString() };
}

export async function getProposalBook(treeId: string): Promise<ProposalBook> {
  const path = pathname(treeId);

  // İki aşamalı okuma (öbür depolarla aynı): önce doğrudan `get` — yeni
  // yazılanı hemen görür — olmazsa `list` yedeği; `list()` eventual consistent.
  try {
    const direct = await get(path, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      return normalizeBook((await new Response(direct.stream).json()) as ProposalBook);
    }
  } catch {
    /* (2)'ye düş */
  }
  try {
    const found = await list({ prefix: path, limit: 1 });
    const blob = found.blobs[0];
    // Dosya GERÇEKTEN yok — ilk öneri onu oluşturacak.
    if (!blob) return empty();
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`öneri kuyruğu okunamadı (HTTP ${res.status})`);
    return normalizeBook((await res.json()) as ProposalBook);
  } catch (e) {
    /*
     * OKUNAMAYAN dosya, BOŞ dosya DEĞİLDİR.
     *
     * Burada `empty()` dönmek, sonraki yazmanın kuyruğun ÜSTÜNE yazıp
     * bekleyen bütün önerileri silmesi demekti — sessizce, hata bile
     * göstermeden. Aynı hata bu depoda altı kez yapıldı ve altısı da
     * geri alındı (`tests/store-read-gate.test.mts`).
     */
    throw e;
  }
}

async function save(treeId: string, book: ProposalBook): Promise<void> {
  await put(pathname(treeId), JSON.stringify({ ...book, updatedAt: new Date().toISOString() }), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function listProposals(treeId: string): Promise<Proposal[]> {
  return (await getProposalBook(treeId)).proposals;
}

/** Yeni öneri ekler. Tavan/kuyruk kuralı saf katmanda (`planProposal`). */
export async function addProposal(
  treeId: string,
  yeni: Omit<Proposal, "id">
): Promise<{ ok: true; proposal: Proposal } | { ok: false; fail: "kuyruk-dolu" }> {
  const book = await getProposalBook(treeId);
  const proposal: Proposal = { ...yeni, id: randomUUID() };
  const r = planProposal(book.proposals, proposal);
  if (!r.ok) return r;
  await save(treeId, { ...book, proposals: r.list });
  return { ok: true, proposal };
}

/**
 * Öneriyi kaydın YERİNE yazar.
 *
 * Çağıran karar mantığını (`decide`) saf katmanda çalıştırıp sonucu buraya
 * veriyor; burada iş kuralı YOK, yalnız yazma. Kural iki yere bölünseydi
 * ikisi ayrışırdı.
 */
export async function replaceProposal(treeId: string, p: Proposal): Promise<boolean> {
  const book = await getProposalBook(treeId);
  const i = book.proposals.findIndex((x) => x.id === p.id);
  if (i === -1) return false;
  const proposals = [...book.proposals];
  proposals[i] = p;
  await save(treeId, { ...book, proposals });
  return true;
}

export async function findProposal(treeId: string, id: string): Promise<Proposal | null> {
  return (await getProposalBook(treeId)).proposals.find((p) => p.id === id) ?? null;
}
