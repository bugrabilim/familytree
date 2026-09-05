/**
 * GELEN POSTA — saf ayrıştırma ve saklama kuralları.
 *
 * `bilgi@soylus.com` giden postaların yanıt adresi (`EMAIL_REPLY_TO`). Oraya
 * yazan kişi bir aile üyesi, bir soru soran, bazen de sadece bir bot. Bu
 * dosya, o postaların uygulamanın içinde okunabilir hâle gelmesini sağlıyor.
 *
 * ## HTML SAKLANMIYOR, ÇİZİLMİYOR — bu dosyanın tek en önemli kararı
 *
 * Gelen postanın gövdesi TAMAMEN yabancı bir kaynaktan geliyor ve içeriğini
 * gönderen belirliyor. O HTML'i saklayıp yönetici ekranında çizmek, sayfaya
 * saldırganın seçtiği işaretlemeyi koymak demek: betik, izleme pikseli,
 * sahte form. Dolayısıyla HTML ne saklanıyor ne de çiziliyor; yalnız DÜZ
 * METİN saklanıyor ve yalnız düz metin gösteriliyor. Postanın "güzel"
 * görünmemesi kabul edilen bedel.
 *
 * ## Ama HTML'den METİN ÇIKARILIYOR — ve bu bir çelişki değil
 *
 * Bu dosya önce "html'e hiç bakılmaz" diyordu ve o kural YANLIŞTI: iki ayrı
 * şeyi birbirine karıştırıyordu. Tehlikeli olan, işaretlemenin TARAYICIDA
 * YORUMLANMASI; karakterlerin kendisi değil. `htmlToText` çıktısı düz metin
 * olarak saklanıp düz metin olarak çiziliyor, yani hiçbir etiket
 * yorumlanmıyor.
 *
 * Kuralın bedeli somuttu: bugünün postalarının çoğu yalnız HTML gövdeli.
 * "Bakmayız" demek, gelen postaların çoğunu BOŞ göstermek demekti — güvenlik
 * kazancı olmadan, yalnızca kullanılmaz bir gelen kutusu.
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

/** Gövde çekme durumu — `undefined` "gövde var" demek. */
export type BodyFetchState =
  /** Henüz denenmedi ya da yeniden denenebilir. */
  | "bekliyor"
  /** API anahtarının izni yetmiyor (yalnız gönderim yetkisi). */
  | "yetki"
  /** Sağlayıcıda kayıt yok — büyük ihtimalle saklama süresi doldu. */
  | "bulunamadi"
  /** Ağ/sunucu hatası; yeniden denenebilir. */
  | "hata"
  /** API anahtarı hiç tanımlı değil. */
  | "yapilandirilmamis";

/** Gönderilmiş bir yanıt. */
export interface Reply {
  text: string;
  /** Gönderim anı (ISO). */
  at: string;
}

/** Bir postaya saklanan yanıt sayısı. */
export const MAX_REPLIES = 20;

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
  /**
   * Gönderilmiş yanıtlar.
   *
   * Yalnız "yanıtlandı" damgası yetmiyordu: kullanıcı NE yazdığını
   * göremiyordu. Bir gelen kutusunda yazışmanın yarısını gizlemek, üç gün
   * sonra "ben buna ne demiştim?" sorusunu yanıtsız bırakmak demek — ve o
   * soru gerçekten soruluyor.
   */
  replies?: Reply[];
  /** Postanın kendi `Message-ID`'si — yanıtta zincir kurmak için. */
  messageId?: string;
  /**
   * Sağlayıcıdaki kayıt kimliği (`email_id`).
   *
   * Saklanmasının sebebi somut: gelen webhook yükü postanın GÖVDESİNİ
   * taşımıyor (yalnız üstbilgi ve konu). Gövdeye sonradan ulaşmak
   * gerekirse tek tutamak bu kimlik — atılsaydı, geriye dönüp almanın yolu
   * kalmazdı.
   */
  providerId?: string;
  /**
   * Gövdeyi ÇEKME denemesinin sonucu. Yokluğu "gövde elimizde" demek.
   *
   * Sağlayıcının bildirimi gövdeyi taşımıyor (bilerek: sunucusuz ortamların
   * istek boyutu sınırları var). Gövde ayrı bir çağrıyla alınıyor ve o çağrı
   * başarısız olabiliyor — en olası sebebi API anahtarının izninin
   * yetmemesi. Sebebi SAKLAMAK şart: yoksa ekranda boş bir gövde görünür ve
   * "kişi boş posta atmış" ile "biz alamadık" ayırt edilemez.
   */
  bodyFetch?: BodyFetchState;
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

/* ── HTML → düz metin ─────────────────────────────────────────────────────── */

/**
 * HTML gövdeden okunabilir düz metin çıkarır.
 *
 * Saf dize işlemi: DOM yok, değerlendirme yok, çıktı düz metin. Tehlike
 * işaretlemenin YORUMLANMASINDA; burada yorumlanan hiçbir şey yok.
 *
 * `script` ve `style` blokları İÇERİKLERİYLE birlikte atılıyor — yalnız
 * etiketleri atmak, betik kaynağını metin diye göstermek olurdu (zararsız
 * ama okunmaz). `head` de öyle.
 *
 * Blok geçişleri satır sonuna çevriliyor, yoksa bütün posta tek bir upuzun
 * satır olurdu ve okunamazdı.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    // Görünmeyen bloklar: içerikleriyle birlikte.
    .replace(/<(script|style|head|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Yapıyı koruyan geçişler.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|table|section|article)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    // Kalan bütün etiketler.
    .replace(/<[^>]+>/g, "")
    // Yaygın varlıklar. Sayısal olanlar da çözülüyor ki "&#39;" gibi
    // diziler ekranda ham kalmasın.
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const kod = Number(n);
      return Number.isFinite(kod) && kod > 0 && kod < 0x110000 ? String.fromCodePoint(kod) : "";
    })
    // Boşluk temizliği: satır yapısı korunur, fazlalık gider.
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Ayrıştırma ───────────────────────────────────────────────────────────── */

type Json = Record<string, unknown>;

const metin = (v: unknown): string => (typeof v === "string" ? v : "");

/** `to` alanı dizi de olabilir tek metin de; ikisini de kabul ediyoruz. */
function ilkAdres(v: unknown): string {
  if (Array.isArray(v)) {
    for (const x of v) {
      const a = normalizeAddress(
        typeof x === "string" ? x : (x as Json)?.address ?? (x as Json)?.email
      );
      if (a) return a;
    }
    return "";
  }
  return normalizeAddress(
    typeof v === "string" ? v : (v as Json)?.address ?? (v as Json)?.email
  );
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
/**
 * GÖNDERİM olayları — bunlar gelen posta DEĞİL.
 *
 * Webhook aboneliğinde yanlışlıkla gönderim olayları da seçilirse, bizim
 * GÖNDERDİĞİMİZ her posta gelen kutusuna "gelmiş" gibi düşerdi: kendi
 * hatırlatmalarımız, kendi onay sorularımız. Kutu kendi yankımızla dolardı
 * ve bunu fark etmek zor olurdu — kayıtlar gerçek postaya benziyor.
 *
 * Liste OLUMSUZ tanımlı, olumlu değil: gelen olayın adını tahmin edip
 * "yalnız buna izin ver" demek, sağlayıcı adı değiştirdiğinde bütün postayı
 * sessizce elemek olurdu. Bilinen gönderim olayları dışlanıyor, gerisi
 * geçiyor.
 */
const GONDERIM_OLAYLARI = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.complained",
  "email.bounced",
  "email.opened",
  "email.clicked",
  "email.failed",
]);

/** Ayrıştırma neden başarısız oldu — günlüğe yazmak için. */
export type ParseFail =
  | "yuk-nesne-degil"
  | "gonderim-olayi"
  | "gonderen-yok"
  | "alici-yok";

/**
 * Yükün ALAN ADLARINI döndürür — değerlerini DEĞİL.
 *
 * Ayrıştırma başarısız olduğunda günlüğe bu yazılıyor: sağlayıcının hangi
 * biçimi gönderdiğini görmek için ad listesi yeter ve kişisel veri
 * taşımıyor. Yükün kendisini loglamak, yabancının yazdığı postayı
 * günlüklere kopyalamak olurdu.
 */
export function payloadShape(payload: unknown): string {
  if (!payload || typeof payload !== "object") return typeof payload;
  const kok = payload as Json;
  const ust = Object.keys(kok).join(",");
  const d = kok.data;
  if (d && typeof d === "object") return `${ust} | data: ${Object.keys(d as Json).join(",")}`;
  return ust;
}

export function parseInbound(payload: unknown, id: string, now: Date): Mail | null {
  const r = parseInboundResult(payload, id, now);
  return "mail" in r ? r.mail : null;
}

/**
 * `parseInbound`ın NEDEN döndüren hâli.
 *
 * Ayrı olması şart: başarısızlık sessiz kalmamalı. Rota bu nedeni günlüğe
 * yazıyor — "gelen kutusu boş" ile "posta hiç gelmedi" arasındaki farkı
 * ancak böyle görebiliyoruz. Bu ayrımı yapamamak, ilk gerçek denemede tam
 * olarak yaşandı.
 */
export function parseInboundResult(
  payload: unknown,
  id: string,
  now: Date
): { mail: Mail } | { fail: ParseFail } {
  if (!payload || typeof payload !== "object") return { fail: "yuk-nesne-degil" };
  const kok = payload as Json;

  const tur = metin(kok.type);
  if (tur && GONDERIM_OLAYLARI.has(tur)) return { fail: "gonderim-olayi" };

  const d = (typeof kok.data === "object" && kok.data ? kok.data : kok) as Json;

  /*
   * `from` üç biçimde gelebiliyor: düz metin, `{ address }` ya da
   * `{ email }`. Üçü de deneniyor — sağlayıcının alan adı değiştiğinde
   * postanın SESSİZCE kaybolması, katı bir ayrıştırıcının en kötü sonucu.
   */
  const fromRaw =
    typeof d.from === "string"
      ? d.from
      : metin((d.from as Json)?.address) || metin((d.from as Json)?.email);
  const from = normalizeAddress(fromRaw) || normalizeAddress(metin(d.sender));
  if (!from) return { fail: "gonderen-yok" };

  const to = ilkAdres(d.to) || ilkAdres(d.recipient) || ilkAdres(d.recipients);
  if (!to) return { fail: "alici-yok" };

  /*
   * Önce düz metin; yoksa HTML'den ÇIKARILIYOR (bkz. dosya başındaki not —
   * saklanan ve çizilen şey her hâlükârda düz metin).
   */
  const govde =
    metin(d.text) ||
    metin(d.plain) ||
    metin((d as Json).body as string) ||
    htmlToText(metin(d.html));

  const ekler: Attachment[] = Array.isArray(d.attachments)
    ? (d.attachments as Json[])
        .slice(0, MAX_ATTACHMENTS)
        .map((a) => ({
          name: metin(a?.filename ?? a?.name).slice(0, 200) || "(adsız)",
          size: typeof a?.size === "number" ? a.size : undefined,
        }))
    : [];

  return {
    mail: {
      id,
      from,
      fromName: displayName(fromRaw) || undefined,
      to,
      subject: metin(d.subject).trim().slice(0, MAX_SUBJECT) || "(konusuz)",
      text: govde.slice(0, MAX_TEXT),
      at: now.toISOString(),
      messageId: metin(d.message_id ?? d.messageId) || undefined,
      providerId: metin(d.email_id ?? d.emailId) || undefined,
      /*
       * Gövde bildirimde yoksa "bekliyor" işaretleniyor — ayrı çağrıyla
       * alınacak. İşaret konmasaydı, gövdesiz posta ile gerçekten boş posta
       * birbirinden ayırt edilemezdi.
       */
      ...(govde ? {} : { bodyFetch: "bekliyor" as const }),
      ...(ekler.length ? { attachments: ekler } : {}),
    },
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

/**
 * Yeni yanıtı listeye ekler; tavan aşılırsa EN ESKİSİ düşer.
 *
 * `planStore` ile aynı yön: dolduğunda yeni olanı reddetmek, tam da az önce
 * yazılanı kaybetmek olurdu.
 */
export function planReply(mevcut: Reply[] | undefined, yeni: Reply): Reply[] {
  const liste = [...(mevcut ?? []), yeni];
  return liste.length > MAX_REPLIES ? liste.slice(liste.length - MAX_REPLIES) : liste;
}


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
