import { readFileSync } from "node:fs";

/**
 * Proje betiklerinin yapısal kilidi.
 *
 * `apps/` kök tsconfig ve eslint'ten HARİÇ tutulmuş (web derlemesini korumak
 * için doğru bir karar). Ama bunun yan etkisi, mobil kodun hiçbir denetimden
 * geçmemesiydi. `typecheck:mobile` o boşluğu kapatıyor; bu test de betiğin
 * sessizce kaybolmamasını sağlıyor.
 */

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}

const root = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
) as { scripts?: Record<string, string> };
const mobile = JSON.parse(
  readFileSync(new URL("../apps/mobile/package.json", import.meta.url), "utf8")
) as { scripts?: Record<string, string> };

const s = root.scripts ?? {};

for (const name of ["lint", "typecheck", "typecheck:mobile", "test", "check", "build"]) {
  check(typeof s[name] === "string" && s[name].length > 0, `kök betiği var: ${name}`);
}

eq(mobile.scripts?.typecheck, "tsc --noEmit", "mobil typecheck betiği yerinde");

// `check` hepsini kapsamalı — biri düşerse bütün denetim sessizce daralır
for (const part of ["lint", "typecheck", "test", "typecheck:mobile"]) {
  check(s.check?.includes(part) ?? false, `check betiği ${part} çalıştırıyor`);
}

// Bağımlılık kurulu değilse SESSİZCE geçmemeli
check(/exit 1/.test(s["typecheck:mobile"] ?? ""),
  "mobil bağımlılık yoksa hata veriyor (sessizce atlamıyor)");
check(/apps\/mobile\/node_modules/.test(s["typecheck:mobile"] ?? ""),
  "mobil bağımlılık varlığını denetliyor");

// `apps` kök denetimlerinin dışında kalmalı — web derlemesi korunsun
const tsconfig = JSON.parse(
  readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8")
) as { exclude?: string[] };
check(tsconfig.exclude?.includes("apps") ?? false,
  "apps kök tsconfig'in dışında (web derlemesi mobilden etkilenmez)");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
