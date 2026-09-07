import { readFileSync } from "node:fs";
import { describeGeneration, generationRank } from "../lib/generation.ts";
import {
  indexPeople,
  NAMED_ANCESTOR_DEPTH,
  NAMED_DESCENDANT_DEPTH,
  ordinalAta,
  ordinalTorun,
} from "../lib/relations.ts";
import { tr, en, translate } from "../lib/i18n-dict.ts";
import type { Gender, Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const P = (
  id: string,
  gender: Gender,
  parentIds: string[] = [],
  spouseIds: string[] = []
): Person => ({ id, firstName: id, lastName: "T", gender, parentIds, spouseIds });

/*
 *            a5 ── (…)                    kayin
 *             │                             │
 *            a4                           esim ── ben
 *             │                                    │
 *            dede ── nine                        oglum
 *             │                                    │
 *      ┌──────┴──────┐                          torunum
 *    baba ── anne   amca                           │
 *      │             │                            t3
 *  ┌───┴───┐       kuzen                           │
 * ben     abla                                    t4
 *           │
 *         yegen
 */
const people: Person[] = [
  P("a5", "male"),
  P("a4", "male", ["a5"]),
  P("dede", "male", ["a4"]),
  P("nine", "female", [], ["dede"]),
  P("baba", "male", ["dede", "nine"], ["anne"]),
  P("amca", "male", ["dede", "nine"]),
  P("anne", "female", [], ["baba"]),
  P("ben", "male", ["baba", "anne"], ["esim"]),
  P("abla", "female", ["baba", "anne"]),
  P("kuzen", "female", ["amca"]),
  P("yegen", "male", ["abla"]),
  P("esim", "female", ["kayin"], ["ben"]),
  P("kayin", "male"),
  P("oglum", "male", ["ben"]),
  P("torunum", "female", ["oglum"]),
  P("t3", "male", ["torunum"]),
  P("t4", "male", ["t3"]),
  P("yalniz", "male"),
];
const idx = indexPeople(people);

/* ---------------------------------------------------------------------------
 * 1) SAF KATMAN — mesafeden etiket
 * ------------------------------------------------------------------------- */
{
  eq(describeGeneration(0).key, "generation.same", "0 → aynı kuşak");
  eq(describeGeneration(0).direction, "same", "0 yönü");
  eq(describeGeneration(0).distance, 0, "0 mesafesi");

  // Yön ÖNEMLİ: aynı mesafe yukarı ve aşağı farklı adlanır.
  check(
    describeGeneration(2).key !== describeGeneration(-2).key,
    "yukarı ve aşağı aynı mesafede farklı etiket almalı"
  );
  eq(describeGeneration(2).direction, "up", "+2 yukarı");
  eq(describeGeneration(-2).direction, "down", "−2 aşağı");
  eq(describeGeneration(-3).distance, 3, "−3 mesafesi mutlak");

  // Adı olan basamaklar
  for (let d = 1; d <= NAMED_ANCESTOR_DEPTH; d++) {
    const r = describeGeneration(d);
    check(r.named, `+${d} yerleşik adlı olmalı`);
    eq(r.key, `generation.up.${d}`, `+${d} anahtarı`);
  }
  for (let d = 1; d <= NAMED_DESCENDANT_DEPTH; d++) {
    const r = describeGeneration(-d);
    check(r.named, `−${d} yerleşik adlı olmalı`);
    eq(r.key, `generation.down.${d}`, `−${d} anahtarı`);
  }

  // Sınırın ötesi SAYISAL biçime düşer — sonsuza kadar ad uydurulmaz.
  for (const d of [NAMED_ANCESTOR_DEPTH + 1, NAMED_ANCESTOR_DEPTH + 5, 20]) {
    const r = describeGeneration(d);
    check(!r.named, `+${d} sayısal biçime düşmeli`);
    eq(r.key, "generation.up", `+${d} sayısal anahtar`);
    eq(r.params.count, d, `+${d} sayısı parametrede`);
  }
  for (const d of [NAMED_DESCENDANT_DEPTH + 1, NAMED_DESCENDANT_DEPTH + 4, 20]) {
    const r = describeGeneration(-d);
    check(!r.named, `−${d} sayısal biçime düşmeli`);
    eq(r.key, "generation.down", `−${d} sayısal anahtar`);
    eq(r.params.count, d, `−${d} sayısı parametrede`);
  }
}

/* ---------------------------------------------------------------------------
 * 2) SINIR, `lib/relations.ts` İLE AYNI YERDE BİTMELİ
 *
 * Yan yana duran iki rozet aynı kişi için "Büyük büyük dede" ve "5. kuşak ata"
 * diyemez. Bu yüzden adın bittiği nokta orada da burada da aynı sayı.
 * ------------------------------------------------------------------------- */
{
  const sayiVar = (s: string) => /\d/.test(s);
  check(!sayiVar(ordinalAta(NAMED_ANCESTOR_DEPTH, "male")), "ata merdiveni sınırda hâlâ adlı");
  check(sayiVar(ordinalAta(NAMED_ANCESTOR_DEPTH + 1, "male")), "ata merdiveni sınırdan sonra sayısal");
  check(!sayiVar(ordinalTorun(NAMED_DESCENDANT_DEPTH)), "torun merdiveni sınırda hâlâ adlı");
  check(sayiVar(ordinalTorun(NAMED_DESCENDANT_DEPTH + 1)), "torun merdiveni sınırdan sonra sayısal");
}

/* ---------------------------------------------------------------------------
 * 3) GRAF — kök kişiye göre rütbe
 * ------------------------------------------------------------------------- */
{
  const off = (a: string, b: string) => generationRank(a, b, people, idx)?.offset ?? null;

  eq(off("ben", "ben"), 0, "kendisi");
  eq(off("ben", "baba"), 1, "baba +1");
  eq(off("ben", "anne"), 1, "anne +1");
  eq(off("ben", "dede"), 2, "dede +2");
  eq(off("ben", "nine"), 2, "nine +2");
  eq(off("ben", "a4"), 3, "dedenin babası +3");
  eq(off("ben", "a5"), 4, "dedenin dedesi +4");
  eq(off("ben", "oglum"), -1, "oğul −1");
  eq(off("ben", "torunum"), -2, "torun −2");
  eq(off("ben", "t3"), -3, "torun çocuğu −3");
  eq(off("ben", "t4"), -4, "4 kuşak aşağı");

  // Yan dallar: amca ebeveyn kuşağında, kuzen aynı kuşakta, yeğen çocuk kuşağında.
  eq(off("ben", "abla"), 0, "kardeş aynı kuşak");
  eq(off("ben", "amca"), 1, "amca ebeveyn kuşağında");
  eq(off("ben", "kuzen"), 0, "kuzen aynı kuşakta");
  eq(off("ben", "yegen"), -1, "yeğen çocuk kuşağında");

  // Evlilik adımı kuşak saymaz.
  eq(off("ben", "esim"), 0, "eş aynı kuşak");
  eq(off("ben", "kayin"), 1, "kayınpeder ebeveyn kuşağında");
  eq(off("esim", "dede"), 2, "eşin üzerinden dede +2");

  // Etiketler
  eq(generationRank("ben", "amca", people, idx)?.key, "generation.up.1", "amca → ebeveyn kuşağı");
  eq(generationRank("ben", "t4", people, idx)?.key, "generation.down", "4 aşağı → sayısal");
  eq(generationRank("ben", "a5", people, idx)?.key, "generation.up.4", "+4 hâlâ adlı");

  // Bakışımlılık: yön çevrilince işaret çevrilir.
  for (const other of ["baba", "dede", "oglum", "amca", "kuzen", "esim", "t4", "a5"]) {
    const ileri = generationRank("ben", other, people, idx);
    const geri = generationRank(other, "ben", people, idx);
    check(!!ileri && !!geri && ileri.offset === -geri.offset, `bakışımlı: ben ↔ ${other}`);
  }

  /*
   * BİLİNMEYEN / BAĞLANTISIZ → null, boş dize DEĞİL. Görünüm "etiket yok" ile
   * "etiketi boş" arasındaki farkı görebilmeli; boş dize rozeti çizdirir.
   */
  eq(generationRank("ben", "yalniz", people, idx), null, "bağlantısız kişi null");
  eq(generationRank("ben", "olmayan", people, idx), null, "bilinmeyen hedef null");
  eq(generationRank("olmayan", "ben", people, idx), null, "bilinmeyen kök null");
}

/* ---------------------------------------------------------------------------
 * 4) i18n — üretilen HER anahtarın iki dilde de karşılığı var
 * ------------------------------------------------------------------------- */
{
  const uretilen = new Set<string>();
  for (let d = -12; d <= 12; d++) uretilen.add(describeGeneration(d).key);
  check(uretilen.size === NAMED_ANCESTOR_DEPTH + NAMED_DESCENDANT_DEPTH + 3,
    `üretilen anahtar sayısı (${uretilen.size})`);

  for (const key of uretilen) {
    check(key in tr, `tr'de "${key}" var`);
    check(key in en, `en'de "${key}" var`);
    // translate() eksik anahtarda anahtarın kendisini döndürür — sızmasın.
    check(translate("tr", key, { count: 9 }) !== key, `tr "${key}" gerçek metin`);
    check(translate("en", key, { count: 9 }) !== key, `en "${key}" gerçek metin`);
  }
  check("generation.computed" in tr && "generation.computed" in en, "hesaplandığını söyleyen not iki dilde");

  // Sayısal biçim gerçekten sayıyı basıyor mu?
  check(translate("tr", "generation.up", { count: 6 }).includes("6"), "tr sayısal biçim sayıyı basar");
  check(translate("en", "generation.down", { count: 6 }).includes("6"), "en sayısal biçim sayıyı basar");

  /*
   * SÖZ DAĞARCIĞI `lib/relations.ts` MERDİVENİYLE AYNI OLMALI — paralel bir
   * Türkçe akrabalık sözlüğü kurulmuş olmasın diye. Basamak adları oradaki
   * sözcükleri (dede/nine/torun/çocuk/büyük) kullanıyor mu?
   */
  const trUp2 = tr["generation.up.2"].toLocaleLowerCase("tr");
  check(trUp2.includes("dede") && trUp2.includes("nine"), "2. göbek adı dede/nine sözcüklerini kullanır");
  check(tr["generation.up.3"].toLocaleLowerCase("tr").startsWith("büyük"), "3. göbek 'büyük' önekiyle");
  check(tr["generation.up.4"].toLocaleLowerCase("tr").startsWith("büyük büyük"), "4. göbek 'büyük büyük' önekiyle");
  check(tr["generation.down.1"].toLocaleLowerCase("tr").includes("çocuk"), "1 aşağı 'çocuk'");
  check(tr["generation.down.2"].toLocaleLowerCase("tr").includes("torun"), "2 aşağı 'torun'");
  check(tr["generation.down.3"].toLocaleLowerCase("tr").includes("torun çocuğu"), "3 aşağı 'torun çocuğu'");
  check(tr["generation.up"].includes("kuşak") && tr["generation.up"].includes("ata"),
    "yukarı sayısal biçim relations.ts'in 'N. kuşak ata' kalıbında");
  check(tr["generation.down"].includes("kuşak") && tr["generation.down"].includes("torun"),
    "aşağı sayısal biçim relations.ts'in 'N. kuşak torun' kalıbında");
}

/* ---------------------------------------------------------------------------
 * 5) KAPI — "alan eklenmedi, etiket hesaplanıyor"
 *
 * Bu bölümün tek işi, birinin ileride "performans olsun" ya da "kullanıcı
 * kendi yazsın" diye kuşak adını `Person`'a kaydetmesini ENGELLEMEK. Saklanan
 * ya da elle girilen bir kuşak adı, ilk ebeveyn düzenlemesinde sessizce
 * yanlışa döner: hiçbir doğrulama patlamaz, kart yalnızca yanlış yazar.
 * ------------------------------------------------------------------------- */
{
  // 5a) `Person` gövdesinde kuşak alanı YOK.
  const types = read("../types/family.ts");
  const i = types.indexOf("export interface Person {");
  check(i > 0, "Person arayüzü bulundu");
  let d = 0, j = i;
  while (true) {
    const c = types[j];
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) break; }
    j++;
  }
  const body = types.slice(i, j);
  const alanlar = [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
  check(alanlar.length > 40, `Person alanları okundu (${alanlar.length})`);

  // "gender" gibi masum adlar elenmesin diye kalıp dar tutuldu.
  const yasak = /generation|kusak|kuşak|gobek|göbek|nesil|ancestorrank|kinrank/i;
  for (const a of alanlar) {
    check(!yasak.test(a), `Person'da kuşak alanı olmamalı — "${a}" bulundu`);
  }

  // 5b) Depoda saklanan bir kuşak alanı adı hiç geçmiyor (API/GEDCOM/form dâhil).
  const saklamaAdlari = ["generationName", "generationRank", "kusakAdi", "gobekAdi", "generationLabel"];
  for (const dosya of [
    "../types/family.ts",
    "../lib/person-fields.ts",
    "../components/PersonForm.tsx",
  ]) {
    const src = read(dosya);
    for (const ad of saklamaAdlari) {
      check(!src.includes(ad), `${dosya} içinde saklanan alan adı "${ad}" olmamalı`);
    }
  }

  // 5c) Etiket gerçekten TÜRETİLİYOR: saf katman ağaçtan yürüyor, kişi
  //     kaydından okumuyor.
  const gen = read("../lib/generation.ts");
  check(gen.includes("findRelationPath"), "kuşak mesafesi akrabalık yolundan sayılıyor");
  check(!/person\.\s*generation|\.generationName|p\.generation\b/.test(gen),
    "saf katman kişi kaydından kuşak okumuyor");
  check(/NAMED_ANCESTOR_DEPTH/.test(gen) && /NAMED_DESCENDANT_DEPTH/.test(gen),
    "ad sınırı relations.ts'ten ithal ediliyor, yeniden yazılmıyor");
  check(gen.includes("alan EKLENMİYOR"), "neden saklanmadığı dosyanın başında yazılı");

  // 5d) Görünümler etiketi hesaplayarak alıyor.
  const drawer = read("../components/PersonDrawer.tsx");
  check(drawer.includes("generationRank("), "PersonDrawer etiketi hesaplayarak alıyor");
  check(drawer.includes('t("generation.computed")'),
    "PersonDrawer etiketin hesaplandığını kullanıcıya söylüyor");
  const panel = read("../components/PanelView.tsx");
  check(panel.includes("describeGeneration("), "Yedi Göbek kartı basamak adını hesaplıyor");
  check(panel.includes('t("generation.computed")'),
    "Yedi Göbek kartı etiketin hesaplandığını söylüyor");

  // 5e) Düzenlenebilir bir alan gibi görünmesin: forma girdi eklenmemiş.
  const form = read("../components/PersonForm.tsx");
  check(!/generation/i.test(form) || !/<input[^>]*generation/i.test(form),
    "PersonForm'da kuşak girdisi yok");

  // 5f) Gizlilik: çekmece hesabı `view()`'dan geçmiş listeden yapıyor.
  check(drawer.includes("people.map(view)"),
    "kuşak hesabı gizlilik görünümünden geçmiş listeyle yapılıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
