import { deflateRawSync, crc32 } from "node:zlib";

/**
 * GEDZIP — GEDCOM 7'nin resmî paket biçimi: kök dizininde `gedcom.ged`
 * bulunan sıradan bir ZIP arşivi. Uzantı `.gdz`, tür `application/zip`.
 *
 * Neden hazır bir kitaplık yok: depoda zip yazan bir bağımlılık bulunmuyordu
 * (`xlsx` kendi içinde yazıyor ama dışarıya böyle bir API vermiyor) ve tek bir
 * dosyalık arşiv için ZIP'in yazılması gereken kısmı üç kayıttan ibaret —
 * yerel başlık, merkezî dizin, son kayıt. Sıkıştırma `node:zlib`in deflate'i.
 *
 * Bilerek YAPILMAYAN: ZIP64 (4 GB üstü), şifreleme, çok parçalı arşiv,
 * dizin girdileri. Bir soy ağacı GEDCOM'u bunların hiçbirine yaklaşmıyor;
 * yaklaşırsa `zip64Gerekir` doğru döner ve çağıran karar verir.
 */

/** ZIP'in tarih alanı 1980 öncesini gösteremez; öncesi 1980-01-01'e kırpılır. */
function dosTime(d: Date): { time: number; date: number } {
  const y = d.getUTCFullYear();
  if (y < 1980) return { time: 0, date: (1 << 5) | 1 }; // 1980-01-01 00:00
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const date = ((y - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

/** 4 GB sınırı — aşılırsa ZIP64 gerekir ve bu yazıcı yetmez. */
export function zip64Gerekir(byteLength: number): boolean {
  return byteLength >= 0xffffffff;
}

export interface ZipEntry {
  /** Arşiv içindeki yol. GEDZIP için `gedcom.ged` kökte olmalı. */
  name: string;
  data: Buffer;
}

/** Girdileri tek bir ZIP arşivine yazar (deflate). */
export function makeZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = entry.data;
    const deflated = deflateRawSync(raw);
    // Sıkıştırma büyüttüyse (küçük ya da rastgele veri) olduğu gibi sakla.
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? 0 : 8;
    const sum = crc32(raw);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);      // çıkarmak için gereken sürüm
    local.writeUInt16LE(0x0800, 6);  // bayrak: ad UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);      // ek alan yok
    name.copy(local, 30);
    locals.push(local, body);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);    // yazan sürüm
    central.writeUInt16LE(20, 6);    // gereken sürüm
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);    // ek alan
    central.writeUInt16LE(0, 32);    // yorum
    central.writeUInt16LE(0, 34);    // disk numarası
    central.writeUInt16LE(0, 36);    // iç öznitelik
    central.writeUInt32LE(0, 38);    // dış öznitelik
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);                 // bu disk
  end.writeUInt16LE(0, 6);                 // merkezî dizinin başladığı disk
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);                // arşiv yorumu yok

  return Buffer.concat([...locals, centralBuf, end]);
}

/**
 * Bir GEDCOM 7 metnini GEDZIP arşivine sarar.
 *
 * Adın `gedcom.ged` ve KÖKTE olması GEDZIP'in tek katı kuralı: okuyan program
 * arşivi açıp orayı arar. Başka bir ada koymak arşivi geçerli bir zip yapar
 * ama geçersiz bir GEDZIP yapar.
 */
export function makeGedzip(gedcomText: string, now?: Date): Buffer {
  return makeZip([{ name: "gedcom.ged", data: Buffer.from(gedcomText, "utf8") }], now);
}
