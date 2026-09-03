import { readFileSync } from "node:fs";
import { shouldKeepCover } from "../lib/tree-meta.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/* --- Kural: "söylemedim" ile "kaldır" ayrı şeyler ----------------------- */
check(shouldKeepCover({ people: [], updatedAt: "x" }), "alan yoksa eski kapak KORUNUR");
check(!shouldKeepCover({ coverPhoto: "a.jpg" }), "alan doluysa söylenen uygulanır");
check(!shouldKeepCover({ coverPhoto: undefined }), "alan boş ama VARSA kaldırma isteğidir");
check(!shouldKeepCover({ coverPhoto: "" }), "boş dize de bir karardır");

/*
 * KAPI: kapak fotoğrafını sessizce silen desen geri gelmesin.
 *
 * Yedi rota kaydederken `{ people, updatedAt }` diye yeni bir nesne kuruyor
 * ve kapak orada olmadığı için siliniyordu — hata bir rotada değil,
 * desendeydi. Düzeltme `saveFamilyData` içinde tek yerde; bu denetim o tek
 * yerin durduğunu ve kaldırma yolunun `delete` kullanmadığını doğruluyor.
 */
const blob = readFileSync(new URL("../lib/blob.ts", import.meta.url), "utf8");
check(blob.includes("shouldKeepCover"), "saveFamilyData kapak kuralını uyguluyor");

const cover = readFileSync(new URL("../app/api/family/cover/route.ts", import.meta.url), "utf8");
/*
 * `delete data.coverPhoto` alanı nesneden KALDIRIRDI; yeni kural onu "bir
 * şey söylemedim" diye okuyup kapağı geri getirirdi. Yani kapak silme
 * düğmesi çalışmaz olurdu.
 */
check(!/delete\s+data\.coverPhoto/.test(cover), "kapak kaldırma `delete` kullanmıyor");
check(/data\.coverPhoto\s*=\s*undefined/.test(cover), "kapak kaldırma alanı açıkça boşaltıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
