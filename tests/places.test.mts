/**
 * `lib/places` testleri — resolvePlace / projectEquirectangular / aggregatePlaces.
 *
 * Çalıştırma: node --experimental-strip-types tests/places.test.mts
 * (Göreli içe aktarımlarda `.ts` uzantısı; `@/...`'ten yalnızca TÜR.)
 */

import {
  aggregatePlaces,
  DEFAULT_BOUNDS,
  projectEquirectangular,
  resolvePlace,
} from "../lib/places.ts";
import type { Person } from "../types/family.ts";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

/** Test kişisi kısaltması. */
function person(id: string, birthPlace?: string): Person {
  return { id, firstName: id, lastName: "Test", gender: "unknown", parentIds: [], spouseIds: [], birthPlace };
}

/* -------------------- resolvePlace -------------------- */

const kayseri = resolvePlace("Kayseri");
check("resolvePlace: bilinen şehir → koordinat", kayseri !== null);
check("resolvePlace: Kayseri lat doğru", kayseri?.lat === 38.73);

// Türkçe-güvenli: baştaki büyük İ ile
check("resolvePlace: İstanbul çözülür", resolvePlace("İstanbul") !== null);
check("resolvePlace: boşluklu 'İstanbul ' çözülür", resolvePlace("  İstanbul  ") !== null);

// Virgülden sonra ülke — şehir bilinir
const koln = resolvePlace("Köln, Almanya");
check("resolvePlace: 'Köln, Almanya' çözülür", koln !== null);
check("resolvePlace: 'Köln, Almanya' → Köln koordinatı", koln?.lat === 50.94);

// Virgülden sonra ülke — şehir bilinmez, ülkeye düşer
const somali = resolvePlace("Baidoa, Somali");
check("resolvePlace: 'Baidoa, Somali' çözülür", somali !== null);

// Bilinmeyen yer → null
check("resolvePlace: bilinmeyen → null", resolvePlace("Atlantis") === null);
check("resolvePlace: boş metin → null", resolvePlace("") === null);
check("resolvePlace: yalnızca boşluk → null", resolvePlace("   ") === null);

/* -------------------- projectEquirectangular -------------------- */

const W = 800;
const H = 500;
const pt = projectEquirectangular(41.01, 28.98, W, H); // İstanbul, varsayılan sınırlar
check("project: x aralıkta [0,W]", pt.x >= 0 && pt.x <= W);
check("project: y aralıkta [0,H]", pt.y >= 0 && pt.y <= H);

// Yüksek enlem → küçük y (kuzey yukarıda)
const kuzey = projectEquirectangular(55, 10, W, H);
const guney = projectEquirectangular(10, 10, W, H);
check("project: yüksek enlem daha küçük y verir", kuzey.y < guney.y);

// Doğu → büyük x
const dogu = projectEquirectangular(30, 40, W, H);
const bati = projectEquirectangular(30, -10, W, H);
check("project: doğu boylam daha büyük x verir", dogu.x > bati.x);

// Sınırın köşeleri tam kenarlara oturur
const sw = projectEquirectangular(DEFAULT_BOUNDS.minLat, DEFAULT_BOUNDS.minLng, W, H);
check("project: güneybatı köşe → (0, H)", Math.abs(sw.x - 0) < 1e-6 && Math.abs(sw.y - H) < 1e-6);
const ne = projectEquirectangular(DEFAULT_BOUNDS.maxLat, DEFAULT_BOUNDS.maxLng, W, H);
check("project: kuzeydoğu köşe → (W, 0)", Math.abs(ne.x - W) < 1e-6 && Math.abs(ne.y - 0) < 1e-6);

/* -------------------- aggregatePlaces -------------------- */

const people: Person[] = [
  person("a", "Develi"),
  person("b", "Develi"),
  person("c", "Kayseri"),
  person("d", "Köln, Almanya"),
  person("e"), // doğum yeri yok — atlanmalı
  person("f", "   "), // yalnızca boşluk — atlanmalı
  person("g", "Atlantis"), // bilinmeyen — gruplanır ama coords null
];

const agg = aggregatePlaces(people);
const byPlace = new Map(agg.map((a) => [a.place, a]));

check("aggregate: doğum yeri olmayan atlanır", !byPlace.has(undefined as unknown as string) && agg.every((a) => a.place.trim().length > 0));
check("aggregate: yer sayısı 4 (Develi, Kayseri, Köln.., Atlantis)", agg.length === 4);
check("aggregate: Develi sayısı 2", byPlace.get("Develi")?.count === 2);
check("aggregate: Develi personIds doğru", (byPlace.get("Develi")?.personIds.join(",")) === "a,b");
check("aggregate: Kayseri koordinat iliştirilmiş", byPlace.get("Kayseri")?.coords !== null);
check("aggregate: Atlantis koordinatı null", byPlace.get("Atlantis")?.coords === null);
check("aggregate: en çok görülen en başta (Develi)", agg[0]?.place === "Develi");

/* -------------------- sonuç -------------------- */

console.log(`\n${passed}/${passed + failed} geçti${failed ? `, ${failed} başarısız` : " ✓"}`);
if (failed > 0) process.exit(1);
