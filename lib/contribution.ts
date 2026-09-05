import type { Memory, Person } from "@/types/family";

/**
 * HİKÂYE TALEBİ — ONAY KUYRUĞU (madde 49/50), saf mantık.
 *
 * ## Ne yapıyor
 *
 * Ağaç sahibi bir akrabaya soru gönderiyor ("Babaannenin en çok yaptığı yemek
 * neydi?"), akraba jetonlu bağlantıdan GİRİŞ YAPMADAN yanıtlıyor. Yanıt
 * kayda DOĞRUDAN YAZILMIYOR: bir onay kuyruğuna düşüyor ve ağaç sahibi
 * onaylayınca `Memory` olarak kişinin kaydına giriyor.
 *
 * ## Neden kuyruk — bu maddenin bütün meselesi
 *
 * Girişsiz yanıtın doğrudan yazması, ürünün en değerli şeyine (aile kaydının
 * kendisine) kimliksiz yazma yetkisi vermek olurdu. Bağlantı bir kez
 * iletildiğinde kimin elinde olduğu bilinemez: yönlendirilmiş bir posta,
 * ortak kullanılan bir telefon, ekran görüntüsü. Kuyruk, o belirsizliği
 * kaydın DIŞINDA tutuyor.
 *
 * Kayıt disiplini de bunu gerektiriyor: bu depoda hiçbir iddia kaynaksız
 * girmiyor. Onaylanan katkı "kim anlattı" bilgisini taşıyor.
 *
 * ## Onay KİMDE
 *
 * Ağaç sahibinde — platformda değil. Her aile kendi ağacına gireni kendi
 * onaylar. Merkezî bir onay, on binlerce ailenin hikâyesini tek bir darboğaza
 * ve tek bir yabancının okumasına bağlamak olurdu.
 *
 * ## Anonim yazmanın savunması metnin KENDİSİNDE
 *
 * `lib/gathering.ts`teki (madde 36) aynı ilke: kimlik doğrulaması olmadığı
 * için "kim yaptı" sorulamaz, savunma boyut ve sayı sınırlarında olmak
 * zorunda. Rotadaki paylaşımlı oran sınırı bunun üstüne biniyor.
 *
 * Saf ve bağımlılıksız (yalnız tip düzeyinde `@/`) — birim testi koşulabilsin.
 */

/* ── Sınırlar ─────────────────────────────────────────────────────────────── */

/** Yanıtı yazanın adı. */
export const MAX_AUTHOR = 80;
/** Yanıt metni. Bir hikâye için geniş, bir depolama saldırısı için dar. */
export const MAX_TEXT = 4000;
/** TEK JETONLA gönderilebilecek yanıt sayısı. */
export const MAX_PER_TOKEN = 5;
/** Bir ağacın onay bekleyen toplam katkı sayısı. */
export const MAX_PENDING = 200;

export type ContributionStatus = "bekliyor" | "onaylandi" | "reddedildi";

export interface Contribution {
  id: string;
  /** Hangi kişi hakkında. */
  personId: string;
  /** Sorulan soru — `lib/prompts.ts` anahtarı ya da serbest metin. */
  question: string;
  /** Yanıtı yazan akraba (kendi yazdığı ad; DOĞRULANMIŞ DEĞİL). */
  authorName: string;
  text: string;
  /** Gönderim anı (ISO). */
  at: string;
  status: ContributionStatus;
  /** Hangi talep jetonundan geldi — kota ve iptal için. */
  requestId: string;
}

/** Ağaç sahibinin gönderdiği talep. Jetonun ÖZETİ saklanır, hamı bağlantıda. */
export interface StoryRequest {
  id: string;
  personId: string;
  question: string;
  /** Kime gönderildi (bilgi amaçlı; doğrulama değil). */
  sentTo?: string;
  createdAt: string;
  /** Son kullanma (ISO). Süresiz bir yazma yüzeyi açık kapı demektir. */
  expiresAt: string;
  /** Ağaç sahibi kapattı mı? Süreden bağımsız, elle kapatma. */
  closed?: boolean;
}

/* ── Gönderim ─────────────────────────────────────────────────────────────── */

export type SubmitError =
  | "talep-yok"
  | "kapali"
  | "suresi-dolmus"
  | "ad-gerekli"
  | "metin-gerekli"
  | "metin-uzun"
  | "jeton-kotasi"
  | "kuyruk-dolu";

export interface SubmitInput {
  authorName?: unknown;
  text?: unknown;
}

/**
 * Girişsiz gönderim kabul edilir mi?
 *
 * Sıra ÖNEMLİ: önce talebin kendisi (var mı, açık mı, süresi geçmiş mi),
 * sonra içerik, en sonda kotalar. Kota önce denetlenseydi, geçersiz bir
 * jetonla dövmek de kotayı tüketir ve gerçek akrabayı kilitlerdi.
 */
export function planSubmit(
  request: StoryRequest | null | undefined,
  input: SubmitInput,
  now: Date,
  counts: { forToken: number; pendingInTree: number }
): { ok: true; authorName: string; text: string } | { ok: false; error: SubmitError } {
  if (!request) return { ok: false, error: "talep-yok" };
  if (request.closed) return { ok: false, error: "kapali" };
  if (now.getTime() >= new Date(request.expiresAt).getTime())
    return { ok: false, error: "suresi-dolmus" };

  const ad = typeof input.authorName === "string" ? input.authorName.trim() : "";
  if (!ad) return { ok: false, error: "ad-gerekli" };

  const metin = typeof input.text === "string" ? input.text.trim() : "";
  if (!metin) return { ok: false, error: "metin-gerekli" };
  if (metin.length > MAX_TEXT) return { ok: false, error: "metin-uzun" };

  /*
   * Kotalar en sonda ve İKİ katmanlı. Jeton kotası tek bir bağlantının
   * sınırsız yazmasını, kuyruk tavanı da birçok jetonun birleşip ağacın
   * deposunu şişirmesini engelliyor. Biri olmadan öbürü yetmez: tek jeton
   * kotası varken yüz jeton hâlâ beş yüz kayıt demek.
   */
  if (counts.forToken >= MAX_PER_TOKEN) return { ok: false, error: "jeton-kotasi" };
  if (counts.pendingInTree >= MAX_PENDING) return { ok: false, error: "kuyruk-dolu" };

  return { ok: true, authorName: ad.slice(0, MAX_AUTHOR), text: metin };
}

/* ── Onay ─────────────────────────────────────────────────────────────────── */

/**
 * Onaylanan katkının kişiye eklenecek `Memory` hâli.
 *
 * Anlatanın adı metne YAZILIYOR, ayrı bir alana değil: `Memory`de böyle bir
 * alan yok ve eklemek `Person` şemasını bu özellik için genişletmek olurdu.
 * Ama kaynağın kaybolmaması şart — "kim anlattı" bilgisi olmadan bu, kayda
 * giren kaynaksız bir iddia olurdu.
 */
export function toMemory(c: Contribution, id: string): Memory {
  return {
    id,
    prompt: c.question,
    text: `${c.text}\n\n— ${c.authorName} (${c.at.slice(0, 10)})`,
  };
}

/**
 * Onaydan sonra kişinin yeni `memories` listesi.
 *
 * Katkı ZATEN onaylanmışsa hiçbir şey yapılmıyor: onay düğmesine iki kez
 * basmak ya da aynı isteğin tekrarı, aynı hikâyeyi iki kez eklememeli.
 */
export function applyApproval(
  person: Person,
  c: Contribution,
  memoryId: string
): Person | null {
  if (c.status !== "bekliyor") return null;
  if (c.personId !== person.id) return null;
  return { ...person, memories: [...(person.memories ?? []), toMemory(c, memoryId)] };
}

/* ── Görünürlük ───────────────────────────────────────────────────────────── */

/**
 * Yanıtlayana gösterilecek talep bilgisi.
 *
 * Jeton, kişinin kimliği ve kuyruğun geri kalanı TAŞINMIYOR. Bağlantıyı alan
 * kişi yalnız kendisine sorulan soruyu görmeli; ağacın içine bir pencere
 * açılmamalı. `lib/gathering.ts`teki `publicGathering` ile aynı ilke.
 */
export function publicRequest(
  r: StoryRequest,
  subjectName: string
): { question: string; subjectName: string; closed: boolean } {
  return { question: r.question, subjectName, closed: !!r.closed };
}
