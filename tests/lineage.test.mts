import { readFileSync } from "node:fs";
import { matchesQuery } from "../lib/search.ts";
import { fieldSpec } from "../lib/person-fields.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const P = (extra: Partial<Person> = {}): Person => ({
  id: "p", firstName: "Ali", lastName: "Yılmaz", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});

/**
 * SÜLALE ALANININ "NÖTR" OLMASI iki söze dayanıyor ve ikisi de KODUN
 * YOKLUĞUYLA tutuluyor — yani kolayca ve sessizce bozulabilir. Bu yüzden
 * denetleniyor.
 */

/* --- 1) Hazır taksonomi YOK --------------------------------------------- */
{
  /*
   * Sülale adları yöreye, lehçeye ve ailenin kendi diline göre değişir. Hazır
   * bir liste hem eksik kalır hem de aileye kendi adını başkasının
   * kelimesiyle yazdırır. Bu yüzden hiçbir yerde sabit bir sülale listesi
   * olmamalı — ne sabit dizi, ne `datalist`, ne öneri kutusu.
   */
  const dosyalar = [
    "../types/family.ts",
    "../lib/person-fields.ts",
    "../components/PersonForm.tsx",
  ];
  for (const f of dosyalar) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    // "LINEAGES", "SULALELER", "CLANS" gibi bir sabit liste
    check(
      !/(LINEAGES|SULALE[A-Z_]*|CLANS?|ASIRET[A-Z_]*)\s*(:|=)\s*\[/i.test(src),
      `${f}: sabit sülale listesi yok`
    );
    // Alan için `datalist` / öneri bağlanmamış
    check(!/pf-sulale[^>]*list=/.test(src), `${f}: sülale girdisine öneri listesi bağlı değil`);
  }
}

/* --- 2) Soyaddan ÇIKARIM yok -------------------------------------------- */
{
  /*
   * 1934 Soyadı Kanunu soyadlarını devlet eliyle dağıttı; birçok ailenin
   * soyadıyla sülale adı birbiriyle ilgisizdir. "Yılmaz → Yılmazlar" gibi bir
   * tahmin, kaydı ailenin bilmediği bir şeyle doldurmak olur.
   */
  const dosyalar = ["../lib/person-fields.ts", "../components/PersonForm.tsx", "../lib/name.ts"];
  for (const f of dosyalar) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    // `lineage` ile `lastName` aynı ifadede geçmemeli (atama ya da türetme).
    const satirlar = src.split("\n").filter((l) => /lineage/i.test(l) && /lastName/i.test(l));
    check(satirlar.length === 0, `${f}: sülale soyaddan türetilmiyor`);
  }
  // Formda sülale kutusu yalnız kullanıcının yazdığını taşır.
  const form = readFileSync(new URL("../components/PersonForm.tsx", import.meta.url), "utf8");
  check(
    /lineage:\s*initial\?\.lineage\s*\?\?\s*""/.test(form),
    "form başlangıç değeri yalnız kayıttaki değer (varsayılan üretilmiyor)"
  );
}

/* --- 3) Alan kaydı ------------------------------------------------------- */
{
  const spec = fieldSpec("lineage");
  check(!!spec, "sülale kayıt defterinde");
  eq(spec?.merge, "text", "metin alanı");
  // Gizlilik grubu YOK — bilerek. `origin` KVKK'nın özel nitelikli verisi
  // içindir; sülale etnik bir kategori değil, ailenin kendi adıdır.
  eq(spec?.privateGroup, undefined, "etnik köken grubuna KONMAMIŞ");
}

/* --- 4) Aranabilir ------------------------------------------------------- */
{
  const p = P({ lineage: "Kara Mehmetgil" });
  check(matchesQuery(p, "Kara Mehmet"), "sülaleyle aranabiliyor");
  check(matchesQuery(p, "kara mehmetgil"), "küçük harfle de bulunuyor");
  check(!matchesQuery(P(), "Kara Mehmet"), "sülalesi olmayan eşleşmiyor");
  /*
   * Aksansız yazım da bulmalı. Bu satır önce ters yazılmıştı — o gün arama
   * katlamıyordu ve test bugünkü (yanlış) davranışı belgeliyordu; katlama
   * `lib/turkish.ts`e taşınıp aramaya bağlanınca test düştü ve düzeltmenin
   * geldiğini söyledi. Beklenen buydu.
   */
  check(matchesQuery(P({ lineage: "Hacıların Ocağı" }), "hacıların"), "aynı yazımla bulunuyor");
  check(matchesQuery(P({ lineage: "Hacıların Ocağı" }), "hacilarin"),
    "aksansız yazım da bulunuyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
