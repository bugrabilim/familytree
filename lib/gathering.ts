import type { Gathering, Rsvp, RsvpAnswer } from "../types/gathering.ts";
import { RSVP_ANSWERS } from "../types/gathering.ts";
import { fold } from "./turkish.ts";

/**
 * Aile etkinliği + RSVP — saf mantık.
 *
 * ## Bu dosyanın asıl işi: anonim yazmayı savunmak
 *
 * Bu depodaki tek anonim yazma yüzeyi burası. Bağlantıyı alan HERKES —
 * aileden olmayan biri de — yazabilir. Kimlik doğrulaması yok, dolayısıyla
 * "kim yaptı" diye sorulamaz; savunma yazının KENDİSİNDE olmak zorunda.
 *
 * Katmanlar:
 * - Boyut sınırları: ad, not, kişi sayısı. Sınırsız metin bir depolama
 *   saldırısı ve okuyan için bir çöplük.
 * - Etkinlik başına RSVP tavanı: tek bir betik binlerce satır yazamasın.
 * - Aynı ad için TEK kayıt: art arda gönderim yeni satır değil, GÜNCELLEME.
 *   Bu hem kazayı (iki kez tıklama) hem kaba spam'i düzeltiyor, üstelik
 *   kullanıcı için de doğru davranış: fikrini değiştiren biri "geliyorum"u
 *   "gelemiyorum" yapabilmeli.
 * - Kaba HTML/URL temizliği: yanıtlar ailenin göreceği bir listede
 *   çiziliyor; bağlantı yapıştırma yüzeyi olmamalı.
 *
 * Not: bunların hiçbiri tek başına yeterli değil. Rotada ayrıca paylaşımlı
 * oran sınırı var (K4/33) — ki bu uçta özellikle önemli, çünkü kimliksiz.
 */

export const MAX_NAME = 80;
export const MAX_NOTE = 300;
export const MAX_HEADCOUNT = 50;
export const MAX_RSVPS = 500;
export const MAX_TITLE = 200;
export const MAX_PLACE = 200;
export const MAX_DESC = 2000;
export const MAX_GATHERINGS = 100;

export function isRsvpAnswer(v: unknown): v is RsvpAnswer {
  return typeof v === "string" && (RSVP_ANSWERS as readonly string[]).includes(v);
}

/**
 * Serbest metni güvenli hâle getirir.
 *
 * Açı ayraçları ve bağlantı şemaları düşürülüyor. Bu bir HTML sanitizasyonu
 * DEĞİL (React zaten metni kaçırıyor); amaç, listenin bir bağlantı
 * yapıştırma yüzeyine dönmemesi. "Şuraya tıkla" yazan bir RSVP, aileye
 * gönderilmiş bir oltalama olurdu.
 */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== "string") return "";
  return (
    input
      /*
       * SIRA ÖNEMLİ: önce bağlantı, sonra açı ayracı.
       *
       * Tersini yazmıştım ve `data:text/html,<b>x</b>` girdisinde ayraçlar
       * boşluğa dönüşünce bağlantı kalıbı ilk boşlukta kesiliyordu; şema
       * yine düşüyordu ama gövdesinden kalıntı kalıyordu. Zararsızdı, ama
       * temizliğin kendi kuralına uymuyordu.
       */
      .replace(/\b(?:https?|ftp|javascript|data):\S*/gi, " ")
      .replace(/[<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

/** İki adın "aynı kişi" sayılıp sayılmayacağı — Türkçe katlamalı. */
export function sameName(a: string, b: string): boolean {
  return fold(a).replace(/\s+/g, " ") === fold(b).replace(/\s+/g, " ");
}

export type RsvpError = "kapali" | "gecersiz" | "dolu";

/**
 * Gelen RSVP'yi kayda çevirir; geçersizse nedeniyle reddeder.
 *
 * `rsvpOpen` denetimi BURADA, rotada değil: yazma kapısının kuralı, yazma
 * mantığının yanında dursun ve birim testi edilebilsin.
 */
export function normalizeRsvp(
  gathering: Pick<Gathering, "rsvpOpen" | "rsvps">,
  input: { name?: unknown; answer?: unknown; headcount?: unknown; note?: unknown },
  now: string
): { rsvp: Rsvp; replacesId?: string } | { error: RsvpError } {
  if (!gathering.rsvpOpen) return { error: "kapali" };

  const name = cleanText(input.name, MAX_NAME);
  if (!name) return { error: "gecersiz" };
  if (!isRsvpAnswer(input.answer)) return { error: "gecersiz" };

  /*
   * Kişi sayısı: sayı değilse 1, sınırların dışındaysa kırpılır — reddetmek
   * yerine düzeltmek doğru, çünkü kullanıcı bir formda "2" yazmaya
   * çalışıyor; onu hata ekranıyla karşılamak bilgiyi kaybettirir.
   */
  const ham = Number(input.headcount);
  const headcount = Number.isFinite(ham) ? Math.min(MAX_HEADCOUNT, Math.max(1, Math.floor(ham))) : 1;

  const note = cleanText(input.note, MAX_NOTE);

  // Aynı ad daha önce yazdıysa GÜNCELLEME: hem kazayı hem kaba spam'i
  // düzeltir, hem de fikir değiştirmeye izin verir.
  const onceki = gathering.rsvps.find((r) => sameName(r.name, name));
  if (!onceki && gathering.rsvps.length >= MAX_RSVPS) return { error: "dolu" };

  return {
    rsvp: {
      id: onceki?.id ?? "",
      name,
      answer: input.answer,
      headcount,
      ...(note ? { note } : {}),
      // Güncellemede İLK yazma zamanı korunur: sıra bozulmasın, listedeki
      // yeri değişmesin.
      createdAt: onceki?.createdAt ?? now,
    },
    ...(onceki ? { replacesId: onceki.id } : {}),
  };
}

/** Etkinlik girdisini normalleştirir; başlık ve tarih zorunlu. */
export function normalizeGathering(
  input: Partial<Gathering>,
  now: string,
  existing?: Gathering
): Gathering | null {
  const title = cleanText(input.title ?? existing?.title, MAX_TITLE);
  const when = cleanText(input.when ?? existing?.when, 40);
  if (!title || !when) return null;

  const place = cleanText(input.place ?? existing?.place, MAX_PLACE);
  const description = cleanText(input.description ?? existing?.description, MAX_DESC);

  return {
    id: existing?.id ?? "",
    title,
    when,
    ...(place ? { place } : {}),
    ...(description ? { description } : {}),
    // Varsayılan KAPALI: etkinlik oluşturmak, herkese açık bir yazma ucu
    // açmakla aynı şey olmamalı. Açmak ayrı ve bilinçli bir karar.
    rsvpOpen: typeof input.rsvpOpen === "boolean" ? input.rsvpOpen : existing?.rsvpOpen ?? false,
    token: existing?.token ?? "",
    rsvps: existing?.rsvps ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export interface RsvpTally {
  geliyorum: number;
  gelemiyorum: number;
  belki: number;
  /** "Geliyorum" diyenlerin bildirdiği toplam kişi sayısı. */
  headcount: number;
}

/**
 * Özet.
 *
 * Kişi sayısı YALNIZ "geliyorum" diyenlerden toplanıyor. "Belki" diyenleri
 * de saymak, yemek hazırlayan kişiye yanlış bir sayı vermek olurdu — ve bu
 * sayının tek kullanım amacı o.
 */
export function tally(rsvps: readonly Rsvp[]): RsvpTally {
  const out: RsvpTally = { geliyorum: 0, gelemiyorum: 0, belki: 0, headcount: 0 };
  for (const r of rsvps) {
    out[r.answer]++;
    if (r.answer === "geliyorum") out.headcount += r.headcount;
  }
  return out;
}

/**
 * Dışarıya (anonim davetliye) verilecek etkinlik görünümü.
 *
 * Jeton ÇIKARILIR: yanıtın içinde yazma jetonunu geri göndermek, onu
 * sayfada, önbellekte ve paylaşılan ekran görüntülerinde çoğaltmak olurdu.
 * Katılımcı listesi de çıkarılır: kimin geldiği ailenin bilgisi, davet
 * bağlantısını eline geçiren herkesin değil.
 */
export function publicGathering(g: Gathering): Omit<Gathering, "token" | "rsvps"> & {
  tally: RsvpTally;
} {
  const { token: _t, rsvps, ...rest } = g;
  void _t;
  return { ...rest, tally: tally(rsvps) };
}
