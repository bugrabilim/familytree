import { normalizeDateInput, displayToStored, isValidDateInput, signedDaysToAnniversary, humanizeDays } from "../lib/date.ts";

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
check("humanize dün", humanizeDays(-1) === "Dün");
check("humanize 3 gün önce", humanizeDays(-3) === "3 gün önce");
check("humanize bugün", humanizeDays(0) === "Bugün");
console.log(`${ok2}/${ok2 + fail2} tarih-yıldönümü geçti${fail2 ? `, ${fail2} başarısız` : " ✓"}`);

console.log(`\n${ok}/${cases.length} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail || fail2) process.exit(1);
