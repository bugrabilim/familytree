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

  // — Türkiye'nin 81 ili (yukarıda olmayanlar). İl merkezi koordinatları;
  //   içe aktarılan gerçek kayıtlarda (ör. e-Devlet nüfus) doğum yeri çoğu
  //   zaman il/ilçe adıdır, bu yüzden tümü haritaya oturur. —
  Adıyaman: { lat: 37.76, lng: 38.28 },
  Afyonkarahisar: { lat: 38.76, lng: 30.54 },
  Ağrı: { lat: 39.72, lng: 43.05 },
  Amasya: { lat: 40.65, lng: 35.83 },
  Artvin: { lat: 41.18, lng: 41.82 },
  Aydın: { lat: 37.85, lng: 27.84 },
  Balıkesir: { lat: 39.65, lng: 27.89 },
  Bilecik: { lat: 40.14, lng: 29.98 },
  Bingöl: { lat: 38.88, lng: 40.5 },
  Bitlis: { lat: 38.4, lng: 42.11 },
  Bolu: { lat: 40.74, lng: 31.61 },
  Burdur: { lat: 37.72, lng: 30.29 },
  Çanakkale: { lat: 40.15, lng: 26.41 },
  Çankırı: { lat: 40.6, lng: 33.62 },
  Çorum: { lat: 40.55, lng: 34.95 },
  Denizli: { lat: 37.78, lng: 29.09 },
  Edirne: { lat: 41.68, lng: 26.56 },
  Elazığ: { lat: 38.68, lng: 39.22 },
  Erzincan: { lat: 39.75, lng: 39.5 },
  Erzurum: { lat: 39.9, lng: 41.27 },
  Gaziantep: { lat: 37.07, lng: 37.38 },
  Antep: { lat: 37.07, lng: 37.38 }, // eski/kısa ad
  Giresun: { lat: 40.91, lng: 38.39 },
  Gümüşhane: { lat: 40.46, lng: 39.48 },
  Hakkâri: { lat: 37.57, lng: 43.74 },
  Hakkari: { lat: 37.57, lng: 43.74 },
  Hatay: { lat: 36.2, lng: 36.16 },
  Antakya: { lat: 36.2, lng: 36.16 }, // Hatay merkez
  Isparta: { lat: 37.76, lng: 30.55 },
  İçel: { lat: 36.81, lng: 34.64 }, // Mersin'in eski adı
  Kars: { lat: 40.6, lng: 43.1 },
  Kastamonu: { lat: 41.39, lng: 33.78 },
  Kırklareli: { lat: 41.74, lng: 27.22 },
  Kırşehir: { lat: 39.15, lng: 34.16 },
  Kocaeli: { lat: 40.77, lng: 29.92 },
  İzmit: { lat: 40.77, lng: 29.92 }, // Kocaeli merkez
  Konya: { lat: 37.87, lng: 32.48 },
  Kütahya: { lat: 39.42, lng: 29.98 },
  Malatya: { lat: 38.36, lng: 38.31 },
  Manisa: { lat: 38.62, lng: 27.43 },
  Kahramanmaraş: { lat: 37.58, lng: 36.93 },
  Maraş: { lat: 37.58, lng: 36.93 }, // eski/kısa ad
  Mardin: { lat: 37.31, lng: 40.74 },
  Muğla: { lat: 37.22, lng: 28.36 },
  Muş: { lat: 38.73, lng: 41.49 },
  Nevşehir: { lat: 38.62, lng: 34.71 },
  Niğde: { lat: 37.97, lng: 34.68 },
  Ordu: { lat: 40.98, lng: 37.88 },
  Rize: { lat: 41.02, lng: 40.52 },
  Sakarya: { lat: 40.77, lng: 30.4 },
  Adapazarı: { lat: 40.77, lng: 30.4 }, // Sakarya merkez
  Samsun: { lat: 41.29, lng: 36.33 },
  Siirt: { lat: 37.93, lng: 41.94 },
  Sinop: { lat: 42.03, lng: 35.15 },
  Tekirdağ: { lat: 40.98, lng: 27.51 },
  Tokat: { lat: 40.31, lng: 36.55 },
  Tunceli: { lat: 39.11, lng: 39.55 },
  Dersim: { lat: 39.11, lng: 39.55 }, // Tunceli'nin eski adı
  Şanlıurfa: { lat: 37.17, lng: 38.79 },
  Urfa: { lat: 37.17, lng: 38.79 }, // eski/kısa ad
  Uşak: { lat: 38.68, lng: 29.41 },
  Van: { lat: 38.49, lng: 43.41 },
  Zonguldak: { lat: 41.45, lng: 31.79 },
  Aksaray: { lat: 38.37, lng: 34.03 },
  Bayburt: { lat: 40.26, lng: 40.23 },
  Kırıkkale: { lat: 39.85, lng: 33.52 },
  Batman: { lat: 37.88, lng: 41.13 },
  Şırnak: { lat: 37.52, lng: 42.46 },
  Bartın: { lat: 41.63, lng: 32.34 },
  Ardahan: { lat: 41.11, lng: 42.7 },
  Iğdır: { lat: 39.92, lng: 44.04 },
  Yalova: { lat: 40.65, lng: 29.28 },
  Karabük: { lat: 41.2, lng: 32.62 },
  Kilis: { lat: 36.72, lng: 37.12 },
  Osmaniye: { lat: 37.07, lng: 36.25 },
  Düzce: { lat: 40.84, lng: 31.16 },

  // — Sık geçen İstanbul ilçeleri (kayıtlarda doğum yeri ilçe olabilir) —
  Şişli: { lat: 41.06, lng: 28.99 },
  Kadıköy: { lat: 40.99, lng: 29.03 },
  Üsküdar: { lat: 41.02, lng: 29.01 },
  Beşiktaş: { lat: 41.04, lng: 29.0 },
  Fatih: { lat: 41.02, lng: 28.95 },
  Beyoğlu: { lat: 41.04, lng: 28.98 },
  Bakırköy: { lat: 40.98, lng: 28.87 },
  Beykoz: { lat: 41.13, lng: 29.1 },
  Sarıyer: { lat: 41.17, lng: 29.05 },
  Maltepe: { lat: 40.94, lng: 29.13 },
  Pendik: { lat: 40.88, lng: 29.25 },
  Kartal: { lat: 40.89, lng: 29.19 },
  Ümraniye: { lat: 41.02, lng: 29.12 },
  Bağcılar: { lat: 41.03, lng: 28.86 },
  Küçükçekmece: { lat: 41.0, lng: 28.78 },
  Büyükçekmece: { lat: 41.02, lng: 28.59 },
  Ataşehir: { lat: 40.98, lng: 29.13 },
  Gaziosmanpaşa: { lat: 41.06, lng: 28.91 },
  Eyüpsultan: { lat: 41.05, lng: 28.93 },
  Eyüp: { lat: 41.05, lng: 28.93 },
  Zeytinburnu: { lat: 40.99, lng: 28.9 },

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
 * Önce tüm metni, sonra ayırıcılarla (virgül, eğik çizgi, tire) bölünen HER
 * parçayı dener. Böylece "Köln, Almanya" → "Köln"; "Maracaibo, Venezuela"
 * şehir bilinmezse → "Venezuela"; ve e-Devlet nüfus biçimi "Ordu / Gürgentepe
 * / Evlek" — köy sözlükte olmasa bile — il adı "Ordu"ya oturur.
 *
 * Özgüllük sırası biçime göre değişir: eğik çizgili "İl / İlçe / Köy"de en
 * özel parça SONDADIR (soldan sağa daralır) → sondan başlayıp ilk çözüleni al;
 * virgüllü "Şehir, Ülke"de en özel parça BAŞTADIR → baştan ilk çözüleni al.
 * Böylece "İstanbul / Şişli" → Şişli, "Köln, Almanya" → Köln olur.
 */
export function resolvePlace(birthPlace: string): LatLng | null {
  if (!birthPlace) return null;
  const raw = birthPlace.trim();
  if (!raw) return null;

  // Tam eşleşme önce (ör. "İskenderun" tek parça).
  const whole = NORMALIZED[normalize(raw)];
  if (whole) return whole;

  // Ayırıcılarla böl: virgül, eğik çizgi, boşlukla çevrili tire/en-tire.
  const parts = raw
    .split(/[,/]|\s[–-]\s/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return null;

  // Eğik çizgi = hiyerarşik (özel sonda) → tersten; değilse baştan.
  const order = raw.includes("/") ? [...parts].reverse() : parts;
  for (const c of order) {
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

/**
 * Google Maps derin bağlantısı (anahtarsız, ücretsiz). Yeni sekmede haritayı
 * verilen sorguyla açar — koordinat (`"41.0,29.0"`) ya da yer adı olabilir.
 */
export function googleMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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
