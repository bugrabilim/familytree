import { normalizeDateInput, displayToStored, isValidDateInput, signedDaysToAnniversary, relativeDays, formatLong } from "../lib/date.ts";

// [giriş, beklenen normalize, beklenen stored, geçerli mi]
const cases: Array<[string, string, string, boolean]> = [
  ["01022022", "01.02.2022", "2022-02-01", true], // kullanıcı örneği
  ["23.04.1985", "23.04.1985", "1985-04-23", true],
  ["23/04/1985", "23.04.1985", "1985-04-23", true],
  ["23-04-1985", "23.04.1985", "1985-04-23", true],
  ["042022", "04.2022", "2022-04", true], // AAYYYY
  ["1985", "1985", "1985", true],
  ["", "", "", true], // opsiyonel
  ["32.01.2000", "32.01.2000", "", false], // geçersiz gün
  ["01132022", "01.13.2022", "", false], // geçersiz ay
];

let ok = 0,
  fail = 0;
for (const [input, expNorm, expStored, expValid] of cases) {
  const norm = normalizeDateInput(input);
  const valid = isValidDateInput(input);
  const stored = valid && input ? displayToStored(input) : "";
  const pass = norm === expNorm && valid === expValid && (!expValid || stored === expStored);
  if (pass) ok++;
  else {
    fail++;
    console.log(`✗ "${input}" → norm "${norm}"(bekl "${expNorm}") valid ${valid}(bekl ${expValid}) stored "${stored}"(bekl "${expStored}")`);
  }
}
// signedDaysToAnniversary — işaretli gün uzaklığı (geçmiş −, gelecek +)
let ok2 = 0, fail2 = 0;
const check = (name: string, cond: boolean) => { if (cond) ok2++; else { fail2++; console.log(`✗ ${name}`); } };
const iso = (offsetDays: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
check("bugün = 0", signedDaysToAnniversary(iso(0), 10, 30) === 0);
check("3 gün sonra = +3", signedDaysToAnniversary(iso(3), 10, 30) === 3);
check("5 gün önce = -5 (pencere içinde)", signedDaysToAnniversary(iso(-5), 10, 30) === -5);
check("40 gün sonra = null (gelecek pencere dışı)", signedDaysToAnniversary(iso(40), 10, 30) === null);
check("20 gün önce = null (geçmiş pencere dışı)", signedDaysToAnniversary(iso(-20), 10, 30) === null);
check("yalnız yıl = null", signedDaysToAnniversary("1990", 10, 30) === null);
/*
 * Göreli gün artık METİN değil KARAR döndürüyor: `lib/date` dilsiz kaldı,
 * dizeler `i18n-dict`e taşındı (İngilizce arayüzde "3 gün önce" yazıyordu).
 * İddialar da bu yüzden dizeye değil karara bakıyor — dize dönseydi test
 * yalnız Türkçe kurulumda geçerdi ki asıl arıza tam olarak buydu.
 */
check("göreli dün", relativeDays(-1).kind === "yesterday");
check("göreli 3 gün önce", JSON.stringify(relativeDays(-3)) === JSON.stringify({ kind: "past", days: 3 }));
check("göreli bugün", relativeDays(0).kind === "today");
check("göreli yarın", relativeDays(1).kind === "tomorrow");
check("göreli 5 gün sonra", JSON.stringify(relativeDays(5)) === JSON.stringify({ kind: "future", days: 5 }));

/* --- BOZUK AY: ekrana "undefined" YAZILMAZ ----------------------------- */
/*
 * `AYLAR[Number(m) - 1]` aralık dışında `undefined` döner ve şablona
 * doğrudan giriyordu: "23 undefined 1985". Kullanıcıya bir JavaScript
 * değeri göstermek, tarihi hiç göstermemekten kötü.
 */
for (const kotu of ["1985-13-23", "1985-00-23", "1985-99-01", "1985-xx-23"]) {
  const c = formatLong(kotu);
  check(`bozuk ay "undefined" yazmıyor: ${kotu} → ${c}`, !c.includes("undefined"));
  check(`bozuk ayda yıl korunuyor: ${kotu} → ${c}`, c.includes("1985"));
}
check("bozuk ay + gün sayısal biçime düşüyor", formatLong("1985-13-23") === "23.13.1985");
check("bozuk ay, gün yok", formatLong("1985-13") === "13.1985");
// Geçerli aylar değişmedi.
check("normal tam tarih", formatLong("1985-04-23") === "23 Nisan 1985");
check("normal yıl-ay", formatLong("1985-04") === "Nisan 1985");
check("yalnız yıl", formatLong("1985") === "1985");

console.log(`${ok2}/${ok2 + fail2} tarih-yıldönümü geçti${fail2 ? `, ${fail2} başarısız` : " ✓"}`);
console.log(`\n${ok}/${cases.length} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail || fail2) process.exit(1);
