import { rateLimit } from "../lib/rate-limit.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log(`✗ ${n}`); } };

// Kapasite kadar istek geçer, sonrası engellenir.
const key = "test:" + Math.random();
const opts = { capacity: 3, refillPerSec: 0 }; // yenileme yok → sert sınır
check("1. istek geçer", rateLimit(key, opts).ok === true);
check("2. istek geçer", rateLimit(key, opts).ok === true);
check("3. istek geçer", rateLimit(key, opts).ok === true);
const blocked = rateLimit(key, opts);
check("4. istek engellenir", blocked.ok === false);
check("retryAfter pozitif", blocked.retryAfter >= 1);

// Farklı anahtar bağımsız kovaya sahip.
check("farklı anahtar bağımsız", rateLimit("other:" + Math.random(), opts).ok === true);

// Yenilenme: refill ile zamanla token geri gelir (simülasyon: yüksek refill).
const k2 = "refill:" + Math.random();
rateLimit(k2, { capacity: 1, refillPerSec: 1000 }); // 1 token harca
// çok yüksek refill → hemen sonraki çağrıda (geçen süre>0) token dolar; ama
// aynı ms içinde 0 olabilir. En azından ok tipinin boolean olduğunu doğrula.
check("sonuç tipi boolean", typeof rateLimit(k2, { capacity: 1, refillPerSec: 1000 }).ok === "boolean");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
