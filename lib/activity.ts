import type { Person } from "@/types/family";

/**
 * Katkı akışı — iki anlık görüntü arasındaki farkı okunur bir listeye çevirir.
 *
 * Amaç bir "değişiklik günlüğü" değil. Ağacı canlı tutan şey rozet ya da puan
 * değil, BAŞKASININ KATTIĞINI GÖRMEK: "dedenin askerlik fotoğrafı eklendi"
 * cümlesi insanı kendi fotoğrafını aramaya gönderir. Bu yüzden akış her alan
 * değişikliğini saymaz; ailenin gerçekten önemseyeceği katkıları öbekler.
 *
 * Saf ve bağımlılıksız (`@/` yalnız tür düzeyinde) — birim testi koşulabilsin.
 */

export type ActivityKind =
  | "kisiEklendi"
  | "kisiSilindi"
  | "fotograf"
  | "ani"
  | "hikaye"
  | "kaynak"
  | "olay"
  | "tarih"
  | "yer"
  | "bag"
  | "duzenleme";

export interface ActivityItem {
  /** Kararlı kimlik — liste yeniden çizilince sıçramasın. */
  id: string;
  at: string;
  /** Katkıyı yapan hesap kimliği; bilinmiyorsa boş. */
  by?: string;
  kind: ActivityKind;
  personId: string;
  /** Kişinin o anki adı — kişi sonradan silinse de katkı okunabilir kalsın. */
  personName: string;
  /** Kaç tane (üç fotoğraf gibi). 1 ise gösterilmez. */
  count?: number;
}

/** Sayılabilir katkılar: dizinin BÜYÜMESİ katkıdır, küçülmesi değil. */
const LISTS = [
  ["photos", "fotograf"],
  ["memories", "ani"],
  ["sources", "kaynak"],
  ["events", "olay"],
] as const;

/** Tek tek izlenen metin alanları ve hangi katkıya sayıldıkları. */
const TEXTS = [
  ["bio", "hikaye"],
  ["birthDate", "tarih"],
  ["deathDate", "tarih"],
  ["birthPlace", "yer"],
  ["burialPlace", "yer"],
] as const;

/** İlişki alanları — biri bile değiştiyse "bağ kuruldu" sayılır. */
const LINKS = ["parentIds", "spouseIds", "formerSpouseIds"] as const;

function adOf(p: Person): string {
  const ad = [p.firstName, p.lastName].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  return ad || (p.patronymic?.trim() ?? "");
}

function uzunluk(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function dolu(v: unknown): boolean {
  return typeof v === "string" ? v.trim().length > 0 : v !== undefined && v !== null;
}

/**
 * İki liste arasındaki katkıları çıkarır.
 *
 * `at` ve `by` çağırandan gelir: fark hesabı zamanı ve yazarı bilemez, onlar
 * anlık görüntünün üstünde durur.
 */
export function diffActivity(
  before: readonly Person[],
  after: readonly Person[],
  meta: { at: string; by?: string }
): ActivityItem[] {
  const oncekiler = new Map(before.map((p) => [p.id, p]));
  const sonrakiler = new Map(after.map((p) => [p.id, p]));
  const out: ActivityItem[] = [];

  const ekle = (
    kind: ActivityKind,
    p: Person,
    count?: number
  ) =>
    out.push({
      id: `${meta.at}:${p.id}:${kind}`,
      at: meta.at,
      by: meta.by,
      kind,
      personId: p.id,
      personName: adOf(p),
      ...(count && count > 1 ? { count } : {}),
    });

  // Yeni kişiler
  for (const p of after) {
    if (!oncekiler.has(p.id)) ekle("kisiEklendi", p);
  }
  // Silinenler — adı ÖNCEKİ listeden okunur, sonrakinde yok.
  for (const p of before) {
    if (!sonrakiler.has(p.id)) ekle("kisiSilindi", p);
  }

  // Var olan kişilerdeki katkılar
  for (const sonra of after) {
    const once = oncekiler.get(sonra.id);
    if (!once) continue; // yeni kişi zaten yukarıda sayıldı

    let birseyBulundu = false;

    // Fotoğraf: kapak fotoğrafı da bir fotoğraftır, `photos` artışına eklenir.
    // (Ayrı bir dal olarak da yazmıştım; kapak eklenip galeri büyümediğinde
    // aynı katkıyı iki kez üretiyordu — tek yerde toplamak hem doğru hem sade.)
    const kapakEklendi = !dolu(once.photo) && dolu(sonra.photo) ? 1 : 0;
    for (const [alan, kind] of LISTS) {
      const artis =
        uzunluk((sonra as unknown as Record<string, unknown>)[alan]) -
        uzunluk((once as unknown as Record<string, unknown>)[alan]);
      const toplam = alan === "photos" ? artis + kapakEklendi : artis;
      if (toplam > 0) {
        ekle(kind, sonra, toplam);
        birseyBulundu = true;
      }
    }
    // Metin alanları: BOŞTAN DOLUYA geçiş katkıdır. Var olan bir metnin
    // düzeltilmesi ayrı bir şey ("düzenleme") ve akışın başını doldurmaz.
    for (const [alan, kind] of TEXTS) {
      const o = (once as unknown as Record<string, unknown>)[alan];
      const s = (sonra as unknown as Record<string, unknown>)[alan];
      if (!dolu(o) && dolu(s)) {
        ekle(kind, sonra);
        birseyBulundu = true;
      }
    }

    // Bağlar
    const bagDegisti = LINKS.some(
      (alan) =>
        JSON.stringify((once as unknown as Record<string, unknown>)[alan] ?? []) !==
        JSON.stringify((sonra as unknown as Record<string, unknown>)[alan] ?? [])
    );
    if (bagDegisti) {
      ekle("bag", sonra);
      birseyBulundu = true;
    }

    // Başka bir şey değiştiyse tek satırlık genel bir kayıt. Hangi alanın
    // değiştiğini söylemiyoruz: akış bir denetim günlüğü değil.
    if (!birseyBulundu && JSON.stringify(once) !== JSON.stringify(sonra)) {
      ekle("duzenleme", sonra);
    }
  }

  return out;
}

/**
 * Ardışık anlık görüntülerden akışı kurar.
 *
 * `snapshots` EN YENİ ÖNCE sıralıdır ve her biri bir kaydetmeden ÖNCEKİ
 * durumu tutar; `current` ise canlı veri. Dolayısıyla en yeni katkı
 * `snapshots[0] → current` farkıdır ve yazarı `snapshots[0].by`dir.
 */
export function buildActivity(
  snapshots: readonly { at: string; by?: string; people: Person[] }[],
  current: readonly Person[],
  limit = 50
): ActivityItem[] {
  const out: ActivityItem[] = [];
  let sonraki: readonly Person[] = current;
  for (const snap of snapshots) {
    out.push(...diffActivity(snap.people, sonraki, { at: snap.at, by: snap.by }));
    if (out.length >= limit) break;
    sonraki = snap.people;
  }
  return out.slice(0, limit);
}

/** i18n anahtarı — `useT()` ile çözülür. */
export function activityKey(kind: ActivityKind): string {
  return `activity.${kind}`;
}
