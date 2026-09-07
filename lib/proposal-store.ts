import { mutateStore } from "@/lib/store-mutate";
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

/**
 * Bu deponun oku→değiştir→yaz sarmalayıcısı.
 *
 * Kural ve gerekçesi artık ORTAK katmanda (`lib/store-mutate.ts`): koruma
 * önce yalnız burada vardı ve öbür yedi depo korumasız kalmıştı. Kuralın tek
 * bir yerde durması, "hangi depoda var" sorusunun bir daha sorulmaması
 * demek.
 */
function mutate<T>(
  treeId: string,
  degistir: (book: ProposalBook) => { yaz: boolean; sonuc: T }
): Promise<T> {
  return mutateStore(() => getProposalBook(treeId), (b) => save(treeId, b), degistir, "Öneri kuyruğu");
}

export async function listProposals(treeId: string): Promise<Proposal[]> {
  return (await getProposalBook(treeId)).proposals;
}

/** Yeni öneri ekler. Tavan/kuyruk kuralı saf katmanda (`planProposal`). */
export async function addProposal(
  treeId: string,
  yeni: Omit<Proposal, "id">
): Promise<{ ok: true; proposal: Proposal } | { ok: false; fail: "kuyruk-dolu" }> {
  const proposal: Proposal = { ...yeni, id: randomUUID() };
  type Sonuc = { ok: true; proposal: Proposal } | { ok: false; fail: "kuyruk-dolu" };
  return mutate<Sonuc>(treeId, (book) => {
    const r = planProposal(book.proposals, proposal);
    if (!r.ok) return { yaz: false, sonuc: r };
    book.proposals = r.list;
    return { yaz: true, sonuc: { ok: true, proposal } };
  });
}

/**
 * Öneriyi kaydın YERİNE yazar.
 *
 * Çağıran karar mantığını (`decide`) saf katmanda çalıştırıp sonucu buraya
 * veriyor; burada iş kuralı YOK, yalnız yazma. Kural iki yere bölünseydi
 * ikisi ayrışırdı.
 */
export async function replaceProposal(treeId: string, p: Proposal): Promise<boolean> {
  return mutate(treeId, (book) => {
    const i = book.proposals.findIndex((x) => x.id === p.id);
    if (i === -1) return { yaz: false, sonuc: false };
    book.proposals = book.proposals.map((x, j) => (j === i ? p : x));
    return { yaz: true, sonuc: true };
  });
}

/**
 * BİRDEN ÇOK öneriyi tek yazmada değiştirir — toplu onay için.
 *
 * `replaceProposal`ı döngüye almak akla yakın ama pahalı ve kırılgan: her
 * çağrı kitabı okuyup yazıyor, yani 20 önerilik bir toplu onay 40 Blob
 * isteği ve 20 ayrı çakışma penceresi demek. Arada başka biri öneri açarsa
 * döngünün ortasında çakışma denemeleri tükenir ve toplu onay YARIM kalır:
 * ağaç yazılmış, önerilerin bir kısmı hâlâ "bekliyor".
 *
 * Bulunamayan kimlikler sessizce atlanıyor; kaç tanesinin yazıldığı
 * dönüyor. Çağıran ağaca zaten yazmış oluyor ve eksik damga, öneriyi
 * "bekliyor" bırakmaktan başka bir şey bozmuyor (`applyProposal` idempotent).
 */
export async function replaceProposals(treeId: string, list: Proposal[]): Promise<number> {
  if (list.length === 0) return 0;
  return mutate(treeId, (book) => {
    const yeni = new Map(list.map((p) => [p.id, p]));
    let sayi = 0;
    book.proposals = book.proposals.map((x) => {
      const y = yeni.get(x.id);
      if (!y) return x;
      sayi++;
      return y;
    });
    return { yaz: sayi > 0, sonuc: sayi };
  });
}

export async function findProposal(treeId: string, id: string): Promise<Proposal | null> {
  return (await getProposalBook(treeId)).proposals.find((p) => p.id === id) ?? null;
}
