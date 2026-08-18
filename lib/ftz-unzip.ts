import "server-only";
import { inflateRawSync } from "node:zlib";

/**
 * ".ftz" (Quick Family Tree) paketinden `node.ftt` metnini çıkarır.
 *
 * .ftz küçük bir ZIP'tir. Bağımlılık eklemeden, ZIP merkezi dizinini (central
 * directory) okuyup ilgili girdiyi node:zlib ile açıyoruz. Yalnız sunucu
 * tarafında çalışır (Node runtime). Bulunamazsa/çözülemezse hata fırlatır.
 */
const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export function extractNodeFtt(buf: Buffer): string {
  // Sondan EOCD (End Of Central Directory) kaydını bul
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Geçersiz .ftz (ZIP dizini bulunamadı).");

  const entryCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // merkezi dizin başlangıcı

  for (let n = 0; n < entryCount; n++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    if (name.endsWith("node.ftt")) {
      if (buf.readUInt32LE(localOff) !== LOC_SIG)
        throw new Error("Geçersiz .ftz (yerel başlık bozuk).");
      const locNameLen = buf.readUInt16LE(localOff + 26);
      const locExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + locNameLen + locExtraLen;
      const raw = buf.subarray(start, start + compSize);
      const out = method === 0 ? raw : inflateRawSync(raw);
      return out.toString("utf8");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(".ftz içinde node.ftt bulunamadı.");
}
