import { readFileSync, existsSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}

/**
 * KAPI: duygusal bağ katmanı dışarı SIZMIYOR mu?
 *
 * Bu veri ailenin en hassas kısmı. "Amcamla aramız kopuk", "annemle iç içe
 * ve çatışmalı" — bunlar bir doğum tarihi gibi değil. Ağacın sahibi bir
 * paylaşım bağlantısı verdiğinde, ya da GEDCOM dışa aktardığında, ya da
 * kitabı bastığında bu katmanın orada OLMAMASI gerekiyor.
 *
 * Ayrı bir blob (`bonds-<treeId>.json`) seçilmesinin asıl sebebi bu: bağlar
 * `family-data` içinde dursaydı, güvenlik "her dışa aktarma yolunda tek tek
 * hariç tutmayı unutmamak"a bağlı olurdu ve bir gün biri unutulurdu. Ayrı
 * dosyada varsayılan DIŞARIDA kalmak. Bu test o varsayılanı kilitliyor:
 * biri ileride dışa açık bir yüzeye bağ okuması eklerse burada kırılır.
 */

const kok = new URL("../", import.meta.url);
const oku = (p: string) => (existsSync(new URL(p, kok)) ? readFileSync(new URL(p, kok), "utf8") : null);

/** Dışa açık yüzeyler — girişsiz erişilebilen ya da dosya olarak dışarı çıkan. */
const DISA_ACIK = [
  "app/g/[token]/page.tsx",       // girişsiz paylaşım sayfası
  "components/MemorialPage.tsx",  // paylaşım bağlantısıyla açılan anma sayfası
  "app/api/family/export/route.ts", // GEDCOM / dosya dışa aktarma
  "lib/gedcom.ts",                // GEDCOM üretici
  "lib/ftz.ts",                   // taşınabilir arşiv
  "lib/gedzip.ts",
  "components/BookView.tsx",      // basılabilir kitap
  "components/PrintView.tsx",
  "lib/preface.ts",
];

for (const yol of DISA_ACIK) {
  const src = oku(yol);
  if (src === null) {
    // Dosya taşındıysa test sessizce geçmemeli — kapı bekçisiz kalır.
    check(false, `${yol} bulunamadı — kapı listesi güncellenmeli`);
    continue;
  }
  const sizinti =
    /from\s+["'](?:@\/)?(?:\.\.?\/)*lib\/bond-store["']/.test(src) ||
    /from\s+["'](?:@\/)?(?:\.\.?\/)*lib\/bonds(?:\.ts)?["']/.test(src) ||
    /readBonds|BOND_STYLES|bondsOf\b/.test(src);
  check(!sizinti, `${yol} duygusal bağ katmanına dokunmuyor`);
}

/* --- Bağ ucu korumalı mı? ----------------------------------------------- */
{
  const rota = oku("app/api/family/bonds/route.ts");
  check(rota !== null, "bağ rotası var");
  if (rota) {
    check(rota.includes("resolveActiveTree"), "bağ rotası oturum çözümlüyor");
    // Yazma uçlarının hepsi düzenleme yetkisi istemeli.
    for (const yontem of ["POST", "PUT", "DELETE"]) {
      const i = rota.indexOf(`export async function ${yontem}`);
      const govde = rota.slice(i, rota.indexOf("\n}", i));
      check(i >= 0 && /guard\(true\)/.test(govde), `${yontem} düzenleyici yetkisi istiyor`);
    }
    const iG = rota.indexOf("export async function GET");
    const govdeG = rota.slice(iG, rota.indexOf("\n}", iG));
    check(/guard\(false\)/.test(govdeG), "GET oturum istiyor (ama düzenleyici şartı yok)");
  }
}

/* --- Paylaşım rotası genel bir "her şeyi ver" ucu değil ----------------- */
{
  // `proxy.ts` genel allow-list'i: bağ ucu herkese açık olmamalı.
  const pub = oku("lib/public-routes.ts");
  check(pub !== null, "public-routes.ts var");
  if (pub) check(!/bond/i.test(pub), "bağ ucu herkese açık listede değil");
}

/* --- Kişi silinince bağı da silinmeli ----------------------------------- */
{
  const silme = oku("app/api/family/person/[id]/route.ts");
  check(silme !== null, "kişi silme rotası var");
  if (silme) {
    const i = silme.indexOf("export async function DELETE");
    const govde = silme.slice(i);
    check(
      i >= 0 && govde.includes("deleteBondsOfPerson"),
      "kişi silinince o kişinin bağları da siliniyor"
    );
  }
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
