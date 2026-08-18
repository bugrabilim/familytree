/**
 * Tarihsel kayıt ipucu (Record Matches'ın ince dilimi) — Wikidata araması.
 *
 * Kendi arşivimiz olmadığından ücretsiz kamu verisi Wikidata'nın
 * `wbsearchentities` ucunu kullanırız: bir ada göre olası tarihsel kişileri
 * (etiket + açıklama + bağlantı) döndürür. Yalnız İPUCU verir; otomatik veri
 * yazmaz — kullanıcı bakıp karar verir. Ağ çağrısı sunucuda yapılır; buradaki
 * URL kurma + ayrıştırma saf ve test edilebilir.
 */

export interface RecordHint {
  id: string;
  label: string;
  description: string;
  url: string;
}

/**
 * Kayıt aramasında kullanılacak ad — arşiv/katalog adı gibi sade tutulur.
 * Yalnız verilen ad + resmî soyad; babadan türetilen patronim ("Osman oğlu")
 * ve lakap ("Topal") dış katalogda geçmediğinden aramayı kirletir, dışlanır.
 * Soyadsız (1934 öncesi) kayıtlarda yalnız verilen ad kalır.
 */
export function recordSearchName(
  p: { firstName?: string; lastName?: string }
): string {
  return [p.firstName?.trim(), p.lastName?.trim()].filter(Boolean).join(" ");
}

/** Wikidata `wbsearchentities` arama URL'i. */
export function buildWikidataSearchUrl(name: string, lang = "tr"): string {
  const q = new URLSearchParams({
    action: "wbsearchentities",
    search: name,
    language: lang,
    uselang: lang,
    type: "item",
    limit: "7",
    format: "json",
    origin: "*",
  });
  return `https://www.wikidata.org/w/api.php?${q.toString()}`;
}

interface WdSearchItem {
  id?: string;
  label?: string;
  description?: string;
  concepturi?: string;
  url?: string;
}

/** Wikidata arama yanıtını `RecordHint[]`'e çevirir (hatalı/boş yanıtta []). */
export function parseWikidataSearch(json: unknown): RecordHint[] {
  const search = (json as { search?: unknown })?.search;
  if (!Array.isArray(search)) return [];
  const out: RecordHint[] = [];
  for (const raw of search) {
    const it = raw as WdSearchItem;
    if (!it || typeof it.id !== "string" || !it.label) continue;
    out.push({
      id: it.id,
      label: it.label,
      description: it.description ?? "",
      url: it.concepturi
        ? it.concepturi.replace("http://", "https://").replace("/entity/", "/wiki/")
        : `https://www.wikidata.org/wiki/${it.id}`,
    });
  }
  return out;
}
