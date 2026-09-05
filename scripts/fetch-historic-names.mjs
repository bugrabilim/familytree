#!/usr/bin/env node
/**
 * TARİHÎ YER ADI ADAYLARI — Wikidata'dan (CC0) öneri üretir (madde 37/38).
 *
 * ## Bu betik SÖZLÜĞÜ DEĞİŞTİRMEZ
 *
 * Yalnız ADAY listesi basar; `lib/historic-places.ts`e tek satır yazmaz.
 * Sebebi o dosyanın kendi kuralı: "az ama doğru". Yanlış bir eşleme
 * sessizdir ve ailenin köyünü haritada BAŞKA bir yere koyar — üstelik kimse
 * fark etmez. Wikidata takma adları (`skos:altLabel`) tarihî adların yanı
 * sıra yazım varyantı, çeviri ve gürültü de taşıyor; otomatik birleştirmek,
 * o gürültüyü doğrudan kayda sokmak olurdu.
 *
 * Çıktı gözden geçirilip ELLE eklenir. Yavaş görünüyor ama bu maddede
 * yavaşlık bilinçli.
 *
 * ## Neden yalnız sözlükte KARŞILIĞI OLAN yerler
 *
 * Bir eşlemenin modern karşılığı `GAZETTEER`de yoksa koordinat üretmez;
 * yani eşleme yazılsa bile ölü kalır. Aday listesi bu yüzden süzülüyor —
 * çalışmayacak yüz satırı gözden geçirmek zaman kaybı olurdu.
 *
 * ## Kullanım
 *
 *   node scripts/fetch-historic-names.mjs            # adayları bas
 *   node scripts/fetch-historic-names.mjs --limit 50 # daha az satır
 *
 * NOT: Bu betik yazıldığı ortamda ÇALIŞTIRILAMADI — ağ çıkışı
 * `query.wikidata.org`a kapalıydı. İlk koşuşta çıktı satır satır
 * doğrulanmalı; "çalışıyor" varsayılmamalı.
 */

import { readFileSync } from "node:fs";

const UC = "https://query.wikidata.org/sparql";

/*
 * Türkiye'deki yerleşimlerin takma adları. `skos:altLabel` seçilmesinin
 * sebebi, tarihî adların Wikidata'da çoğunlukla ayrı bir özellik olarak
 * değil, takma ad olarak durması. Diller: Türkçe, İngilizce, Yunanca,
 * Ermenice, Kürtçe ve Osmanlıca — bu ağacın kapsadığı coğrafyanın dilleri.
 */
const SORGU = `
SELECT ?modern ?eski WHERE {
  ?yer wdt:P17 wd:Q43 ;
       wdt:P31/wdt:P279* wd:Q486972 ;
       rdfs:label ?modern ;
       skos:altLabel ?eski .
  FILTER(lang(?modern) = "tr")
  FILTER(lang(?eski) IN ("tr", "en", "el", "hy", "ku", "ota"))
}
`;

/** `lib/places.ts`teki sözlüğün anahtarları — kaynak dosyadan okunuyor. */
function gazetteerAnahtarlari() {
  const src = readFileSync(new URL("../lib/places.ts", import.meta.url), "utf8");
  const i = src.indexOf("GAZETTEER: Record<string, LatLng> = {");
  const blok = src.slice(i, src.indexOf("\n};", i));
  return new Set(
    [...blok.matchAll(/^\s*(?:"([^"]+)"|([A-Za-zÇĞİÖŞÜçğıöşü0-9]+))\s*:\s*\{/gm)].map(
      (m) => m[1] ?? m[2]
    )
  );
}

/** Sözlükte ZATEN olan eşlemeler — tekrar önermeyelim. */
function mevcutEslemeler() {
  const src = readFileSync(new URL("../lib/historic-places.ts", import.meta.url), "utf8");
  const i = src.indexOf("HISTORIC_TO_MODERN: Readonly<Record<string, string>> = {");
  const blok = src.slice(i, src.indexOf("\n};", i));
  return new Set(
    [...blok.matchAll(/^\s*(?:"([^"]+)"|([\wÇĞİÖŞÜçğıöşü-]+))\s*:\s*"/gm)].map((m) => m[1] ?? m[2])
  );
}

const normalize = (s) =>
  s.trim().replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr");

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) || 200 : 200;

  const gaz = gazetteerAnahtarlari();
  const mevcut = mevcutEslemeler();
  const mevcutNorm = new Set([...mevcut].map(normalize));
  const gazNorm = new Map([...gaz].map((a) => [normalize(a), a]));

  const url = `${UC}?format=json&query=${encodeURIComponent(SORGU)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      // Wikidata kimliksiz istekleri kısıtlıyor; kim olduğumuzu söylüyoruz.
      "User-Agent": "soyagaci-historic-names/1.0 (https://soylus.com)",
    },
  });
  if (!res.ok) {
    console.error(`Wikidata yanıtı: ${res.status}. Sorgu çalıştırılamadı.`);
    process.exit(1);
  }
  const data = await res.json();
  const satirlar = data?.results?.bindings ?? [];
  console.log(`Wikidata'dan ${satirlar.length} satır geldi.\n`);

  /** eski (normalleştirilmiş) → { eski, modern } */
  const adaylar = new Map();
  let sozluksuz = 0;
  let zaten = 0;

  for (const s of satirlar) {
    const modernHam = s.modern?.value?.trim();
    const eski = s.eski?.value?.trim();
    if (!modernHam || !eski) continue;

    // Modern karşılık sözlükte yoksa eşleme ölü kalır — atla.
    const modern = gazNorm.get(normalize(modernHam));
    if (!modern) { sozluksuz++; continue; }

    // Kendisine eşlenen ya da zaten var olan aday anlamsız.
    if (normalize(eski) === normalize(modern)) continue;
    if (mevcutNorm.has(normalize(eski))) { zaten++; continue; }
    // Kaynağı sözlükte olan ad zaten kendi başına çözülüyor.
    if (gazNorm.has(normalize(eski))) continue;

    const anahtar = normalize(eski);
    const onceki = adaylar.get(anahtar);
    /*
     * AYNI eski ad birden çok modern yeri gösteriyorsa İŞARETLENİYOR ve
     * önerilmiyor: tek karşılığı olmayan ad eşlenemez ("Karahisar" tuzağı).
     */
    if (onceki && normalize(onceki.modern) !== normalize(modern)) {
      onceki.belirsiz = true;
      continue;
    }
    if (!onceki) adaylar.set(anahtar, { eski, modern, belirsiz: false });
  }

  const temiz = [...adaylar.values()].filter((a) => !a.belirsiz);
  const belirsiz = [...adaylar.values()].filter((a) => a.belirsiz);

  console.log(`Sözlükte karşılığı olmadığı için atlanan: ${sozluksuz}`);
  console.log(`Zaten eklenmiş olan: ${zaten}`);
  console.log(`BELİRSİZ (birden çok yeri gösteriyor, ÖNERİLMİYOR): ${belirsiz.length}`);
  for (const b of belirsiz.slice(0, 20)) console.log(`  ⚠️  ${b.eski}`);
  console.log(`\nADAY: ${temiz.length} — aşağıdakiler GÖZDEN GEÇİRİLDİKTEN sonra`);
  console.log(`lib/historic-places.ts içine elle eklenir. Otomatik eklenmez.\n`);

  for (const a of temiz.slice(0, limit)) {
    const anahtar = /^[A-Za-zÇĞİÖŞÜçğıöşü]+$/.test(a.eski) ? a.eski : `"${a.eski}"`;
    console.log(`  ${anahtar}: "${a.modern}",`);
  }
  if (temiz.length > limit) console.log(`\n… ve ${temiz.length - limit} tane daha (--limit ile artır).`);
}

main().catch((e) => {
  console.error("Hata:", e.message);
  process.exit(1);
});
