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

/*
 * `tsconfig.json` JSONC'dir: TypeScript ve Next yorum kabul eder, `JSON.parse`
 * etmez. Dosyaya bir açıklama yazılınca bu test kırılıyordu — kırılan şey
 * yapılandırma değil, testin okuma biçimiydi. Satır ve blok yorumları
 * ayıklanıyor; dize İÇİNDEKİ "//" (ör. bir URL) korunuyor.
 */
function parseJsonc(text: string): unknown {
  let out = "";
  let dizede = false, kacis = false, satirYorum = false, blokYorum = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (satirYorum) { if (c === "\n") { satirYorum = false; out += c; } continue; }
    if (blokYorum) { if (c === "*" && n === "/") { blokYorum = false; i++; } continue; }
    if (dizede) {
      out += c;
      if (kacis) kacis = false;
      else if (c === "\\") kacis = true;
      else if (c === '"') dizede = false;
      continue;
    }
    if (c === '"') { dizede = true; out += c; continue; }
    if (c === "/" && n === "/") { satirYorum = true; i++; continue; }
    if (c === "/" && n === "*") { blokYorum = true; i++; continue; }
    out += c;
  }
  return JSON.parse(out);
}

// `apps` kök denetimlerinin dışında kalmalı — web derlemesi korunsun
const tsconfig = parseJsonc(
  readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8")
) as { exclude?: string[]; compilerOptions?: Record<string, unknown> };
check(tsconfig.exclude?.includes("apps") ?? false,
  "apps kök tsconfig'in dışında (web derlemesi mobilden etkilenmez)");

/*
 * Testler çıplak `node --experimental-strip-types` ile koşuyor ve Node `@/…`
 * takma adını çözemiyor. Paylaşılan saf mantığın kitaplıklar arasında göreli
 * `./x.ts` ile içe aktarılabilmesi buna bağlı; bayrak kalkarsa o içe
 * aktarımlar derlemeyi kırar.
 */
check(tsconfig.compilerOptions?.allowImportingTsExtensions === true,
  "allowImportingTsExtensions açık (kitaplıklar arası göreli .ts içe aktarımı)");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
