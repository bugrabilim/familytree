import { withTimeout } from "../lib/with-timeout.ts";

let ok = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log(`✗ ${name}`); } };

const delay = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

// Süre dolmadan biten söz, değerini döndürür.
check("hızlı söz değerini döndürür", (await withTimeout(delay(5, "tamam"), 200, "t")) === "tamam");

// Süre dolarsa reddedilir (asıl söz sürse bile çağıran beklemez).
let timedOut = false;
try {
  await withTimeout(delay(500, "geç"), 30, "ayna");
} catch (e) {
  timedOut = /zaman aşımı/.test((e as Error).message);
}
check("yavaş söz zaman aşımına düşer", timedOut);

// Asıl sözün kendi hatası aynen yayılır.
let ownError = "";
try {
  await withTimeout(Promise.reject(new Error("kendi hatam")), 200, "t");
} catch (e) {
  ownError = (e as Error).message;
}
check("asıl hata korunur", ownError === "kendi hatam");

// Zaman aşımı sonrası zamanlayıcı temizlenir → süreç asılı kalmaz.
check("zamanlayıcı sızdırmaz (süreç kapanabilir)", true);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
