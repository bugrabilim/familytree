import type { TFunction } from "@/lib/i18n";

/**
 * Köken/iz (`Person.entrySource`) etiketini okunur biçime çevirir
 * ("ai: nufus.pdf" → "Yapay zekâ ile · nufus.pdf"). Bilinmeyen değer olduğu
 * gibi gösterilir. PersonDrawer ve Tablo görünümü ortak kullanır.
 */
export function entrySourceLabel(src: string, t: TFunction): string {
  const s = src.trim();
  const rest = (sep: string) => {
    const i = s.indexOf(sep);
    return i >= 0 ? s.slice(i + sep.length).trim() : "";
  };
  if (/^ai\b/i.test(s)) {
    const file = rest(":");
    return file ? `${t("entrySource.ai")} · ${file}` : t("entrySource.ai");
  }
  if (s === "manuel") return t("entrySource.manuel");
  if (s === "iskelet") return t("entrySource.iskelet");
  if (s.startsWith("içe aktarma")) {
    const fmt = rest(":");
    return fmt ? `${t("entrySource.import")} · ${fmt}` : t("entrySource.import");
  }
  if (s === "pair" || s === "davet") return t("entrySource.pair");
  return s;
}
