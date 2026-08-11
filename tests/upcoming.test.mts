/**
 * `daysUntilAnniversary` testleri.
 *
 * Çalıştırma: node --experimental-strip-types tests/upcoming.test.mts
 *
 * NOT: `daysUntilAnniversary` "bugün"e bağlıdır; bu yüzden gün sayıları
 * sabitlenmez, bugüne göre hesaplanan göreli farklar üzerinden doğrulanır.
 */

import { daysUntilAnniversary } from "../lib/date.ts";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  check(`${name} (beklenen ${String(expected)}, gelen ${String(actual)})`, actual === expected);
}

/** "YYYY-MM-DD" biçimine çevir (fonksiyonla aynı yerel tarih mantığı). */
function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

// 1) Birkaç gün ileri → küçük pozitif, tam olarak offset kadar.
const plus5 = new Date(start);
plus5.setDate(plus5.getDate() + 5);
eq("5 gün ileri bir tarih → 5", daysUntilAnniversary(fmt(plus5)), 5);

const plus1 = new Date(start);
plus1.setDate(plus1.getDate() + 1);
eq("yarın → 1", daysUntilAnniversary(fmt(plus1)), 1);

// 2) Bugün → 0 (daysUntilBirthday ile aynı 0-bugün davranışı).
eq("bugünün ay/günü → 0", daysUntilAnniversary(fmt(start)), 0);

// 3) Yalnızca yıl ("YYYY") → null (ay/gün yok).
eq("yalnızca yıl → null", daysUntilAnniversary("1990"), null);
eq("tanımsız → null", daysUntilAnniversary(undefined), null);
eq("boş metin → null", daysUntilAnniversary(""), null);

// 4) Yalnızca ay ("YYYY-MM") işlenir → gün 1 varsayılır, null değil.
const mm = String(start.getMonth() + 1).padStart(2, "0");
const monthOnly = daysUntilAnniversary(`2000-${mm}`);
check("ay-yalnız → sayı (null değil)", monthOnly !== null);
check(
  "ay-yalnız → 0..366 aralığında",
  monthOnly !== null && monthOnly >= 0 && monthOnly <= 366
);

// Ay-yalnızın gün=1'e denk geldiğini bağımsız yeniden hesapla.
let occ = new Date(start.getFullYear(), start.getMonth(), 1);
if (occ < start) occ = new Date(start.getFullYear() + 1, start.getMonth(), 1);
const expectedMonthOnly = Math.round((occ.getTime() - start.getTime()) / 86400000);
eq("ay-yalnız → ayın 1'ine kadar gün", monthOnly, expectedMonthOnly);

// 5) Geçmiş ay/gün bir sonraki yıla sarmalanır (negatif olmaz).
const minus3 = new Date(start);
minus3.setDate(minus3.getDate() - 3);
const wrapped = daysUntilAnniversary(fmt(minus3));
check("geçmiş tarih → pozitif (bir sonraki yıla sarma)", wrapped !== null && wrapped > 0);

console.log(`\n${passed} geçti, ${failed} kaldı.`);
process.exit(failed === 0 ? 0 : 1);
