import "server-only";

/**
 * Ofis dosyalarını (Excel / Word) düz metne çevirir — yapay zekâ ile içe
 * aktarımda kullanılır. Yalnız sunucu tarafında.
 */

/** .xlsx/.xls → her sayfa CSV olarak birleştirilir. */
export async function xlsxToText(buf: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    if (csv.trim()) parts.push(`--- ${name} ---\n${csv}`);
  }
  return parts.join("\n\n");
}

/** .docx → ham metin. */
export async function docxToText(buf: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value ?? "";
}
