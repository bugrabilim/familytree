import "server-only";
import { put, list, get, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";
import { MAX_TEXT, planReply, planStore, type BodyFetchState, type Mail } from "@/lib/inbox";
import { mutateBox, readBox, type Box, type BoxIO } from "@/lib/inbox-box";

/**
 * GELEN KUTUSU DEPOSU — `inbox.json`.
 *
 * Ağaç başına DEĞİL, site başına: bu kutu `bilgi@soylus.com`a yazanların
 * postaları, yani işletmecinin yazışması. Ağaç verisiyle karışmaması bilinçli
 * — bir ağacın yedeği alınırken ya da silinirken yabancıların postaları da
 * gitmemeli.
 *
 * Bu dosya artık YALNIZ Blob adaptörü: oku-değiştir-yaz kuralları (okunamayan
 * kutu boş sayılmaz; yazma sürüm damgasıyla koşulludur) `lib/inbox-box.ts`te
 * ve orada birim testi var. Buradaki `server-only` + `@vercel/blob` içe
 * aktarımları o testlerin koşmasını imkânsız kılıyordu.
 */

const PATHNAME = "inbox.json";

const io: BoxIO = {
  async read() {
    /*
     * (1) Doğrudan okuma — sürüm damgasını (ETag) YALNIZ bu yol veriyor,
     * yani koşullu yazma da yalnız bu yolla mümkün.
     */
    try {
      const direct = await get(PATHNAME, { access: "private", useCache: false });
      if (direct && direct.statusCode === 200) {
        return { raw: await new Response(direct.stream).json(), etag: direct.blob.etag };
      }
    } catch (e) {
      // Dosya gerçekten yoksa aramaya devam etmenin anlamı yok.
      if (e instanceof BlobNotFoundError) return null;
      /* Başka bir arıza: (2) ile bir şans daha. */
    }

    /*
     * (2) Liste üstünden okuma. Bazı kurulumlarda (1) çalışmıyor, bu yol
     * yedek. `blobs[0]` DEĞİL, tam ad eşleşmesi aranıyor: `list` önek
     * eşliyor ve `inbox.json.bak` gibi bir komşu dosya kutunun yerine
     * geçebilirdi.
     */
    const found = await list({ prefix: PATHNAME, limit: 100 });
    const blob = found.blobs.find((b) => b.pathname === PATHNAME);
    // Kutu gerçekten yok — ilk posta bunu oluşturacak.
    if (!blob) return null;
    const res = await fetch(blob.url, { cache: "no-store" });
    /*
     * BOŞ KUTU DÖNMÜYORUZ. Eskiden burada `return empty()` vardı ve tek bir
     * geçici 503, çağıranın kutunun ÜSTÜNE yazıp o ana kadarki bütün
     * postaları silmesine yol açıyordu — sessizce, webhook 200 dönerek.
     */
    if (!res.ok) throw new Error(`inbox.json okunamadı: ${res.status}`);
    // Damga yok: bu yolda koşullu yazma yapılamıyor (yedek yol, nadir).
    return { raw: await res.json() };
  },

  async write(box: Box, etag: string | undefined) {
    await put(PATHNAME, JSON.stringify(box), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      // Damga varsa yazma KOŞULLU: aradaki bir yazmayı ezmiyoruz.
      ...(etag ? { ifMatch: etag } : {}),
    });
  },

  isConflict: (e) => e instanceof BlobPreconditionFailedError,
};

export async function readInbox(): Promise<Mail[]> {
  return (await readBox(io)).mails;
}

/** Gelen postayı saklar. Tavan ve yineleme kuralı saf katmanda. */
export async function storeMail(mail: Mail): Promise<void> {
  await mutateBox(io, (box) => {
    const sonra = planStore(box.mails, mail);
    // Yineleme ise dosyaya hiç dokunmuyoruz: gereksiz sürüm üretmenin anlamı yok.
    if (sonra === box.mails) return { yaz: false, sonuc: undefined };
    box.mails = sonra;
    return { yaz: true, sonuc: undefined };
  });
}

export async function markRead(id: string, read: boolean): Promise<boolean> {
  return mutateBox(io, (box) => {
    const m = box.mails.find((x) => x.id === id);
    if (!m) return { yaz: false, sonuc: false };
    m.read = read;
    return { yaz: true, sonuc: true };
  });
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
  return mutateBox(io, (box) => {
    const m = box.mails.find((x) => x.id === id);
    if (!m) return { yaz: false, sonuc: false };
    m.repliedAt = at;
    m.read = true;
    if (text.trim()) m.replies = planReply(m.replies, { text: text.slice(0, MAX_TEXT), at });
    return { yaz: true, sonuc: true };
  });
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
  return mutateBox(io, (box) => {
    const m = box.mails.find((x) => x.id === id);
    if (!m) return { yaz: false, sonuc: false };
    if ("text" in sonuc) {
      m.text = sonuc.text;
      m.bodyFetch = undefined;
    } else {
      m.bodyFetch = sonuc.state;
    }
    return { yaz: true, sonuc: true };
  });
}

export async function findMail(id: string): Promise<Mail | null> {
  return (await readBox(io)).mails.find((m) => m.id === id) ?? null;
}

export async function deleteMail(id: string): Promise<boolean> {
  return mutateBox(io, (box) => {
    const before = box.mails.length;
    box.mails = box.mails.filter((m) => m.id !== id);
    if (box.mails.length === before) return { yaz: false, sonuc: false };
    return { yaz: true, sonuc: true };
  });
}
