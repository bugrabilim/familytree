import "server-only";
import { put, list, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import type { Letter, LetterBox } from "@/types/letter";
import { MAX_LETTERS, normalizeLetter, publicViewAll, sortLetters } from "@/lib/letters";

/**
 * Mektup kutusu deposu — ağaç başına `letters-<treeId>.json`.
 *
 * KAPININ YERİ. Kilitli bir mektubun metni bu dosyadan dışarı YALNIZ
 * `readLetters` üzerinden çıkar ve orada `publicViewAll` uygulanır. Ham kutuyu
 * döndüren `getLetterBox` dışa aktarılmaz: dışarıdan çağrılabilseydi, bir
 * rotanın yanlışlıkla ham veriyi döndürmesi bir satırlık hata olurdu.
 */

function pathname(treeId: string) {
  return `letters-${treeId}.json`;
}

const empty = (): LetterBox => ({ letters: [], updatedAt: new Date(0).toISOString() });

async function getLetterBox(treeId: string): Promise<LetterBox> {
  const path = pathname(treeId);
  try {
    const direct = await get(path, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      return normalizeBox((await new Response(direct.stream).json()) as LetterBox);
    }
  } catch {
    /* (2)'ye düş */
  }
  try {
    const found = await list({ prefix: path, limit: 1 });
    const blob = found.blobs[0];
    if (!blob) return empty();
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`mektuplar okunamadı (HTTP ${res.status})`);
    return normalizeBox((await res.json()) as LetterBox);
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

function normalizeBox(raw: Partial<LetterBox> | null): LetterBox {
  const arr = Array.isArray(raw?.letters) ? raw!.letters : [];
  return {
    letters: arr.filter(
      (l): l is Letter =>
        !!l && typeof l.id === "string" && typeof l.title === "string" && typeof l.opensOn === "string"
    ),
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

async function saveBox(treeId: string, box: LetterBox): Promise<void> {
  box.updatedAt = new Date().toISOString();
  await put(pathname(treeId), JSON.stringify(box), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/**
 * DIŞARIYA VERİLECEK liste — kilitlilerin metni ÇIKARILMIŞ.
 *
 * Rotaların kullanacağı tek okuma yolu budur. Kilidi burada uygulamak, "istemci
 * gizlesin" demekten farklıdır: kilitli metin sunucudan hiç çıkmaz, dolayısıyla
 * ağ sekmesinde, RSC yükünde ya da önbellekte de bulunmaz.
 */
export async function readLetters(treeId: string, now: Date = new Date()): Promise<Letter[]> {
  const box = await getLetterBox(treeId);
  return publicViewAll(sortLetters(box.letters, now), now);
}

export async function addLetter(treeId: string, input: Partial<Letter>): Promise<Letter | null> {
  const box = await getLetterBox(treeId);
  if (box.letters.length >= MAX_LETTERS) return null;
  const letter = normalizeLetter(input, new Date().toISOString());
  if (!letter) return null;
  letter.id = randomUUID();
  box.letters.push(letter);
  await saveBox(treeId, box);
  return letter;
}

export async function updateLetter(
  treeId: string,
  id: string,
  input: Partial<Letter>
): Promise<Letter | null> {
  const box = await getLetterBox(treeId);
  const i = box.letters.findIndex((l) => l.id === id);
  if (i === -1) return null;
  const next = normalizeLetter(input, new Date().toISOString(), box.letters[i]);
  if (!next) return null;
  box.letters[i] = next;
  await saveBox(treeId, box);
  return next;
}

export async function deleteLetter(treeId: string, id: string): Promise<boolean> {
  const box = await getLetterBox(treeId);
  const before = box.letters.length;
  box.letters = box.letters.filter((l) => l.id !== id);
  if (box.letters.length === before) return false;
  await saveBox(treeId, box);
  return true;
}

/** Kutuda kaç mektup var — sınır iletisi için. */
export async function countLetters(treeId: string): Promise<number> {
  return (await getLetterBox(treeId)).letters.length;
}
