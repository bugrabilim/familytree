/**
 * GELEN POSTA — saf ayrıştırma ve saklama kuralları.
 *
 * `bilgi@soylus.com` giden postaların yanıt adresi (`EMAIL_REPLY_TO`). Oraya
 * yazan kişi bir aile üyesi, bir soru soran, bazen de sadece bir bot. Bu
 * dosya, o postaların uygulamanın içinde okunabilir hâle gelmesini sağlıyor.
 *
 * ## HTML SAKLANMIYOR — bu dosyanın tek en önemli kararı
 *
 * Gelen postanın gövdesi TAMAMEN yabancı bir kaynaktan geliyor ve içeriğini
 * gönderen belirliyor. O HTML'i saklayıp yönetici ekranında çizmek, sayfaya
 * saldırganın seçtiği işaretlemeyi koymak demek: betik, izleme pikseli,
 * sahte form. Dolayısıyla yalnız DÜZ METİN saklanıyor ve yalnız düz metin
 * gösteriliyor. Postanın "güzel" görünmemesi kabul edilen bedel.
 *
 * ## Ekler saklanmıyor
 *
 * Yabancının gönderdiği dosyaları kendi deponuza indirmek, bilmediğiniz
 * içeriği kendi altyapınızda barındırmak demek. Yalnız ADI ve boyutu
 * kaydediliyor; dosyanın kendisi sağlayıcıda kalıyor.
 *
 * ## Sayı ve boyut sınırları
 *
 * Uç, tanımı gereği herkese açık: adresi bilen herkes bize posta
 * gönderebilir. Kimlik doğrulaması olmadığı için savunma boyut ve sayı
 * sınırlarında olmak zorunda — `lib/gathering.ts` ve `lib/contribution.ts`
 * ile aynı ilke.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

/* ── Sınırlar ─────────────────────────────────────────────────────────────── */

export const MAX_SUBJECT = 200;
/** Bir postanın saklanan metni. Uzun yazışma için geniş, depo şişirmek için dar. */
export const MAX_TEXT = 20_000;
/** Kutuda tutulan toplam posta. Aşılırsa EN ESKİ düşer. */
export const MAX_MAILS = 500;
export const MAX_ADDR = 254;
/** Kayda geçen ek adı sayısı. */
export const MAX_ATTACHMENTS = 20;

export interface Attachment {
  name: string;
  size?: number;
}

export interface Mail {
  id: string;
  /** Gönderen adresi (normalleştirilmiş). */
  from: string;
  /** Gönderenin yazdığı görünen ad — DOĞRULANMIŞ DEĞİL. */
  fromName?: string;
  /** Bizim hangi adresimize geldi. */
  to: string;
  subject: string;
  /** YALNIZ düz metin. HTML bilerek saklanmıyor. */
  text: string;
  /** Geliş anı (ISO). */
  at: string;
  read?: boolean;
  repliedAt?: string;
  /** Postanın kendi `Message-ID`'si — yanıtta zincir kurmak için. */
  messageId?: string;
  attachments?: Attachment[];
}

/* ── Adres ────────────────────────────────────────────────────────────────── */

/**
 * `"Ayşe Yılmaz <ayse@ornek.com>"` → `ayse@ornek.com`.
 *
 * Yerel AÇIKÇA "en": `toLowerCase()` Türkçe yerelde "I"yı "ı" yapar ve
 * "ALI@x.com" adresi "alı@x.com"a döner — var olmayan bir adrese yanıt
 * gönderilir ve kimse nedenini anlamaz. Depoda bu tuzağa iki kez düşüldü.
 */
export function normalizeAddress(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const kose = raw.match(/<([^>]+)>/);
  const s = (kose ? kose[1] : raw).trim().toLocaleLowerCase("en");
  if (!s || s.length > MAX_ADDR) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s;
}

/** `"Ayşe Yılmaz <ayse@ornek.com>"` → `Ayşe Yılmaz`. Yoksa boş. */
export function displayName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const i = raw.indexOf("<");
  if (i <= 0) return "";
  return raw.slice(0, i).trim().replace(/^"|"$/g, "").slice(0, 120);
}

/* ── Ayrıştırma ───────────────────────────────────────────────────────────── */

type Json = Record<string, unknown>;

const metin = (v: unknown): string => (typeof v === "string" ? v : "");

/** `to` alanı dizi de olabilir tek metin de; ikisini de kabul ediyoruz. */
function ilkAdres(v: unknown): string {
  if (Array.isArray(v)) {
    for (const x of v) {
      const a = normalizeAddress(typeof x === "string" ? x : (x as Json)?.address);
      if (a) return a;
    }
    return "";
  }
  return normalizeAddress(typeof v === "string" ? v : (v as Json)?.address);
}

/**
 * Sağlayıcı yükünü `Mail`e çevirir. Ayrıştırılamıyorsa `null`.
 *
 * BİÇİM TOLERANSLI olması bilinçli: `from` bazı yüklerde düz metin, bazısında
 * `{ address, name }` nesnesi; `to` tek adres ya da dizi; metin `text` ya da
 * `plain` altında gelebiliyor. Sağlayıcı alan adını değiştirdiğinde postanın
 * SESSİZCE kaybolması, katı bir ayrıştırıcının en kötü sonucu olurdu —
 * kimse fark etmez, yalnız gelen kutusu boş kalır.
 */
export function parseInbound(payload: unknown, id: string, now: Date): Mail | null {
  if (!payload || typeof payload !== "object") return null;
  const kok = payload as Json;
  const d = (typeof kok.data === "object" && kok.data ? kok.data : kok) as Json;

  const fromRaw = typeof d.from === "string" ? d.from : metin((d.from as Json)?.address);
  const from = normalizeAddress(fromRaw);
  if (!from) return null;

  const to = ilkAdres(d.to);
  if (!to) return null;

  /*
   * HTML'e HİÇ BAKILMIYOR — metin yoksa boş bırakılıyor. HTML'den metin
   * türetmek cazip ama o dönüşüm, saklamamaya karar verdiğimiz içeriği
   * dolambaçlı yoldan içeri almak olurdu.
   */
  const govde = metin(d.text) || metin(d.plain) || metin((d as Json).body as string);

  const ekler: Attachment[] = Array.isArray(d.attachments)
    ? (d.attachments as Json[])
        .slice(0, MAX_ATTACHMENTS)
        .map((a) => ({
          name: metin(a?.filename ?? a?.name).slice(0, 200) || "(adsız)",
          size: typeof a?.size === "number" ? a.size : undefined,
        }))
    : [];

  return {
    id,
    from,
    fromName: displayName(fromRaw) || undefined,
    to,
    subject: metin(d.subject).trim().slice(0, MAX_SUBJECT) || "(konusuz)",
    text: govde.slice(0, MAX_TEXT),
    at: now.toISOString(),
    messageId: metin(d.message_id ?? d.messageId) || undefined,
    ...(ekler.length ? { attachments: ekler } : {}),
  };
}

/* ── Saklama ──────────────────────────────────────────────────────────────── */

/**
 * Yeni postayı listeye ekler; tavan aşılırsa EN ESKİSİ düşer.
 *
 * Yeni olanı reddetmek yerine eskiyi düşürmek bilinçli: kutu dolduğunda
 * gelen yeni postanın kaybolması, tam da okunmak istenen postanın kaybolması
 * demek olurdu. Eskiler zaten okunmuş.
 */
export function planStore(mevcut: Mail[], yeni: Mail): Mail[] {
  // Aynı kimlikle ikinci kez gelirse (sağlayıcı yeniden denemesi) çoğaltma.
  if (mevcut.some((m) => m.id === yeni.id)) return mevcut;
  const liste = [yeni, ...mevcut];
  return liste.length > MAX_MAILS ? liste.slice(0, MAX_MAILS) : liste;
}

/* ── Yanıt ────────────────────────────────────────────────────────────────── */

/** `"Merhaba"` → `"Re: Merhaba"`; zaten `Re:` varsa İKİNCİSİ eklenmiyor. */
export function replySubject(subject: string): string {
  const s = subject.trim();
  if (/^re\s*:/i.test(s)) return s.slice(0, MAX_SUBJECT);
  return `Re: ${s}`.slice(0, MAX_SUBJECT);
}

/**
 * Yanıtın altına eklenen alıntı.
 *
 * Alıntı olmadan, yanıtı alan kişi neyin yanıtı olduğunu göremez — özellikle
 * araya günler girdiğinde. Uzun postalar KIRPILIYOR: alıntı bir bağlam
 * hatırlatması, tam bir kopya değil.
 */
export function quoteForReply(m: Pick<Mail, "from" | "at" | "text">, limit = 2000): string {
  const govde = m.text.length > limit ? `${m.text.slice(0, limit)}\n…` : m.text;
  const satirlar = govde.split("\n").map((l) => `> ${l}`).join("\n");
  return `\n\n${m.at.slice(0, 10)} tarihinde ${m.from} yazdı:\n${satirlar}`;
}

/**
 * Yanıtın zincir başlıkları. Posta istemcileri bunlarla yanıtı özgün
 * yazışmanın ALTINA yerleştiriyor; olmazsa yanıt ayrı bir konu gibi düşer ve
 * karşı taraf neyin yanıtı olduğunu anlamaz.
 */
export function threadHeaders(m: Pick<Mail, "messageId">): Record<string, string> {
  if (!m.messageId) return {};
  return { "In-Reply-To": m.messageId, References: m.messageId };
}
