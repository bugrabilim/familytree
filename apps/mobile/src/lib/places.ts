/** Bir yer sorgusu için Google Maps arama bağlantısı (web lib/places.ts ile hizalı). */
export function googleMapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}
