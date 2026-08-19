import type { Person } from "@/types/family";

/**
 * Doğum yerleri haritası için saf, test edilebilir yardımcılar.
 *
 * Coğrafi kodlama (geocoding) servisi ve dış harita döşemeleri YOK (çevrimdışı
 * / CSP). Bu yüzden yerleri, elle derlenmiş küçük bir konum sözlüğünden
 * (gazetteer) çözüyoruz ve SVG'ye equirectangular izdüşümüyle yerleştiriyoruz.
 *
 * Buradaki hiçbir şey React'e ya da tarayıcıya bağlı değildir; `@/...`'ten
 * yalnızca `Person` TÜR'ü içe aktarılır (Node ile doğrudan çalıştırılabilsin).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Konum sözlüğü. Anahtarlar, `birthPlace` alanında geçtiği biçimlere göre
 * seçildi. Yabancı yerler genelde virgülden sonra ülke taşır ("Köln, Almanya",
 * "Mogadişu, Somali"); bu yüzden hem şehir hem de ülke anahtarları bulunur,
 * `resolvePlace` ikisini de dener.
 */
export const GAZETTEER: Record<string, LatLng> = {
  // — Türkiye —
  Kayseri: { lat: 38.73, lng: 35.48 },
  Develi: { lat: 38.39, lng: 35.49 },
  Talas: { lat: 38.68, lng: 35.55 },
  İstanbul: { lat: 41.01, lng: 28.98 },
  Ankara: { lat: 39.93, lng: 32.86 },
  İzmir: { lat: 38.42, lng: 27.14 },
  Adana: { lat: 37.0, lng: 35.32 },
  Trabzon: { lat: 41.0, lng: 39.72 },
  Mersin: { lat: 36.81, lng: 34.64 },
  Eskişehir: { lat: 39.78, lng: 30.52 },
  Sivas: { lat: 39.75, lng: 37.02 },
  İskenderun: { lat: 36.58, lng: 36.17 },
  Bursa: { lat: 40.19, lng: 29.06 },
  Antalya: { lat: 36.9, lng: 30.71 },
  Bodrum: { lat: 37.03, lng: 27.43 },
  Kozan: { lat: 37.45, lng: 35.82 },
  Gölcük: { lat: 40.72, lng: 29.83 },
  Yozgat: { lat: 39.82, lng: 34.8 },
  Diyarbakır: { lat: 37.91, lng: 40.24 },

  // — Tarihî / Osmanlı coğrafyası (bugün başka ülkelerde) —
  Larende: { lat: 37.18, lng: 33.22 }, // bugünkü Karaman
  Karaman: { lat: 37.18, lng: 33.22 },
  Filibe: { lat: 42.14, lng: 24.75 }, // Plovdiv, Bulgaristan
  Selanik: { lat: 40.64, lng: 22.94 }, // Thessaloniki, Yunanistan
  Manastır: { lat: 41.03, lng: 21.34 }, // Bitola, K. Makedonya

  // — Almanya (gurbet) —
  Köln: { lat: 50.94, lng: 6.96 },
  Bremen: { lat: 53.08, lng: 8.8 },
  Berlin: { lat: 52.52, lng: 13.4 },
  Duisburg: { lat: 51.43, lng: 6.76 },

  // — Diğer şehirler (diaspora) —
  Mogadişu: { lat: 2.05, lng: 45.32 }, // Somali
  Baidoa: { lat: 3.12, lng: 43.65 }, // Somali
  Hartum: { lat: 15.5, lng: 32.56 }, // Sudan (Khartoum)
  Kumasi: { lat: 6.69, lng: -1.62 }, // Gana
  Maracaibo: { lat: 10.65, lng: -71.64 }, // Venezuela

  // — Ülkeler (virgülden sonra gelen kısım için yedek çözüm) —
  Almanya: { lat: 51.16, lng: 10.45 },
  Somali: { lat: 5.15, lng: 46.2 },
  Sudan: { lat: 15.5, lng: 32.5 },
  Venezuela: { lat: 6.42, lng: -66.58 },
  Gana: { lat: 7.95, lng: -1.02 },
  Kenya: { lat: -0.02, lng: 37.91 },
  Brezilya: { lat: -14.24, lng: -51.93 },
};

/**
 * Türkçe-güvenli normalizasyon: baştaki/sondaki boşluğu at, "İ→i" ve "I→ı"
 * eşlemesini elle yaptıktan sonra Türkçe küçük harfe çevir. Böylece "İstanbul"
 * ile "istanbul" aynı kabul edilir (ICU yerel ayarı olmasa bile tutarlı).
 */
function normalize(s: string): string {
  return s
    .trim()
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr");
}

/** Sözlüğü bir kez normalize edip anahtar → koordinat eşlemesi kur. */
const NORMALIZED: Record<string, LatLng> = (() => {
  const out: Record<string, LatLng> = {};
  for (const [key, coords] of Object.entries(GAZETTEER)) {
    out[normalize(key)] = coords;
  }
  return out;
})();

/**
 * Bir `birthPlace` metnini koordinata çevirir; sözlükte yoksa `null`.
 *
 * Sırayla dener: (1) tüm metin, (2) virgülden önceki şehir kısmı,
 * (3) virgülden sonraki ülke kısmı. Böylece "Köln, Almanya" önce "Köln"e,
 * "Maracaibo, Venezuela" ise şehir bilinmezse "Venezuela"ya düşer.
 */
export function resolvePlace(birthPlace: string): LatLng | null {
  if (!birthPlace) return null;
  const raw = birthPlace.trim();
  if (!raw) return null;

  const candidates: string[] = [raw];
  if (raw.includes(",")) {
    const parts = raw.split(",");
    candidates.push(parts[0]); // şehir
    candidates.push(parts[parts.length - 1]); // ülke
  }

  for (const c of candidates) {
    const hit = NORMALIZED[normalize(c)];
    if (hit) return hit;
  }
  return null;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Varsayılan görüntü penceresi: TÜM DÜNYA (equirectangular / plate carrée).
 * Enlemde Antarktika'nın büyük kısmı elenerek pencere -60..85'e kırpıldı; bu
 * hem gereksiz boş alanı atar hem de 360×145 derecelik pencereyi bozulmasız
 * göstermek için ~2.48:1 en–boy oranı verir (PlacesMap 1000×403 viewBox).
 *
 * ÖNEMLİ: Bu sınırlar `lib/world-map.ts` içindeki `WORLD_BOUNDS` ile BİREBİR
 * aynı olmalıdır — ülke poligonları o pencereye göre önceden hesaplandığından,
 * noktalar (doğum yerleri) ancak böyle karaların üstüne oturur.
 */
export const DEFAULT_BOUNDS: Bounds = {
  minLat: -60,
  maxLat: 85,
  minLng: -180,
  maxLng: 180,
};

/**
 * Enlem/boylamı SVG koordinatına çevirir (equirectangular / eş dikdörtgen).
 * Boylam → x (doğu sağa), enlem → y (kuzey yukarı; yüksek enlem küçük y).
 * Sınırlar içindeki bir konum [0,width] × [0,height] aralığına düşer.
 */
export function projectEquirectangular(
  lat: number,
  lng: number,
  width: number,
  height: number,
  bounds: Bounds = DEFAULT_BOUNDS
): { x: number; y: number } {
  const { minLat, maxLat, minLng, maxLng } = bounds;
  const x = ((lng - minLng) / (maxLng - minLng)) * width;
  const y = ((maxLat - lat) / (maxLat - minLat)) * height;
  return { x, y };
}

/**
 * SVG koordinatını enlem/boylama geri çevirir (projectEquirectangular tersi).
 * Konum seçicide tıklanan noktayı coğrafi konuma çevirmek için.
 */
export function unprojectEquirectangular(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: Bounds = DEFAULT_BOUNDS
): LatLng {
  const { minLat, maxLat, minLng, maxLng } = bounds;
  const lng = minLng + (x / width) * (maxLng - minLng);
  const lat = maxLat - (y / height) * (maxLat - minLat);
  return { lat, lng };
}

export interface PlaceAggregate {
  place: string;
  count: number;
  coords: LatLng | null;
  personIds: string[];
}

/**
 * Kişileri `birthPlace` metnine göre gruplar (yeri olmayanlar atlanır),
 * her gruba çözülmüş koordinatı iliştirir. Saftır: `Person[]` alır, en çok
 * görünenden aza doğru sıralı döner (eşitlikte yer adına göre).
 */
export function aggregatePlaces(people: Person[]): PlaceAggregate[] {
  const map = new Map<string, PlaceAggregate>();

  for (const p of people) {
    const place = p.birthPlace?.trim();
    if (!place) continue;

    let agg = map.get(place);
    if (!agg) {
      agg = { place, count: 0, coords: resolvePlace(place), personIds: [] };
      map.set(place, agg);
    }
    agg.count++;
    agg.personIds.push(p.id);
  }

  const coll = new Intl.Collator("tr");
  return [...map.values()].sort(
    (a, b) => b.count - a.count || coll.compare(a.place, b.place)
  );
}
