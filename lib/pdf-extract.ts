import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * PDF baytlarından düz metin çıkarır (unpdf — saf JS, sunucusuz uyumlu).
 * Yalnız sunucu tarafında. Sayfalar birleştirilerek tek metin döner.
 */
export async function extractPdfText(buf: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
