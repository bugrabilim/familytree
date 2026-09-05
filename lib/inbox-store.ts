import "server-only";
import { put, list, get } from "@vercel/blob";
import { MAX_MAILS, MAX_TEXT, planReply, planStore, type BodyFetchState, type Mail } from "@/lib/inbox";

/**
 * GELEN KUTUSU DEPOSU — `inbox.json`.
 *
 * Ağaç başına DEĞİL, site başına: bu kutu `bilgi@soylus.com`a yazanların
 * postaları, yani işletmecinin yazışması. Ağaç verisiyle karışmaması bilinçli
 * — bir ağacın yedeği alınırken ya da silinirken yabancıların postaları da
 * gitmemeli.
 */

const PATHNAME = "inbox.json";

interface Box {
  mails: Mail[];
  updatedAt: string;
}

const empty = (): Box => ({ mails: [], updatedAt: new Date(0).toISOString() });

function normalize(raw: Partial<Box> | null): Box {
  const arr = Array.isArray(raw?.mails) ? raw!.mails : [];
  return {
    mails: arr
      .filter(
        (m): m is Mail =>
          !!m && typeof m.id === "string" && typeof m.from === "string" && typeof m.at === "string"
      )
      .slice(0, MAX_MAILS),
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

async function getBox(): Promise<Box> {
  try {
    const direct = await get(PATHNAME, { access: "private", useCache: false });
    if (direct && direct.statusCode === 200) {
      return normalize((await new Response(direct.stream).json()) as Partial<Box>);
    }
  } catch {
    /* (2)'ye düş */
  }
  try {
    const found = await list({ prefix: PATHNAME, limit: 1 });
    const blob = found.blobs[0];
    if (!blob) return empty();
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return empty();
    return normalize((await res.json()) as Partial<Box>);
  } catch {
    return empty();
  }
}

async function saveBox(box: Box): Promise<void> {
  box.updatedAt = new Date().toISOString();
  await put(PATHNAME, JSON.stringify(box), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readInbox(): Promise<Mail[]> {
  return (await getBox()).mails;
}

/** Gelen postayı saklar. Tavan ve yineleme kuralı saf katmanda. */
export async function storeMail(mail: Mail): Promise<void> {
  const box = await getBox();
  const sonra = planStore(box.mails, mail);
  // Yineleme ise dosyaya hiç dokunmuyoruz: gereksiz sürüm üretmenin anlamı yok.
  if (sonra === box.mails) return;
  box.mails = sonra;
  await saveBox(box);
}

export async function markRead(id: string, read: boolean): Promise<boolean> {
  const box = await getBox();
  const m = box.mails.find((x) => x.id === id);
  if (!m) return false;
  m.read = read;
  await saveBox(box);
  return true;
}

/**
 * Yanıt gönderildikten SONRA çağrılır: damga + yanıtın METNİ.
 *
 * Metnin saklanması sonradan eklendi çünkü damga tek başına yetmiyordu —
 * kullanıcı yanıtladığını görüyor ama NE yazdığını göremiyordu.
 *
 * Yalnız GÖNDERİM BAŞARILIYSA çağrılıyor (çağıran rotada denetleniyor):
 * gönderilmemiş bir metni "yanıtım" diye saklamak, olmayan bir yazışmayı
 * kayda geçirmek olurdu.
 */
export async function markReplied(id: string, at: string, text = ""): Promise<boolean> {
  const box = await getBox();
  const m = box.mails.find((x) => x.id === id);
  if (!m) return false;
  m.repliedAt = at;
  m.read = true;
  if (text.trim()) m.replies = planReply(m.replies, { text: text.slice(0, MAX_TEXT), at });
  await saveBox(box);
  return true;
}

/**
 * Gövdeyi yazar (ya da neden alınamadığını).
 *
 * Başarıda `bodyFetch` DÜŞÜYOR: alanın yokluğu "gövde elimizde" demek ve tek
 * bir doğruluk biçimi olsun. Bırakılıp "tamam" yazılsaydı, iki ayrı değer
 * aynı şeyi anlatır ve biri gün gelip unutulurdu.
 */
export async function setBody(
  id: string,
  sonuc: { text: string } | { state: BodyFetchState }
): Promise<boolean> {
  const box = await getBox();
  const m = box.mails.find((x) => x.id === id);
  if (!m) return false;
  if ("text" in sonuc) {
    m.text = sonuc.text;
    m.bodyFetch = undefined;
  } else {
    m.bodyFetch = sonuc.state;
  }
  await saveBox(box);
  return true;
}

export async function findMail(id: string): Promise<Mail | null> {
  return (await getBox()).mails.find((m) => m.id === id) ?? null;
}

export async function deleteMail(id: string): Promise<boolean> {
  const box = await getBox();
  const before = box.mails.length;
  box.mails = box.mails.filter((m) => m.id !== id);
  if (box.mails.length === before) return false;
  await saveBox(box);
  return true;
}
