/**
 * DEMO TEMİZLİK UCU — kapı.
 *
 * Bu uç `users.json`dan bir satır siliyor, yani kimlik deposuna yazan bir
 * yönetim yüzeyi. Böyle bir ucun tek güvenli biçimi vardır: SİLİNECEK
 * KİMLİĞİ İSTEKTEN ALMAMAK. Parametre alan bir sürüm, yanlış kimlikle
 * çağrıldığında gerçek bir aileyi kimlik sisteminden düşürür ve bunun geri
 * dönüşü yoktur.
 *
 * Kapı bu yüzden davranışı değil YAPIYI kilitliyor: uç girdi okumuyor,
 * sildiği kimlik koddaki sabit, ve `deleteUserRow` başka hiçbir argümanla
 * çağrılmıyor.
 */
import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}

function kodu(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const src = kodu(readFileSync("app/api/admin/demo-cleanup/route.ts", "utf8"));

/* --- 1) Girdi almıyor ---------------------------------------------------- */

// İstek gövdesi, sorgu dizesi ya da yol parametresi okunmamalı.
for (const yasak of ["req.json", "request.json", "searchParams", "nextUrl", "params", "await req", "formData"]) {
  check(!src.includes(yasak), `istekten girdi okunmuyor: ${yasak}`);
}
// İşleyiciler parametresiz olmalı — parametre yoksa okunacak girdi de yok.
check(/export async function POST\(\s*\)/.test(src), "POST parametresiz");
check(/export async function GET\(\s*\)/.test(src), "GET parametresiz");

/* --- 2) Yalnız demo kimliği siliniyor ------------------------------------ */

const silmeler = [...src.matchAll(/deleteUserRow\(([^)]*)\)/g)].map((m) => m[1].trim());
check(silmeler.length === 1, `deleteUserRow tam bir kez çağrılıyor (bulunan: ${silmeler.length})`);
check(silmeler[0] === "DEMO_USER_ID", `silinen kimlik sabitten geliyor (bulunan: ${silmeler[0]})`);
// Sabit koddan gelmeli, dizge olarak kopyalanmamalı: kimlik değişirse kopya
// sessizce eskir ve uç yanlış satırı arar.
check(!/deleteUserRow\(\s*["'`]/.test(src), "kimlik dizge olarak kopyalanmamış");
check(/from "@\/lib\/demo-id"/.test(src), "kimlik `lib/demo-id`den içe aktarılıyor");

/* --- 3) Yalnız KİMLİK satırı gidiyor, veri değil ------------------------- */

for (const yasak of ["purgeTree", "saveFamilyData", "dbDeletePeople", "softDelete", "deleteTree"]) {
  check(!src.includes(yasak), `veri silme çağrısı yok: ${yasak}`);
}

/* --- 4) Yetki kapısı drift ucuyla aynı hizada ---------------------------- */

check(/await auth\(\)/.test(src), "oturum denetleniyor");
check(/isFounder/.test(src), "founder denetleniyor");
check(/canManage/.test(src), "yönetici rolü denetleniyor");
// Kapı HER iki işleyicide de çağrılmalı; GET'i açık bırakmak demo satırının
// varlığını oturumsuz birine söylerdi.
const guardCalls = (src.match(/await guard\(\)/g) ?? []).length;
check(guardCalls === 2, `guard iki işleyicide de çağrılıyor (bulunan: ${guardCalls})`);

/* --- 5) Oturumsuz açılmıyor ---------------------------------------------- */

const routes = kodu(readFileSync("lib/public-routes.ts", "utf8"));
check(!routes.includes("demo-cleanup"), "uç oturumsuz listede DEĞİL");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
