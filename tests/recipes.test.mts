import {
  fold, fromLines, groupByOccasion, groupByPerson, matches,
  normalizeRecipe, sortRecipes, toLines, MAX_LINES, MAX_LINE, MAX_TITLE,
} from "../lib/recipes.ts";
import type { Recipe } from "../types/recipe.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const R = (extra: Partial<Recipe> = {}): Recipe => ({
  id: "r", title: "Tarif", ingredients: [], steps: [],
  createdAt: "2026-01-01", updatedAt: "2026-01-01", ...extra,
});

/* --- toLines: madde imleri temizlenir ------------------------------------ */
eq(toLines("- un\n- su\n\n- tuz"), ["un", "su", "tuz"], "tire imleri temizlenir");
eq(toLines("1. kavur\n2) karıştır\n3.  pişir"), ["kavur", "karıştır", "pişir"], "numaralı imler temizlenir");
eq(toLines("• yağ\n– tereyağı\n— zeytinyağı"), ["yağ", "tereyağı", "zeytinyağı"], "madde işaretleri temizlenir");
eq(toLines("\n\n  \n"), [], "boş metin → boş liste");
eq(toLines("2 su bardağı un"), ["2 su bardağı un"], "satır içi sayı KORUNUR");
eq(toLines("1.5 çay kaşığı tuz"), ["1.5 çay kaşığı tuz"], "ondalık sayı im sanılmaz");
// Satır ve uzunluk sınırları
{
  const cok = Array.from({ length: MAX_LINES + 50 }, (_, i) => `satır ${i}`).join("\n");
  eq(toLines(cok).length, MAX_LINES, "satır sayısı sınırlanır");
  eq(toLines("x".repeat(MAX_LINE + 100))[0].length, MAX_LINE, "satır uzunluğu kırpılır");
}
eq(fromLines(toLines("- un\n- su")), "un\nsu", "gidiş-dönüş metne çevirir");

/* --- Türkçe katlama ------------------------------------------------------ */
eq(fold("İSTANBUL"), "istanbul", "büyük İ doğru katlanır");
eq(fold("Şeker Çöreği"), "seker coregi", "ş/ç/ö/ğ katlanır");
eq(fold("Ilık Sütlü"), "ilik sutlu", "ı ve ü katlanır");

/* --- Arama --------------------------------------------------------------- */
{
  const r = R({ title: "Nine'nin Çorbası", ingredients: ["kırmızı mercimek"], place: "Develi", note: "Kışın" });
  check(matches(r, "çorba"), "başlıkta arar");
  check(matches(r, "CORBA"), "aksansız/büyük harfle bulur");
  check(matches(r, "mercimek"), "malzemede arar");
  check(matches(r, "develi"), "yörede arar");
  check(matches(r, "kışın"), "notta arar");
  check(!matches(r, "pilav"), "olmayanı bulmaz");
  check(matches(r, ""), "boş sorgu hepsini geçirir");
}

/* --- Sıralama Türkçe ----------------------------------------------------- */
{
  // Türkçede i, s'den önce gelir → "İçli köfte" < "Sarma".
  const s = sortRecipes([R({ id: "1", title: "Sarma" }), R({ id: "2", title: "İçli köfte" })]);
  eq(s.map((x) => x.title), ["İçli köfte", "Sarma"], "Türkçe alfabetik");
}

/* --- Kişiye göre öbekleme ------------------------------------------------ */
{
  const list = [
    R({ id: "1", title: "Çorba", fromPersonId: "p1", fromName: "Nine" }),
    R({ id: "2", title: "Pilav", fromPersonId: "p1", fromName: "Nine" }),
    R({ id: "3", title: "Ayran aşı", fromPersonId: "p2", fromName: "Hala" }),
    R({ id: "4", title: "Yöre tarifi" }), // kimseye bağlı değil
  ];
  const g = groupByPerson(list, "Bağsız");
  eq(g.map((x) => x.label), ["Hala", "Nine", "Bağsız"], "kişiler alfabetik, bağsızlar SONDA");
  eq(g[1].recipes.map((r) => r.title), ["Çorba", "Pilav"], "öbek içi başlığa göre sıralı");
  eq(g[2].recipes.length, 1, "bağsız tarif ATILMAZ");
}

/* --- Vesileye göre öbekleme: yazım farkı tek öbek ------------------------ */
{
  const list = [
    R({ id: "1", title: "A", occasion: "Bayram" }),
    R({ id: "2", title: "B", occasion: "bayram" }),
    R({ id: "3", title: "C", occasion: "BAYRAM" }),
    R({ id: "4", title: "D" }),
  ];
  const g = groupByOccasion(list, "Diğer");
  eq(g.length, 2, "üç yazım tek öbek + vesilesizler");
  eq(g[0].label, "Bayram", "gösterimde ilk karşılaşılan özgün yazım");
  eq(g[0].recipes.length, 3, "üçü de aynı öbekte");
  eq(g[1].label, "Diğer", "vesilesizler sonda");
}

/* --- normalizeRecipe ----------------------------------------------------- */
{
  const now = "2026-09-02T00:00:00.000Z";
  // Başlıksız kayıt reddedilir.
  eq(normalizeRecipe({ title: "   " }, now), null, "başlıksız tarif reddedilir");

  // Yalnız başlıkla kaydedilebilir: eksik hatırlanan tarif de kayda değer.
  const az = normalizeRecipe({ title: "Sadece adı" }, now)!;
  eq(az.ingredients, [], "malzemesiz kaydedilebilir");
  eq(az.steps, [], "adımsız kaydedilebilir");
  eq(az.createdAt, now, "createdAt konur");

  // Metin kutularından satırlara.
  const r = normalizeRecipe(
    { title: "  Çorba  ", ingredientsText: "- mercimek\n- soğan", stepsText: "1. kavur\n2. haşla" },
    now
  )!;
  eq(r.title, "Çorba", "başlık kırpılır");
  eq(r.ingredients, ["mercimek", "soğan"], "malzeme metni satırlara");
  eq(r.steps, ["kavur", "haşla"], "adım metni satırlara");

  // Güncelleme: verilmeyen alan KORUNUR, createdAt değişmez.
  const eski = R({ id: "x", title: "Eski", place: "Develi", createdAt: "2020-01-01", ingredients: ["un"] });
  const yeni = normalizeRecipe({ title: "Yeni" }, now, eski)!;
  eq(yeni.id, "x", "kimlik korunur");
  eq(yeni.place, "Develi", "verilmeyen alan korunur");
  eq(yeni.ingredients, ["un"], "verilmeyen malzeme korunur");
  eq(yeni.createdAt, "2020-01-01", "createdAt değişmez");
  eq(yeni.updatedAt, now, "updatedAt tazelenir");

  // Boş dize ile ALAN TEMİZLENİR (undefined ile karıştırılmaz).
  const temiz = normalizeRecipe({ title: "Y", place: "" }, now, eski)!;
  eq(temiz.place, undefined, "boş dize alanı temizler");

  // Başlık uzunluk sınırı.
  eq(normalizeRecipe({ title: "a".repeat(MAX_TITLE + 50) }, now)!.title.length, MAX_TITLE, "başlık kırpılır");

  // Dizi olarak gelen malzeme de temizlenir.
  const dizi = normalizeRecipe({ title: "Z", ingredients: ["- un", "", "  su  "] }, now)!;
  eq(dizi.ingredients, ["un", "su"], "dizi gelirse de ayıklanır");
}

/* --- Kişi silinse de tarif kimin olduğunu unutmaz ------------------------ */
{
  // `fromPersonId` sarkabilir; `fromName` o yüzden ayrı saklanır.
  const r = R({ fromPersonId: "silinmis", fromName: "Nine" });
  const g = groupByPerson([r], "Bağsız");
  eq(g[0].label, "Nine", "kişi ağaçta olmasa da adı korunur");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
