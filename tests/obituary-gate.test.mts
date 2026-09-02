import { readFileSync } from "node:fs";
import { publicObituaries } from "../lib/obituaries.ts";
import type { Obituary } from "../types/obituary.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}

/**
 * HERKESE AÇIK YÜZEY KAPISI.
 *
 * Ölüm haberi, ailenin paylaşmayı SEÇMEDİĞİ sürece dışarı çıkmamalı. Kural
 * `publicObituaries`te ama asıl soru burada: girişsiz sayfa o kapıdan mı
 * okuyor, yoksa hepsini okuyup kendi mi süzüyor? İkincisi olsaydı, süzmeyi
 * unutmak bir satırlık hata olurdu — ve unutulduğunda kimse fark etmezdi,
 * çünkü aile içi görünüm doğru çalışmaya devam ederdi.
 */

const store = readFileSync(new URL("../lib/obituary-store.ts", import.meta.url), "utf8");
const share = readFileSync(new URL("../app/g/[token]/page.tsx", import.meta.url), "utf8");
const view = readFileSync(new URL("../components/PublicObituaries.tsx", import.meta.url), "utf8");

/* --- İki ayrı okuma yolu var -------------------------------------------- */
check(/export async function readObituaries/.test(store), "aile içi okuma yolu var");
check(/export async function readPublicObituaries/.test(store), "herkese açık okuma yolu var");
{
  const i = store.indexOf("export async function readPublicObituaries");
  const govde = store.slice(i, store.indexOf("\n}", i));
  check(govde.includes("publicObituaries"), "herkese açık yol `publicObituaries`ten geçiyor");
}
// Ham pano dışarı açılmıyor.
check(!/export\s+(async\s+)?function\s+getBoard/.test(store), "ham pano dışa aktarılmıyor");

/* --- Girişsiz sayfa DOĞRU yoldan okuyor --------------------------------- */
check(share.includes("readPublicObituaries"), "paylaşım sayfası herkese açık yoldan okuyor");
check(!/readObituaries\s*\(/.test(share), "paylaşım sayfası aile içi yolu KULLANMIYOR");

/* --- Görünüm kendi süzmüyor --------------------------------------------- */
// Bileşen bir bayrağa bakıp karar verseydi, süzmeyi çağıranın unutması
// mümkün olurdu. Süzme tek yerde: depo.
check(!/publicShare/.test(view), "herkese açık bileşen `publicShare`e BAKMIYOR (süzme tek yerde)");

/* --- Davranış: varsayılan kapalı ---------------------------------------- */
{
  const O = (extra: Partial<Obituary>): Obituary => ({
    id: "o", personId: "p", personName: "Ali", createdAt: "", updatedAt: "", ...extra,
  });
  check(publicObituaries([O({})]).length === 0, "alan yoksa dışarı çıkmaz");
  check(publicObituaries([O({ publicShare: false })]).length === 0, "kapalıysa çıkmaz");
  check(publicObituaries([O({ publicShare: true })]).length === 1, "açıksa çıkar");
  // Kaza eseri yayım olmasın: doğruluk-benzeri değerler geçmez.
  for (const v of [1, "true", "on", {}] as unknown[]) {
    check(publicObituaries([O({ publicShare: v as boolean })]).length === 0,
      `doğruluk-benzeri değer yayımlamaz: ${JSON.stringify(v)}`);
  }
  // Gizli metin sızmıyor.
  const gizli = O({ publicShare: false, message: "AILE-ICI-METIN" });
  check(!JSON.stringify(publicObituaries([gizli])).includes("AILE-ICI-METIN"),
    "yayımlanmamış duyurunun metni serileştirmede geçmiyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
