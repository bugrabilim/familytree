import { normalizeDateInput, displayToStored, isValidDateInput } from "../lib/date.ts";

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
console.log(`\n${ok}/${cases.length} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
