import type {
  Ballot,
  Campaign,
  Currency,
  Debt,
  Decision,
  Kurus,
  Outcome,
  Pledge,
  Vote,
} from "../types/council.ts";
import { CURRENCIES, VOTES } from "../types/council.ts";

/**
 * AİLE MECLİSİ — saf mantık (defter matematiği, metin temizliği, tutanak
 * dondurma kuralı). Çalışma-zamanı `@/…` içe aktarması YOK; birim testi
 * `node --experimental-strip-types` ile doğrudan koşuyor.
 *
 * ## Neden burada hiç "ödeme" yok
 *
 * Bu katman bir DEFTER motoru. Topladığı şey sayı değil, BEYAN: "şu kadar
 * söz verdim", "şu kadarını gönderdim". Parayı ne alıyor ne tutuyor ne de
 * aktarıyoruz — gerekçesi `types/council.ts`in başında yazılı ve tek
 * cümlesi şu: uygulama içinde para hareketi ödeme kuruluşu lisansı ister.
 *
 * Bu dosyaya ileride "tahsilat", "bakiye", "kart" gibi bir kavram eklemek
 * isteyen olursa: eklenmesi gereken şey kod değil, lisans.
 *
 * ## Neden kuruş
 *
 * Bütün tutarlar kuruş cinsinden tamsayı. `parseMoney` bile ondalıklı sayı
 * üretmeden çalışıyor (dizgeyi ikiye bölüp iki tamsayı topluyor): bir kere
 * `Number("1.15") * 100` yazsak `114.99999999999999` ile karşılaşır ve
 * defterin toplamı kuruş kaydırırdı.
 */

/* ── Sınırlar ─────────────────────────────────────────────────────────── */

export const MAX_TITLE = 200;
export const MAX_PURPOSE = 1000;
export const MAX_NOTE = 500;
export const MAX_NAME = 80;
export const MAX_DETAIL = 4000;

export const MAX_CAMPAIGNS = 50;
export const MAX_PLEDGES = 300;
export const MAX_DEBTS = 300;
export const MAX_DECISIONS = 200;
export const MAX_BALLOTS = 500;

/**
 * Tek bir tutarın tavanı: 100 milyon TL (kuruş cinsinden 10^10).
 *
 * Tavan, hatalı girişin defteri anlamsızlaştırmasını engelliyor: bir hane
 * fazla yazılan taahhüt, "kalan" sütununu ve yüzdeyi tamamen bozar. Üstelik
 * `Number.MAX_SAFE_INTEGER`in çok altında kalıyoruz, yani toplamlar da
 * güvenli tamsayı aralığında.
 */
export const MAX_KURUS: Kurus = 10_000_000_000;

/* ── Metin temizliği ──────────────────────────────────────────────────── */

/**
 * IBAN ve uzun hesap numarası benzeri dizileri metinden DÜŞÜRÜR.
 *
 * Ürün kararı "IBAN saklamıyoruz" ise, serbest metin alanı o kararın açık
 * kapısıdır: alanı koymayız ama kullanıcı açıklamaya yazar ve IBAN yine
 * veritabanımıza girer — üstelik bu kez adı konmamış, silinmesi
 * planlanmamış, kimin göreceği kararlaştırılmamış bir yerde. Kararı YAPISAL
 * kılan şey bu işlev.
 *
 * Not: bu bir doğrulama değil, bir CAYDIRMA. IBAN'ını araya harf serpiştirerek
 * yazan biri elbette geçirebilir; amaç kazayla ve alışkanlıkla yazılanı
 * engellemek — asıl koruma, hiçbir yerde IBAN alanı OLMAMASI.
 */
export function stripIban(input: string): string {
  return (
    input
      /* 1a. Bitişik yazım: TR330006100519786457841326 */
      .replace(/\b[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}\b/g, " ")
      /*
       * 1b. Gruplu yazım: "TR33 0006 1005 1978 6457 8413 26".
       *
       * Ayraç ZORUNLU ve grup en fazla 6 karakter. İlk yazımda ayraç
       * isteğe bağlıydı ve kalıp açgözlü davranıp IBAN'dan SONRAKİ
       * kelimeyi de yutuyordu ("… 8413 26 numaraya" → "numaraya" da
       * siliniyordu). Temizlik, temizlediğinden fazlasını silmemeli.
       */
      .replace(/\b[A-Za-z]{2}\d{2}(?:[ -][A-Za-z0-9]{2,6}){2,10}\b/g, " ")
      /*
       * 2. Çıplak uzun rakam dizisi: kart ve hesap numaraları bu biçimde
       * yazılıyor. Gerçek tutarlar (en fazla 10 hane) ve tarihler
       * ("2026-01-01", 10 karakter) bu eşiğin altında kalıyor.
       */
      .replace(/\b\d[\d\s-]{14,}\d\b/g, " ")
  );
}

/**
 * Serbest metni güvenli hâle getirir.
 *
 * `lib/gathering.ts`teki kardeşiyle aynı gerekçe (bağlantı yapıştırma yüzeyi
 * olmasın) + banka bilgisi düşürme. Kopyalanmadı, çünkü sıra ve kapsam
 * farklı: burada IBAN temizliği açı ayraçlarından ÖNCE çalışmalı, yoksa
 * ayraç boşluğa dönerken IBAN kalıbının ortası bölünür ve kalıp tutmaz.
 */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return stripIban(input)
    .replace(/\b(?:https?|ftp|javascript|data):\S*/gi, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** "YYYY-MM-DD" ise aynen, değilse boş. Defterde tarih ya doğrudur ya yoktur. */
export function cleanDay(input: unknown): string {
  if (typeof input !== "string") return "";
  const s = input.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) ? "" : s;
}

/* ── Para ─────────────────────────────────────────────────────────────── */

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

/**
 * Kullanıcının yazdığı tutarı KURUŞA çevirir; anlamsızsa `null`.
 *
 * Hiçbir aşamada ondalıklı sayı kullanılmıyor: dizge tam ve kesir olarak
 * ikiye ayrılıp iki tamsayı topluyor. `Number(x) * 100` yazmak kolay
 * olurdu ve `1.15` girdisinde 114 kuruş üretirdi — bir defterde bu, her
 * satırda bir kuruş kaybı demek.
 *
 * Ayraç belirsizliği (TR "1.250" = bin iki yüz elli, EN "1.250" = bir nokta
 * iki beş) şöyle çözülüyor: son ayraçtan sonra 1 ya da 2 hane varsa o ayraç
 * ONDALIK, değilse binlik. Üç haneli kuyruk her iki yazımda da binlik
 * gruptur, yani belirsizlik yalnız 1-2 haneli kuyrukta kalıyor ve orada
 * ondalık okumak ezici çoğunlukta doğru.
 */
export function parseMoney(raw: unknown): Kurus | null {
  if (typeof raw === "number") {
    // Sayı geldiyse LİRA değil KURUŞ kabul ediliyor: depo hep kuruş taşıyor
    // ve iki birimi aynı kapıdan geçirmek, birimlerin karışacağı tek yerdir.
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) return null;
    return raw < 0 || raw > MAX_KURUS ? null : raw;
  }
  if (typeof raw !== "string") return null;

  const s = raw.trim();
  if (!s) return null;
  if (s.includes("-")) return null; // eksi tutar bir defterde anlamsız

  // Para simgeleri ve boşluklar atılıyor; geriye yalnız rakam ve ayraç kalmalı.
  const temiz = s.replace(/[\s ₺$€£]/g, "");
  if (!/^[\d.,]+$/.test(temiz)) return null;

  const sonNokta = Math.max(temiz.lastIndexOf("."), temiz.lastIndexOf(","));
  let tamKismi = temiz;
  let kesirKismi = "";
  if (sonNokta > -1) {
    const kuyruk = temiz.slice(sonNokta + 1);
    if (kuyruk.length >= 1 && kuyruk.length <= 2 && /^\d+$/.test(kuyruk)) {
      tamKismi = temiz.slice(0, sonNokta);
      kesirKismi = kuyruk;
    }
  }

  const tam = tamKismi.replace(/[.,]/g, "");
  if (tam !== "" && !/^\d+$/.test(tam)) return null;
  if (tam === "" && kesirKismi === "") return null;

  const lira = tam === "" ? 0 : Number(tam);
  if (!Number.isSafeInteger(lira)) return null;
  const kurus = kesirKismi === "" ? 0 : Number(kesirKismi.padEnd(2, "0"));

  const toplam = lira * 100 + kurus;
  if (!Number.isSafeInteger(toplam) || toplam > MAX_KURUS) return null;
  return toplam;
}

/**
 * Kuruşu ekrana yazılacak biçime çevirir.
 *
 * Bölme YOK: tamsayı bölme ve kalan ile iki parça üretiliyor. `k / 100`
 * yazmak burada da bir kayan nokta değeri doğururdu ve `toFixed(2)` onu
 * bazı değerlerde yanlış yuvarlar.
 */
export function formatMoney(kurus: Kurus, currency: Currency, lang: "tr" | "en" = "tr"): string {
  const negatif = kurus < 0;
  const mutlak = Math.abs(Math.trunc(kurus));
  const lira = Math.floor(mutlak / 100);
  const kalan = mutlak % 100;
  const locale = lang === "en" ? "en-US" : "tr-TR";
  const govde = `${new Intl.NumberFormat(locale).format(lira)}${
    lang === "en" ? "." : ","
  }${String(kalan).padStart(2, "0")}`;
  const simge = { TRY: "₺", EUR: "€", USD: "$", GBP: "£" }[currency];
  return `${negatif ? "-" : ""}${govde} ${simge}`;
}

/* ── Kampanya (aidat / katkı defteri) ─────────────────────────────────── */

export function normalizeCampaign(
  input: Partial<Campaign> & { targetText?: unknown },
  now: string,
  existing?: Campaign
): Campaign | null {
  const title = cleanText(input.title ?? existing?.title, MAX_TITLE);
  if (!title) return null;

  const purpose = cleanText(input.purpose ?? existing?.purpose, MAX_PURPOSE);
  const hedef =
    input.targetText !== undefined
      ? parseMoney(input.targetText)
      : input.targetKurus !== undefined
        ? parseMoney(input.targetKurus)
        : (existing?.targetKurus ?? 0);
  if (hedef === null) return null;

  const currency = isCurrency(input.currency) ? input.currency : (existing?.currency ?? "TRY");

  return {
    id: existing?.id ?? "",
    title,
    ...(purpose ? { purpose } : {}),
    targetKurus: hedef,
    currency,
    closed: typeof input.closed === "boolean" ? input.closed : (existing?.closed ?? false),
    pledges: existing?.pledges ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export type PledgeInput = {
  name?: unknown;
  personId?: unknown;
  pledgedText?: unknown;
  paidText?: unknown;
  paidAt?: unknown;
  note?: unknown;
};

/**
 * Katkı satırını normalleştirir.
 *
 * `paidKurus` ödeme değil BEYAN. Adının `paid` olması bir tahsilat iddiası
 * taşımasın diye tip dosyasında ve arayüzde "beyan" olarak anılıyor;
 * burada da doğrulanan tek şey sayının geçerliliği — paranın geldiği
 * bilgisine bizim erişimimiz yok.
 */
export function normalizePledge(
  input: PledgeInput,
  now: string,
  existing?: Pledge
): Pledge | null {
  const name = cleanText(input.name ?? existing?.name, MAX_NAME);
  if (!name) return null;

  const pledged =
    input.pledgedText !== undefined ? parseMoney(input.pledgedText) : (existing?.pledgedKurus ?? 0);
  if (pledged === null) return null;
  const paid = input.paidText !== undefined ? parseMoney(input.paidText) : (existing?.paidKurus ?? 0);
  if (paid === null) return null;

  const personId = typeof input.personId === "string" && input.personId.trim()
    ? input.personId.trim().slice(0, 64)
    : existing?.personId;
  const note = cleanText(input.note ?? existing?.note, MAX_NOTE);
  const paidAt = input.paidAt !== undefined ? cleanDay(input.paidAt) : (existing?.paidAt ?? "");

  return {
    id: existing?.id ?? "",
    ...(personId ? { personId } : {}),
    name,
    pledgedKurus: pledged,
    paidKurus: paid,
    ...(paidAt ? { paidAt } : {}),
    ...(note ? { note } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export interface CampaignTally {
  /** Toplam taahhüt. */
  pledgedKurus: Kurus;
  /** Ödendiği BEYAN edilen toplam. */
  paidKurus: Kurus;
  /** Hedefe kalan (hedefsizse 0). */
  remainingKurus: Kurus;
  /** Söz verilip henüz beyan edilmeyen — defterin asıl bilgisi. */
  outstandingKurus: Kurus;
  contributors: number;
}

export function campaignTally(c: Pick<Campaign, "targetKurus" | "pledges">): CampaignTally {
  let pledgedKurus = 0;
  let paidKurus = 0;
  for (const p of c.pledges) {
    pledgedKurus += p.pledgedKurus;
    paidKurus += p.paidKurus;
  }
  return {
    pledgedKurus,
    paidKurus,
    remainingKurus: c.targetKurus > 0 ? Math.max(0, c.targetKurus - paidKurus) : 0,
    /*
     * Fazla ödeyen biri yüzünden eksiye düşmesin: "kalan taahhüt" kavramı
     * negatif olamaz ve eksi bir sayı ekranda "iade" gibi okunurdu — oysa
     * bu defterde iade diye bir işlem yok.
     */
    outstandingKurus: Math.max(0, pledgedKurus - paidKurus),
    contributors: c.pledges.length,
  };
}

/* ── Borç-alacak defteri ──────────────────────────────────────────────── */

export type DebtInput = {
  fromName?: unknown;
  fromPersonId?: unknown;
  toName?: unknown;
  toPersonId?: unknown;
  amountText?: unknown;
  currency?: unknown;
  on?: unknown;
  note?: unknown;
  settled?: unknown;
};

export function normalizeDebt(input: DebtInput, now: string, existing?: Debt): Debt | null {
  const fromName = cleanText(input.fromName ?? existing?.fromName, MAX_NAME);
  const toName = cleanText(input.toName ?? existing?.toName, MAX_NAME);
  if (!fromName || !toName) return null;

  const amount =
    input.amountText !== undefined ? parseMoney(input.amountText) : (existing?.amountKurus ?? null);
  if (amount === null || amount <= 0) return null;

  const currency = isCurrency(input.currency) ? input.currency : (existing?.currency ?? "TRY");
  const on = input.on !== undefined ? cleanDay(input.on) : (existing?.on ?? "");
  const note = cleanText(input.note ?? existing?.note, MAX_NOTE);

  const kimlik = (v: unknown, eski?: string) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 64) : eski;
  const borclu = kimlik(input.fromPersonId, existing?.fromPersonId);
  const alacakli = kimlik(input.toPersonId, existing?.toPersonId);

  /*
   * KAPANIŞ DAMGASI bir kez konur ama GERİ ALINABİLİR: borç defteri bir
   * tutanak değil, yaşayan bir kayıt. Yanlışlıkla "kapandı" işaretlenen bir
   * satırı geri açamamak, kullanıcıyı yeni bir satır açmaya iter ve defter
   * iki kez aynı borcu gösterir.
   */
  const kapali = typeof input.settled === "boolean" ? input.settled : !!existing?.settledAt;
  const settledAt = kapali ? (existing?.settledAt ?? now) : undefined;

  return {
    id: existing?.id ?? "",
    fromName,
    ...(borclu ? { fromPersonId: borclu } : {}),
    toName,
    ...(alacakli ? { toPersonId: alacakli } : {}),
    amountKurus: amount,
    currency,
    ...(on ? { on } : {}),
    ...(note ? { note } : {}),
    ...(settledAt ? { settledAt } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * Açık borçların para birimi başına toplamı.
 *
 * Para birimleri TOPLANMIYOR: 100 TL ile 100 EUR'yu tek sayıya indirmek
 * için bir kur gerekir, kur ise zamana bağlı bir dış veri — ve onu
 * uygulamaya sokmak, defteri "ne kadar" sorusunda yanıltıcı kılardı.
 */
export function openDebtTotals(
  debts: readonly Debt[]
): Array<{ currency: Currency; totalKurus: Kurus; count: number }> {
  const harita = new Map<Currency, { totalKurus: Kurus; count: number }>();
  for (const d of debts) {
    if (d.settledAt) continue;
    const mevcut = harita.get(d.currency) ?? { totalKurus: 0, count: 0 };
    mevcut.totalKurus += d.amountKurus;
    mevcut.count++;
    harita.set(d.currency, mevcut);
  }
  return CURRENCIES.filter((c) => harita.has(c)).map((c) => ({ currency: c, ...harita.get(c)! }));
}

/* ── Karar ve oylama tutanağı ─────────────────────────────────────────── */

export function isVote(v: unknown): v is Vote {
  return typeof v === "string" && (VOTES as readonly string[]).includes(v);
}

/**
 * TUTANAK DONMUŞ MU?
 *
 * Tek kaynak: `closedAt` dolu mu. Depo ve rota bu işlevi çağırıyor, kendi
 * denetimlerini yazmıyorlar — kural iki yerde yazılırsa biri güncellenmeden
 * kalır ve donmuş bir tutanak o yoldan değiştirilebilir hâle gelir.
 */
export function isFrozen(d: Pick<Decision, "closedAt">): boolean {
  return !!d.closedAt;
}

export function normalizeDecision(
  input: Partial<Decision>,
  now: string,
  existing?: Decision
): Decision | null {
  // DONMUŞ TUTANAK DEĞİŞTİRİLEMEZ — reddetme burada, en dipte.
  if (existing && isFrozen(existing)) return null;

  const title = cleanText(input.title ?? existing?.title, MAX_TITLE);
  if (!title) return null;
  const detail = cleanText(input.detail ?? existing?.detail, MAX_DETAIL);

  return {
    id: existing?.id ?? "",
    title,
    ...(detail ? { detail } : {}),
    ballots: existing?.ballots ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export interface VoteTally {
  evet: number;
  hayir: number;
  cekimser: number;
  toplam: number;
}

export function decisionTally(ballots: readonly Ballot[]): VoteTally {
  const out: VoteTally = { evet: 0, hayir: 0, cekimser: 0, toplam: 0 };
  for (const b of ballots) {
    out[b.vote]++;
    out.toplam++;
  }
  return out;
}

/**
 * Sonuç: basit çoğunluk, ÇEKİMSER SAYILMAZ.
 *
 * Çekimseri "hayır" saymak yaygın bir hata: çekimser oy, karara katılmama
 * beyanıdır — onu bir yöne saymak, kişinin açıkça vermediği oyu ona
 * yazmak olur. Eşitlikte karar YOK: "esitlik" bir sonuç değil, kararın
 * alınamadığının tutanağa geçmesi.
 */
export function decisionOutcome(t: VoteTally): Outcome {
  if (t.evet > t.hayir) return "kabul";
  if (t.hayir > t.evet) return "ret";
  return "esitlik";
}

export type BallotError = "kapali" | "gecersiz" | "dolu";

/**
 * Oyu kayda çevirir; geçersizse nedeniyle reddeder.
 *
 * Aynı kişi (aynı `voterId`) ikinci kez oy verirse YENİ SATIR AÇILMAZ,
 * satırı güncellenir: bir üye bir oy. Fikir değiştirmek serbest — ama
 * yalnız karar kapanmadan önce.
 */
export function normalizeBallot(
  decision: Pick<Decision, "closedAt" | "ballots">,
  input: { voterId?: unknown; voterName?: unknown; vote?: unknown },
  now: string
): { ballot: Ballot; replacesId?: string } | { error: BallotError } {
  if (isFrozen(decision)) return { error: "kapali" };
  const voterId = typeof input.voterId === "string" ? input.voterId.trim().slice(0, 64) : "";
  if (!voterId) return { error: "gecersiz" };
  if (!isVote(input.vote)) return { error: "gecersiz" };

  const voterName = cleanText(input.voterName, MAX_NAME);
  const onceki = decision.ballots.find((b) => b.voterId === voterId);
  if (!onceki && decision.ballots.length >= MAX_BALLOTS) return { error: "dolu" };

  return {
    ballot: {
      id: onceki?.id ?? "",
      voterId,
      voterName,
      vote: input.vote,
      at: now,
    },
    ...(onceki ? { replacesId: onceki.id } : {}),
  };
}

/**
 * Kararı KAPATIR: sonucu hesaplayıp dondurur.
 *
 * Sonuç kapanış anında HESAPLANIP SAKLANIYOR, her okumada yeniden
 * hesaplanmıyor. Sebebi tutanağın kendisi: sonucu türetilmiş bırakırsak,
 * kural bir gün değiştiğinde (ör. çekimser sayılsın denirse) geçmiş
 * tutanakların sonucu da geriye dönük değişir. Bir meclis kararı, alındığı
 * günün kuralıyla alınmıştır.
 */
export function closeDecision(d: Decision, now: string): Decision | null {
  if (isFrozen(d)) return null;
  return {
    ...d,
    closedAt: now,
    outcome: decisionOutcome(decisionTally(d.ballots)),
    updatedAt: now,
  };
}
