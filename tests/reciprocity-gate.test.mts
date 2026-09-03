import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: eş/eski eş bağlarının KARŞILIKLILIĞI.
 *
 * Bu bir rota dosyası, birim testi koşulamıyor; kilit kaynak düzeyinde.
 * Kilitlenen şey bir sıralama kuralı: "önceki değer, YAZMADAN ÖNCE okunur."
 *
 * Kuralın bir kez ihlali sessiz bir hataydı — `oldEx`, `data.people[index]`
 * yeni kayıtla değiştirildikten SONRA okunuyordu, dolayısıyla `newEx` ile
 * her zaman aynı çıkıyor ve karşılıklılık kuran iki döngü de boş kümede
 * dönüyordu. Bir tarafta boşanma görünüyor, öbür tarafta görünmüyordu.
 * Hiçbir çalışma zamanı hatası yok, hiçbir günlük satırı yok: yalnız
 * yapılmamış bir iş.
 */
const rota = readFileSync(new URL("../app/api/family/person/[id]/route.ts", import.meta.url), "utf8");

const iYaz = rota.indexOf("data.people[index] = updated;");
check(iYaz > 0, "yazma satırı bulundu");

for (const [ad, desen] of [
  ["eş", /const oldSpouseIds\s*(?::[^=]+)?=\s*data\.people\[index\]\.spouseIds/],
  ["eski eş", /const oldEx\s*(?::[^=]+)?=\s*data\.people\[index\]\.formerSpouseIds/],
] as const) {
  const m = desen.exec(rota);
  check(!!m, `${ad}: önceki değer okunuyor`);
  check(!!m && m.index < iYaz, `${ad}: önceki değer YAZMADAN ÖNCE okunuyor`);
}

/*
 * Karşılıklılık gerçekten kuruluyor mu: dört döngü de yerinde olmalı
 * (eklenen/çıkarılan × eş/eski eş).
 */
const govde = rota.slice(iYaz);
check(/for \(const sid of removed\)/.test(govde), "kaldırılan eş karşı taraftan siliniyor");
check(/for \(const sid of added\)/.test(govde), "eklenen eş karşı tarafa yazılıyor");
check(/oldEx\.filter\(\(x\) => !newEx\.includes\(x\)\)/.test(govde), "kaldırılan eski eş karşı taraftan siliniyor");
check(/newEx\.filter\(\(x\) => !oldEx\.includes\(x\)\)/.test(govde), "eklenen eski eş karşı tarafa yazılıyor");

// `oldEx` yazmadan sonra BİR DAHA atanmamalı — hatanın tam biçimi buydu.
check(!/data\.people\[index\] = updated;[\s\S]*const oldEx\s*(?::[^=]+)?=/.test(rota),
  "`oldEx` yazmadan sonra yeniden atanmıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
