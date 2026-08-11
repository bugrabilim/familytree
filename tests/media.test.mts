import type { Person } from "@/types/family";

/**
 * Çoklu medya galerisi için hafif değişmezlik testleri.
 * Çalıştırma: node --experimental-strip-types tests/media.test.mts
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

/** Kapak mantığı: `photo` verilmişse o, yoksa ilk galeri fotoğrafı. */
function coverOf(p: Person): string | undefined {
  return p.photo ?? p.photos?.[0];
}

// --- Galerili kişi ---
const withGallery: Person = {
  id: "1",
  firstName: "Ayşe",
  lastName: "Yılmaz",
  gender: "female",
  parentIds: [],
  spouseIds: [],
  photo: "https://cdn.example/cover.jpg",
  photos: [
    "https://cdn.example/a.jpg",
    "https://cdn.example/b.jpg",
    "https://cdn.example/c.jpg",
  ],
};

check("photos bir dizidir", Array.isArray(withGallery.photos));
check("photos üç öğe içerir", withGallery.photos?.length === 3);
check("her öğe string", (withGallery.photos ?? []).every((u) => typeof u === "string"));
check("kapak açık photo alanıdır", coverOf(withGallery) === "https://cdn.example/cover.jpg");

// --- photo yoksa kapak ilk galeri fotoğrafına düşer ---
const noCover: Person = {
  id: "2",
  firstName: "Mehmet",
  lastName: "Demir",
  gender: "male",
  parentIds: [],
  spouseIds: [],
  photos: ["https://cdn.example/x.jpg", "https://cdn.example/y.jpg"],
};

check("photo yokken kapak ilk galeri öğesidir", coverOf(noCover) === "https://cdn.example/x.jpg");

// --- Galerisiz kişi (geri uyumluluk) ---
const legacy: Person = {
  id: "3",
  firstName: "Fatma",
  lastName: "Kaya",
  gender: "female",
  parentIds: [],
  spouseIds: [],
  photo: "https://cdn.example/legacy.jpg",
};

check("photos isteğe bağlıdır (undefined olabilir)", legacy.photos === undefined);
check("galerisiz kişide kapak yine photo alanıdır", coverOf(legacy) === "https://cdn.example/legacy.jpg");

// --- Ne photo ne photos ---
const empty: Person = {
  id: "4",
  firstName: "Ali",
  lastName: "Öz",
  gender: "male",
  parentIds: [],
  spouseIds: [],
};

check("hiç fotoğraf yoksa kapak undefined", coverOf(empty) === undefined);

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed > 0) process.exit(1);
console.log("Tüm medya testleri geçti ✓");
process.exit(0);
