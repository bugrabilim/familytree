import { readFileSync } from "node:fs";
import type { Person } from "../types/family.ts";
import { scrubDeleted } from "../lib/scrub.ts";
import { findRefIssues } from "../lib/refcheck.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: id, lastName: "Soy", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});

/* --- ASIL ÖLÇÜ: silmeden sonra bütünlük tarayıcısı temiz olmalı -------- */
/*
 * Uygulamanın kendi tarayıcısı (`lib/refcheck.ts`) hakem. Eskiden sıradan
 * bir silme, o tarayıcının `error` seviyesinde bildirdiği İKİ sorun + bir
 * uyarı bırakıyordu: eski eş bağı, çevre bağı ve öksüz ebeveyn notu.
 */
{
  const people = [
    P("a", {
      formerSpouseIds: ["b"],
      associations: [{ id: "as", personId: "b", type: "arkadas" }],
      parentLinks: { b: { kind: "step" } },
      parentIds: ["b"],
      spouseIds: ["b"],
    }),
    P("b"),
  ];
  const sonra = scrubDeleted(people, ["b"]);
  eq(findRefIssues(sonra), [], "silmeden sonra hiç bütünlük sorunu kalmıyor");

  const a = sonra.find((p) => p.id === "a")!;
  eq(a.parentIds, [], "ebeveyn başvurusu temizlendi");
  eq(a.spouseIds, [], "eş başvurusu temizlendi");
  eq(a.formerSpouseIds, [], "eski eş başvurusu temizlendi");
  eq(a.associations, [], "çevre bağı temizlendi");
  eq(a.parentLinks, undefined, "boşalan parentLinks temizlendi (boş nesne değil)");
}

/* --- Dokunulmaması gerekenler ------------------------------------------- */
{
  const people = [
    P("a", { formerSpouseIds: ["c"], associations: [{ id: "x", personId: "c", type: "komsu" }],
             parentLinks: { c: { kind: "biological" } }, parentIds: ["c"] }),
    P("b"),
    P("c"),
  ];
  const sonra = scrubDeleted(people, ["b"]);
  const a = sonra.find((p) => p.id === "a")!;
  eq(a.formerSpouseIds, ["c"], "silinmeyen kişinin bağı duruyor");
  eq(a.associations?.length, 1, "ilgisiz çevre bağı duruyor");
  eq(a.parentLinks, { c: { kind: "biological" } }, "ilgisiz bağ notu duruyor");
  eq(sonra.length, 2, "yalnız hedef silindi");
}
{
  // Olmayan isteğe bağlı alanlar YARATILMAMALI: boş dizi bırakmak kaydı
  // şişirir ve "eskiden eşi vardı" izlenimi verir.
  const sonra = scrubDeleted([P("a"), P("b")], ["b"]);
  const a = sonra.find((p) => p.id === "a")!;
  check(!("formerSpouseIds" in a) || a.formerSpouseIds === undefined, "formerSpouseIds uydurulmuyor");
  check(!("associations" in a) || a.associations === undefined, "associations uydurulmuyor");
  check(!("parentLinks" in a) || a.parentLinks === undefined, "parentLinks uydurulmuyor");
}
{
  eq(scrubDeleted([], ["x"]), [], "boş liste");
  const p = [P("a"), P("b")];
  eq(scrubDeleted(p, []).length, 2, "silinecek yoksa liste aynen döner");
  eq(scrubDeleted(p, new Set(["a", "b"])).length, 0, "hepsi silinebilir");
}
{
  // Aynı anda birden çok kişi (toplu silme yolu).
  const people = [
    P("a", { parentIds: ["b", "c"], spouseIds: ["b"], formerSpouseIds: ["c"] }),
    P("b"), P("c"),
  ];
  const sonra = scrubDeleted(people, ["b", "c"]);
  const a = sonra.find((p) => p.id === "a")!;
  eq([a.parentIds, a.spouseIds, a.formerSpouseIds], [[], [], []], "çoklu silmede hepsi temizlendi");
}

/* --- KAPI: iki silme rotası da AYNI işlevi kullanmalı -------------------- */
/*
 * Bu iki rota bir kez ayrı düşmüştü ve toplu silmenin yorumu hâlâ "tekli
 * DELETE ile aynı mantık" diyordu — oysa değildi. Kopyalanan mantık yeniden
 * kopyalanmasın diye kural burada kilitli.
 */
for (const yol of ["../app/api/family/person/[id]/route.ts", "../app/api/family/bulk-delete/route.ts"]) {
  const src = readFileSync(new URL(yol, import.meta.url), "utf8");
  check(src.includes("scrubDeleted"), `${yol} ortak temizliği kullanıyor`);
  // Elle yeniden yazılmış bir süzgeç kalmamalı.
  check(!/parentIds:\s*p\.parentIds\.filter/.test(src), `${yol} kendi süzgecini yazmıyor`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
