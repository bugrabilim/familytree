import type { Person } from "@/types/family";
import { foldKey } from "./turkish.ts";

/**
 * Soyadı yaygınlığı — SAF, bağımlılıksız.
 *
 * Ağaçtaki soyadlarını sayar ve her soyadın hangi doğum yerlerinde
 * kümelendiğini çıkarır. Harita katmanının (yapım sırası 15) veri tabanı budur:
 * "bu soyad nereden geliyor" sorusunun ağaç içindeki cevabı.
 *
 * ## 1934 öncesi kayıtlar soyadı sayımına GİRMEZ
 *
 * Soyadı Kanunu 1934'te çıktı; ondan önceki kayıtlarda soyad yoktur, yerine
 * patronim vardır ("Bali oğlu Kasım" → `patronymic`). Bu kişileri "soyadı
 * eksik" saymak yanlış olur — eksik değil, o dönemde yoktu. Bu yüzden ayrı
 * sayılır ve `patronymicOnly` olarak bildirilir.
 *
 * ## Türkçe katlama
 *
 * "İNCE", "İnce" ve "ince" tek soyaddır. `lib/duplicates.ts`'teki katlamanın
 * aynısı uygulanır (ı→i, ğ→g, ü→u, ş→s, ö→o, ç→c). Gösterimde ise **en sık
 * geçen özgün yazım** kullanılır: veriyi normalleştirip kullanıcıya
 * tanımadığı bir yazım göstermeyiz.
 *
 * `lib/places.ts` içe aktarılmaz (koordinat çözümü çalışma zamanı bağımlılığı
 * getirir ve bu dosyayı test edilemez yapar). Yerler burada ham metin olarak
 * gruplanır; koordinat, çizen katmanın işidir.
 */

/** `lib/duplicates.ts` ile aynı katlama — iki yerde ayrışmasın diye birebir. */
const fold = foldKey;


export interface PlaceCount {
  place: string;
  count: number;
}

export interface SurnameAggregate {
  /** Gösterilecek yazım — ağaçta en sık geçen özgün biçim. */
  surname: string;
  /** Gruplama anahtarı (katlanmış). */
  key: string;
  count: number;
  personIds: string[];
  /** Bu soyadı taşıyanların doğum yerleri, çoktan aza. */
  places: PlaceCount[];
  /** Soyadın ağaçtaki zaman aralığı (doğum yılına göre). */
  firstBirthYear: number | null;
  lastBirthYear: number | null;
}

export interface SurnameStats {
  surnames: SurnameAggregate[];
  /** Soyadı yok ama patronimi var — 1934 öncesi kayıtlar. Eksik DEĞİL. */
  patronymicOnly: number;
  /** Ne soyadı ne patronimi var — gerçekten eksik. */
  unnamed: number;
  /** Değerlendirilen kişi sayısı. */
  total: number;
}

function yearOf(stored?: string): number | null {
  const m = stored ? /^(\d{4})/.exec(stored) : null;
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

const collator = new Intl.Collator("tr");

/** Sayıya göre azalan, eşitlikte Türkçe alfabetik — kararlı sıralama. */
function byCountThenName<T extends { count: number }>(
  list: T[],
  name: (t: T) => string
): T[] {
  return [...list].sort((a, b) => b.count - a.count || collator.compare(name(a), name(b)));
}

/** Ağaçtaki soyadları, yaygınlığa göre. */
export function aggregateSurnames(people: Person[]): SurnameStats {
  const groups = new Map<
    string,
    {
      key: string;
      /** özgün yazım → kaç kez */
      spellings: Map<string, number>;
      personIds: string[];
      places: Map<string, number>;
      years: number[];
    }
  >();

  let patronymicOnly = 0;
  let unnamed = 0;

  for (const p of people) {
    const raw = p.lastName?.trim();
    if (!raw) {
      if (p.patronymic?.trim()) patronymicOnly++;
      else unnamed++;
      continue;
    }
    const key = fold(raw);
    if (!key) { unnamed++; continue; }

    let g = groups.get(key);
    if (!g) {
      g = { key, spellings: new Map(), personIds: [], places: new Map(), years: [] };
      groups.set(key, g);
    }
    g.spellings.set(raw, (g.spellings.get(raw) ?? 0) + 1);
    g.personIds.push(p.id);

    const place = p.birthPlace?.trim();
    if (place) g.places.set(place, (g.places.get(place) ?? 0) + 1);

    const y = yearOf(p.birthDate);
    if (y !== null) g.years.push(y);
  }

  const surnames: SurnameAggregate[] = [...groups.values()].map((g) => {
    // Gösterim: en sık yazım; eşitlikte Türkçe alfabetik (kararlı olsun).
    const spellings = [...g.spellings.entries()]
      .map(([surname, count]) => ({ surname, count }));
    const display = byCountThenName(spellings, (s) => s.surname)[0].surname;

    const places = byCountThenName(
      [...g.places.entries()].map(([place, count]) => ({ place, count })),
      (x) => x.place
    );

    return {
      surname: display,
      key: g.key,
      count: g.personIds.length,
      personIds: g.personIds,
      places,
      firstBirthYear: g.years.length ? Math.min(...g.years) : null,
      lastBirthYear: g.years.length ? Math.max(...g.years) : null,
    };
  });

  return {
    surnames: byCountThenName(surnames, (s) => s.surname),
    patronymicOnly,
    unnamed,
    total: people.length,
  };
}

export interface PlaceSurnames {
  place: string;
  /** O yerde doğan, soyadı bilinen kişi sayısı. */
  count: number;
  /** O yerdeki soyadlar, çoktan aza. */
  surnames: Array<{ surname: string; count: number }>;
}

/**
 * Yer merkezli görünüm — haritada bir pini tıklayınca "burada hangi
 * soyadlar var" sorusunun cevabı.
 *
 * Yalnız soyadı BİLİNEN kişiler sayılır; 1934 öncesi patronimli kayıtlar
 * bu görünümün dışındadır (soyad haritası çiziyoruz, nüfus haritası değil).
 */
export function surnamesByPlace(people: Person[]): PlaceSurnames[] {
  const byPlace = new Map<string, { place: string; groups: Map<string, { surname: string; count: number }> }>();

  for (const p of people) {
    const place = p.birthPlace?.trim();
    const raw = p.lastName?.trim();
    if (!place || !raw) continue;
    const key = fold(raw);
    if (!key) continue;

    let entry = byPlace.get(place);
    if (!entry) { entry = { place, groups: new Map() }; byPlace.set(place, entry); }
    const g = entry.groups.get(key);
    if (g) g.count++;
    else entry.groups.set(key, { surname: raw, count: 1 });
  }

  const out: PlaceSurnames[] = [...byPlace.values()].map((e) => {
    const surnames = byCountThenName([...e.groups.values()], (s) => s.surname);
    return {
      place: e.place,
      count: surnames.reduce((n, s) => n + s.count, 0),
      surnames,
    };
  });

  return byCountThenName(out, (o) => o.place);
}
