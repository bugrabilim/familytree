#!/usr/bin/env node
/**
 * Vercel Blob anlık yedeği — aile verisinin ANA kaynağını yerel diske indirir.
 *
 * Kullanım:
 *   BLOB_READ_WRITE_TOKEN=... node scripts/backup.mjs [hedef-klasör]
 *
 * Tüm blob'ları (family-data-*.json, users.json, kayıt/erişim JSON'ları)
 * `backups/<zaman-damgası>/` altına indirir. Salt-okunur; hiçbir şeyi silmez.
 * Supabase ayrıca kendi otomatik yedeklerini tutar (bkz. docs/YEDEKLEME.md).
 */
import { list } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("HATA: BLOB_READ_WRITE_TOKEN gerekli.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = process.argv[2] || join("backups", stamp);

async function main() {
  await mkdir(outDir, { recursive: true });
  let cursor;
  let count = 0;
  let bytes = 0;
  do {
    const res = await list({ token, cursor, limit: 1000 });
    for (const b of res.blobs) {
      const r = await fetch(b.downloadUrl ?? b.url);
      if (!r.ok) { console.warn(`atlandı (${r.status}): ${b.pathname}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      // pathname içindeki olası alt yolları koru.
      const dest = join(outDir, b.pathname);
      await mkdir(join(dest, ".."), { recursive: true });
      await writeFile(dest, buf);
      count++; bytes += buf.length;
    }
    cursor = res.cursor;
  } while (cursor);
  console.log(`✓ ${count} dosya, ${(bytes / 1e6).toFixed(2)} MB → ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
