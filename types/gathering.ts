/**
 * Aile etkinliği ve katılım bildirimi (RSVP).
 *
 * Düğün, mevlit, aile toplantısı, mezar ziyareti… Ailenin bir kısmı
 * uygulamada üye değil; davet bağlantısını WhatsApp'tan alıp "geliyorum"
 * demeleri gerekiyor. Yani bu ANONİM BİR YAZMA YÜZEYİ — bu depodaki ilk
 * ve tek örneği.
 *
 * Ayrı bir koleksiyon (`gatherings-<treeId>.json`), `Person` alanı değil:
 * bir etkinlik kişiye ait değil, aileye ait; ve RSVP'ler ağaçtaki kişilerle
 * eşleşmek zorunda değil (gelin tarafının komşusu da gelebilir).
 */

export type RsvpAnswer = "geliyorum" | "gelemiyorum" | "belki";

export const RSVP_ANSWERS: readonly RsvpAnswer[] = ["geliyorum", "gelemiyorum", "belki"];

export interface Rsvp {
  id: string;
  /** Katılımcının yazdığı ad — ağaçtaki bir kişiye BAĞLANMAZ. */
  name: string;
  answer: RsvpAnswer;
  /** Kendisi dâhil kaç kişi geliyor. */
  headcount: number;
  /** Kısa not (alerji, "geç geleceğiz"…). */
  note?: string;
  createdAt: string;
}

export interface Gathering {
  id: string;
  title: string;
  /** "YYYY-MM-DD" ya da "YYYY-MM-DDTHH:mm" — saat isteğe bağlı. */
  when: string;
  place?: string;
  description?: string;
  /**
   * Katılım bildirimi AÇIK mı.
   *
   * Varsayılan KAPALI ve ayrı bir karar: bir etkinlik oluşturmak, herkese
   * açık bir yazma ucu açmakla aynı şey olmamalı. Kapalıyken bağlantı
   * etkinliği gösterir ama kimse yazamaz.
   */
  rsvpOpen: boolean;
  /** Anonim yazma jetonu — yalnız `rsvpOpen` iken işe yarar. */
  token: string;
  rsvps: Rsvp[];
  createdAt: string;
  updatedAt: string;
}

export interface GatheringBox {
  gatherings: Gathering[];
  updatedAt: string;
}
