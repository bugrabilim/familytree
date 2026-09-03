import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * KAPI: `oku→değiştir→yaz` yapan her yazma ucu iyimser kilitten geçer.
 *
 * Denetim uzun süre YALNIZ iki kişi rotasındaydı. Yani tek bir kişiyi
 * düzenlemek korunuyor, ama yirmi kişiyi silen ya da iki kaydı birleştiren
 * işlem korunmuyordu — en yıkıcı işlemler en korumasızları. Üstelik toplu
 * işlemler `x-base-version` başlığını hiç göndermiyordu, çünkü kendi
 * bileşenlerinden doğrudan `fetch` ediyorlardı.
 */

/* --- Davranış: başlık yoksa engel yok (geriye dönük uyumlu) -------------- */
/*
 * `lib/blob.ts` çalışma zamanında `@/` içe aktarıyor (server-only), yani
 * strip-types koşucusunda içe aktarılamaz — deponun kendi kuralı. O yüzden
 * kural KAYNAK düzeyinde kilitleniyor; buradaki tek kritik özellik geriye
 * dönük uyumluluk: başlık göndermeyen çağıranlar (mobil, betikler)
 * engellenmemeli, yoksa bu değişiklik onları kırardı.
 */
{
  const blob = readFileSync(new URL("../lib/blob.ts", import.meta.url), "utf8");
  const i = blob.indexOf("export function versionMismatch");
  const govde = blob.slice(i, blob.indexOf("\n}", i));
  check(i > 0, "versionMismatch bulundu");
  check(/return\s+!!base\s+&&/.test(govde), "başlık yoksa çakışma YOK (geriye dönük uyumlu)");
  check(/base\s*!==\s*current/.test(govde), "sürüm farkı çakışma sayılıyor");
  check(govde.includes('get("x-base-version")'), "sürüm başlıktan okunuyor");
}

/* --- Sunucu: yıkıcı rotalar denetimden geçiyor --------------------------- */
for (const rota of ["person/route", "person/[id]/route", "bulk-delete/route", "merge/route", "merge-all/route"]) {
  const s = read(`../app/api/family/${rota}.ts`);
  check(s.includes("versionMismatch("), `${rota}: iyimser kilit var`);
  // Denetim YAZMADAN önce gelmeli.
  const i = s.indexOf("versionMismatch(");
  const j = s.indexOf("saveFamilyData(");
  check(i > 0 && j > 0 && i < j, `${rota}: denetim yazmadan ÖNCE`);
}

/* --- İstemci: toplu çağrılar sürümü taşıyor ----------------------------- */
const actions = read("../lib/actions.ts");
check(/export function mutationHeaders/.test(actions), "ortak başlık yardımcısı dışa aktarılmış");
check(actions.includes('h["x-base-version"] = baseVersion'), "yardımcı sürümü ekliyor");
for (const [bilesen, uc] of [
  ["TableView", "bulk-delete"],
  ["PanelView", "merge-all"],
  ["MergeDialog", "merge"],
] as const) {
  const s = read(`../components/${bilesen}.tsx`);
  const i = s.indexOf(`/api/family/${uc}`);
  check(i > 0, `${bilesen}: ${uc} çağrısı bulundu`);
  check(s.slice(i, i + 260).includes("mutationHeaders()"), `${bilesen}: sürüm başlığını gönderiyor`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
