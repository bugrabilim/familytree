import { SOURCE_KINDS } from "../types/family.ts";
import type { Person, Source } from "@/types/family";

/**
 * Kaynak / atıf için hafif değişmezlik testleri.
 * Çalıştırma: node --experimental-strip-types tests/sources.test.mts
 */

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}`);
  }
}

// --- Kaynaklı kişi ---
const withSources: Person = {
  id: "1",
  firstName: "Ayşe",
  lastName: "Yılmaz",
  gender: "female",
  parentIds: [],
  spouseIds: [],
  sources: [
    { id: "s1", title: "1927 Nüfus Sayımı", kind: "nufus" },
    { id: "s2", title: "Mezar taşı", kind: "mezar", note: "Zincirlikuyu" },
    {
      id: "s3",
      title: "Devlet Arşivleri",
      kind: "web",
      url: "https://example.com/kayit",
      note: "Osmanlı belgesi",
    },
  ],
};

check("sources bir dizidir", Array.isArray(withSources.sources));
check("sources üç öğe içerir", withSources.sources?.length === 3);
check(
  "her kaynağın id ve title alanı string",
  (withSources.sources ?? []).every(
    (s) => typeof s.id === "string" && typeof s.title === "string" && s.title.length > 0
  )
);
check(
  "kind alanı isteğe bağlı ama verildiğinde string",
  (withSources.sources ?? []).every((s) => s.kind === undefined || typeof s.kind === "string")
);
check(
  "url yalnızca bir kaynakta var",
  (withSources.sources ?? []).filter((s) => s.url).length === 1
);

// --- Kaynaksız kişi (geri uyumluluk) ---
const legacy: Person = {
  id: "2",
  firstName: "Mehmet",
  lastName: "Demir",
  gender: "male",
  parentIds: [],
  spouseIds: [],
};

check("sources isteğe bağlıdır (undefined olabilir)", legacy.sources === undefined);

// --- Boş satırların elenmesi (form davranışını taklit eder) ---
const rows: Source[] = [
  { id: "a", title: "Dedemin anlatımı", kind: "sozlu" },
  { id: "b", title: "   ", kind: "belge" },
  { id: "c", title: "", kind: "foto" },
];
const cleaned = rows.filter((s) => s.title.trim());
check("başlıksız satırlar elenir", cleaned.length === 1);
check("kalan satırın başlığı doğru", cleaned[0]?.title === "Dedemin anlatımı");

// --- SOURCE_KINDS anahtarları ---
const expectedKeys = ["belge", "nufus", "foto", "mezar", "kitap", "sozlu", "web", "diger"];
check(
  "SOURCE_KINDS beklenen anahtarları içerir",
  expectedKeys.every((k) => k in SOURCE_KINDS)
);
check(
  "SOURCE_KINDS yalnızca beklenen anahtarlara sahip",
  Object.keys(SOURCE_KINDS).length === expectedKeys.length
);
check(
  "her tür label ve icon taşır",
  Object.values(SOURCE_KINDS).every(
    (v) => typeof v.label === "string" && v.label.length > 0 && typeof v.icon === "string" && v.icon.length > 0
  )
);

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed > 0) process.exit(1);
console.log("Tüm kaynak testleri geçti ✓");
process.exit(0);
