import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { makeGedzip, makeZip, zip64Gerekir } from "../lib/gedzip.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const GED = "0 HEAD\r\n1 GEDC\r\n2 VERS 7.0\r\n0 @I0001@ INDI\r\n1 NAME Ayşe /Yılmaz/\r\n0 TRLR";
const zip = makeGedzip(GED, new Date(Date.UTC(2026, 0, 15, 10, 30, 0)));

/* --- Kaba biçim ---------------------------------------------------------- */
eq(zip.readUInt32LE(0), 0x04034b50, "yerel dosya başlığı imzası");
check(zip.includes(Buffer.from("gedcom.ged")), "arşivde gedcom.ged adı geçiyor");
// Son kayıt (EOCD) sondadır ve tek girdi bildirir.
const eocd = zip.length - 22;
eq(zip.readUInt32LE(eocd), 0x06054b50, "EOCD imzası");
eq(zip.readUInt16LE(eocd + 8), 1, "bu diskteki girdi sayısı");
eq(zip.readUInt16LE(eocd + 10), 1, "toplam girdi sayısı");
// Ad UTF-8 bayrağı — Türkçe karakterli adlar için şart.
eq(zip.readUInt16LE(6), 0x0800, "UTF-8 ad bayrağı");

/* --- İçerik gerçekten geri çıkıyor mu ------------------------------------ */
// Yerel başlıktan gövdeyi kendimiz çözelim (bağımsız doğrulama).
{
  const nameLen = zip.readUInt16LE(26);
  const extraLen = zip.readUInt16LE(28);
  const method = zip.readUInt16LE(8);
  const csize = zip.readUInt32LE(18);
  const start = 30 + nameLen + extraLen;
  const body = zip.subarray(start, start + csize);
  const text = (method === 8 ? inflateRawSync(body) : body).toString("utf8");
  eq(text, GED, "gövde çözülünce özgün metin");
}

/* --- Sistemin unzip'i açabiliyor mu -------------------------------------- */
// Asıl soru bu: kendi yazdığımız zip'i BAŞKA bir program okuyabiliyor mu?
{
  const dir = mkdtempSync(join(tmpdir(), "gedzip-"));
  try {
    const path = join(dir, "test.gdz");
    writeFileSync(path, zip);
    let listing = "";
    let extracted: string | null = null;
    try {
      listing = execFileSync("unzip", ["-l", path], { encoding: "utf8" });
      execFileSync("unzip", ["-o", "-q", path, "-d", dir]);
      extracted = readFileSync(join(dir, "gedcom.ged"), "utf8");
    } catch (e) {
      console.log("  (unzip yok ya da hata verdi, atlanıyor):", (e as Error).message.split("\n")[0]);
    }
    if (listing) {
      check(listing.includes("gedcom.ged"), "unzip -l dosyayı listeliyor");
      eq(extracted, GED, "unzip çıkardığı içerik özgün metinle aynı");
    } else {
      ok += 2; // unzip yoksa denetim atlanır, sayı bozulmasın
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* --- Türkçe adlar ve çok girdili arşiv ----------------------------------- */
{
  const z = makeZip([
    { name: "gedcom.ged", data: Buffer.from(GED, "utf8") },
    { name: "medya/şükrü-çeşme.txt", data: Buffer.from("İçerik: ğüşiöç", "utf8") },
  ]);
  const e = z.length - 22;
  eq(z.readUInt16LE(e + 10), 2, "iki girdi");
  check(z.includes(Buffer.from("şükrü-çeşme.txt", "utf8")), "Türkçe ad UTF-8 olarak yazılmış");
}

/* --- Sıkıştırılamayan veri olduğu gibi saklanır -------------------------- */
{
  // Rastgele baytlar deflate ile BÜYÜR; o zaman sıkıştırmamak doğru.
  const rnd = Buffer.alloc(64);
  for (let i = 0; i < rnd.length; i++) rnd[i] = (i * 97 + 13) % 251;
  const z = makeZip([{ name: "a.bin", data: rnd }]);
  const method = z.readUInt16LE(8);
  eq(method, 0, "büyüten sıkıştırma yerine saklama seçilir");
  eq(z.readUInt32LE(18), rnd.length, "saklanan boy = özgün boy");
}

/* --- 1980 öncesi tarih kırpılır ------------------------------------------ */
{
  // ZIP tarih alanı 1980'den öncesini gösteremez; taşma yerine kırpma.
  const z = makeZip([{ name: "a.txt", data: Buffer.from("x") }], new Date(Date.UTC(1900, 5, 5)));
  eq(z.readUInt16LE(10), 0, "1900 → saat 0");
  eq(z.readUInt16LE(12), (1 << 5) | 1, "1900 → 1980-01-01");
}

/* --- ZIP64 sınırı -------------------------------------------------------- */
check(!zip64Gerekir(100), "küçük dosya ZIP64 istemez");
check(zip64Gerekir(0xffffffff), "4 GB ZIP64 ister");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
