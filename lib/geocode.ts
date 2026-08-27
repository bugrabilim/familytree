import type { LatLng } from "@/lib/places";

/**
 * Canlı coğrafi kodlama (geocoding) — OpenStreetMap Nominatim ile. Yerel konum
 * sözlüğü (gazetteer) yalnız sık geçen şehirleri kapsar; köy/mahalle/ilçe gibi
 * ince yerleri ve Türkiye dışını buradan, dünya genelinde çözeriz. Kayıt neresi
 * yazıyorsa ORAYI işaretleriz (köy görünce şehre düşmeyiz).
 *
 * `buildGeocodeQuery` ve `parseNominatimResult` saf/test edilebilir; `@/lib/
 * places`'ten yalnız `LatLng` TÜR'ü içe aktarılır (Node ile çalıştırılabilsin).
 * `geocodeNominatim` tarayıcıda `fetch` kullanır.
 */

/**
 * Serbest yer metnini Nominatim'e uygun sorguya çevirir. e-Devlet nüfus biçimi
 * "İl / İlçe / Köy" ÖZELDEN GENELE (Köy, İlçe, İl) sıralanır — Nominatim en özel
 * parçayı başta bekler. Virgüllü "Şehir, Ülke" sırası korunur.
 */
export function buildGeocodeQuery(raw: string): string {
  const cleaned = (raw ?? "").trim();
  if (!cleaned) return "";
  const parts = cleaned
    .split(/[,/]|\s[–-]\s/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return cleaned;
  const ordered = cleaned.includes("/") ? [...parts].reverse() : parts;
  return ordered.join(", ");
}

interface NominatimHit {
  lat?: string;
  lon?: string;
}

/** Nominatim yanıtından ilk sonucun koordinatını çıkarır; yoksa `null`. */
export function parseNominatimResult(data: unknown): LatLng | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const hit = data[0] as NominatimHit;
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/**
 * Bir yer adını Nominatim ile coğrafi olarak kodlar (tarayıcı). Bulamazsa /
 * hata olursa `null`. Çağıran, Nominatim kullanım ilkesine uyup istekleri
 * saniyede en fazla bir olacak biçimde aralamalı ve sonuçları önbelleğe almalı.
 */
export async function geocodeNominatim(
  raw: string,
  signal?: AbortSignal
): Promise<LatLng | null> {
  const q = buildGeocodeQuery(raw);
  if (!q) return null;
  const url = `${NOMINATIM}?format=jsonv2&limit=1&accept-language=tr&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return parseNominatimResult(await res.json());
  } catch {
    return null; // ağ hatası / iptal → sessiz geç
  }
}
