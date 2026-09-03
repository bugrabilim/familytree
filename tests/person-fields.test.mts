import { readFileSync } from "node:fs";
import {
  buildPersonFields, EXCLUDED_FIELDS, fieldSpec, fieldsInGroup,
  mergePersonFields, PERSON_FIELDS,
} from "../lib/person-fields.ts";
import { PRIVATE_GROUPS } from "../types/family.ts";
import { tr, en } from "../lib/i18n-dict.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/* ---------------------------------------------------------------------------
 * 1) KAPSAM: `Person`daki her alan ya kayıtlı ya da gerekçesiyle dışarıda.
 * ------------------------------------------------------------------------- */
{
  const types = read("../types/family.ts");
  const i = types.indexOf("export interface Person {");
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

  const kayitli = new Set(PERSON_FIELDS.map((f) => String(f.key)));
  for (const a of alanlar) {
    const durum = kayitli.has(a) || a in EXCLUDED_FIELDS;
    check(durum, `"${a}" ya kayıt defterinde ya da GEREKÇESİYLE dışarıda olmalı`);
  }
  // Ters yön: hayalet kayıt kalmasın.
  const gercek = new Set(alanlar);
  for (const f of PERSON_FIELDS) {
    check(gercek.has(String(f.key)), `kayıtlı "${String(f.key)}" gerçekten Person'da var`);
  }
  for (const a of Object.keys(EXCLUDED_FIELDS)) {
    check(gercek.has(a), `dışarıda bırakılan "${a}" gerçekten Person'da var`);
  }
  // Gerekçeler boş olamaz.
  for (const [a, neden] of Object.entries(EXCLUDED_FIELDS)) {
    check(neden.trim().length > 10, `"${a}" için gerekçe yazılmış`);
  }
}

/* ---------------------------------------------------------------------------
 * 2) BEŞ YÜZEY: kayıtlı alan gerçekten her yerde bağlı mı?
 * ------------------------------------------------------------------------- */
{
  const form = read("../components/PersonForm.tsx");
  const drawer = read("../components/PersonDrawer.tsx");
  const post = read("../app/api/family/person/route.ts");
  const put = read("../app/api/family/person/[id]/route.ts");

  for (const f of PERSON_FIELDS) {
    const key = String(f.key);
    if (f.surfaces.form) check(form.includes(key), `PersonForm "${key}" alanını taşıyor`);
    if (f.surfaces.drawer) check(drawer.includes(key), `PersonDrawer "${key}" alanını gösteriyor`);
  }

  // API rotaları artık kayıt defterinden geçmeli; alanları tek tek saymak
  // yerine defterin KULLANILDIĞINI denetliyoruz — asıl güvence bu.
  check(post.includes("buildPersonFields"), "POST rotası kayıt defterinden kuruyor");
  check(put.includes("mergePersonFields"), "PUT rotası kayıt defterinden birleştiriyor");

  // Etiket anahtarları iki dilde de var.
  for (const f of PERSON_FIELDS) {
    const k = f.surfaces.labelKey;
    if (!k) continue;
    check(k in tr, `TR etiketi var: ${k}`);
    check(k in en, `EN etiketi var: ${k}`);
  }
}

/* ---------------------------------------------------------------------------
 * 3) GİZLİLİK: defterdeki gruplar `PRIVATE_GROUPS` ile tutarlı.
 * ------------------------------------------------------------------------- */
{
  const gecerli = new Set<string>(PRIVATE_GROUPS as readonly string[]);
  for (const f of PERSON_FIELDS) {
    if (!f.privateGroup) continue;
    check(gecerli.has(f.privateGroup), `"${String(f.key)}" geçerli bir gizlilik grubunda: ${f.privateGroup}`);
  }
  // Koordinat, yer adıyla AYNI grupta olmalı: yeri gizleyip koordinatı
  // bırakmak gizlemek değildir (bu hata bir kez gerçekten oldu).
  eq(fieldSpec("birthCoords")?.privateGroup, fieldSpec("birthPlace")?.privateGroup,
    "birthCoords ile birthPlace aynı grupta");
  eq(fieldSpec("burialCoords")?.privateGroup, fieldSpec("burialPlace")?.privateGroup,
    "burialCoords ile burialPlace aynı grupta");
  check(fieldsInGroup("health").length >= 4, "sağlık grubu alanları kayıtlı");
}

/* ---------------------------------------------------------------------------
 * 4) BİRLEŞTİRME: temizleme GERÇEKTEN çalışıyor mu?
 * ------------------------------------------------------------------------- */
const P = (extra: Partial<Person> = {}): Person => ({
  id: "p", firstName: "Ali", lastName: "Yılmaz", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});

{
  /*
   * ASIL HATA BURADAYDI. Eskiden dört alan `body.x || mevcut` ile
   * birleşiyordu: birthDate, officialBirthDate, deathDate, birthPlace.
   * Boş bir değer eskisine geri düşüyor, yani kullanıcı yanlış girilmiş bir
   * doğum tarihini SİLEMİYORDU — kaydedince eski tarih geri geliyordu.
   * (İkinci yarısı formdaydı: temizlemede `undefined` gönderiyordu, ki API
   * için "dokunma" demek.)
   */
  const dolu = P({
    birthDate: "1950-01-01", officialBirthDate: "1949", deathDate: "2020-05-05",
    birthPlace: "Rize", nickname: "Topal", bio: "hikâye",
  });
  for (const key of ["birthDate", "officialBirthDate", "deathDate", "birthPlace", "nickname", "bio"]) {
    const bosDize = mergePersonFields(dolu, { [key]: "" });
    eq((bosDize as Record<string, unknown>)[key], undefined, `"" ile temizlenebiliyor: ${key}`);
    const nul = mergePersonFields(dolu, { [key]: null });
    eq((nul as Record<string, unknown>)[key], undefined, `null ile temizlenebiliyor: ${key}`);
    const dokunma = mergePersonFields(dolu, {});
    eq((dokunma as Record<string, unknown>)[key], (dolu as Record<string, unknown>)[key],
      `undefined dokunmuyor: ${key}`);
  }
}

{
  // Diziler
  const p = P({ photos: ["a.jpg"], events: [{ id: "e", type: "evlilik", title: "x" }] });
  eq(mergePersonFields(p, { photos: [] }).photos, [], "boş dizi diziyi boşaltır");
  eq(mergePersonFields(p, {}).photos, ["a.jpg"], "dizi verilmezse korunur");
  eq(mergePersonFields(p, { photos: "x" }).photos, ["a.jpg"], "dizi olmayan değer yok sayılır");

  // Boolean
  const g = P({ confidential: true });
  eq(mergePersonFields(g, { confidential: false }).confidential, false, "boolean kapatılabilir");
  eq(mergePersonFields(g, { confidential: "false" }).confidential, true, "dize boolean sayılmaz");
  eq(mergePersonFields(g, {}).confidential, true, "verilmezse korunur");

  // Nesne (koordinat)
  const c = P({ birthCoords: { lat: 1, lng: 2 } });
  eq(mergePersonFields(c, { birthCoords: null }).birthCoords, undefined, "null koordinatı temizler");
  eq(mergePersonFields(c, { birthCoords: "" }).birthCoords, undefined, "boş dize koordinatı temizler");
  eq(mergePersonFields(c, { birthCoords: { lat: 3, lng: 4 } }).birthCoords, { lat: 3, lng: 4 }, "koordinat ayarlanır");
  eq(mergePersonFields(c, {}).birthCoords, { lat: 1, lng: 2 }, "verilmezse korunur");
}

{
  // İlişki grafiği ve sistem alanlarına DOKUNULMAZ.
  const p = P({ parentIds: ["a"], spouseIds: ["b"], code: "K-1" });
  const m = mergePersonFields(p, { parentIds: [], spouseIds: [], id: "sahte", code: "K-9" });
  check(!("parentIds" in m), "parentIds birleştirmeye girmez");
  check(!("spouseIds" in m), "spouseIds birleştirmeye girmez");
  check(!("id" in m), "id birleştirmeye girmez");
  check(!("code" in m), "code birleştirmeye girmez");

  // Tanınmayan anahtar geçmez: istemci kayda gizli alan ekleyemesin.
  const y = mergePersonFields(p, { uydurmaAlan: "x" } as Record<string, unknown>);
  check(!("uydurmaAlan" in y), "tanınmayan anahtar yok sayılır");
}

{
  // POST: boş gövdeden boş alanlar
  const yeni = buildPersonFields({ firstName: "Ayşe", birthDate: "", photos: ["a"] });
  eq(yeni.firstName, "Ayşe", "POST: dolu alan geçer");
  check(!("birthDate" in yeni), "POST: boş alan hiç konmaz");
  eq(yeni.photos, ["a"], "POST: dizi geçer");
  const bos = buildPersonFields({});
  eq(Object.keys(bos).length, 0, "POST: boş gövde boş nesne");
}

/* --- TEMİZLENEBİLİRLİK: formun ürettiği yük gerçekten siliyor mu? ------- */
/*
 * K3/26'da yalnız dört tarih/yer alanı düzeltilmişti, ama oradaki yorum
 * "şimdi kural bütün alanlarda aynı" diyordu. Değildi: lakap, biyografi,
 * meslek, din, fotoğraf, anı, kaynak, çevre bağı ve `confidential` hâlâ
 * boşaltılınca `undefined` gidiyor, yani HİÇ temizlenemiyordu. En kötüsü
 * `confidential`di: "gizli kayıt" işareti onu koyan tek arayüzden geri
 * alınamıyordu.
 *
 * Bu blok kaynağı okuyor: `PersonForm` yükünde bir alanın boşken
 * `undefined`a düşürülmesi tam olarak o hatadır.
 */
{
  const form = readFileSync(new URL("../components/PersonForm.tsx", import.meta.url), "utf8");
  const i = form.indexOf("const payload: PersonPayload = {");
  const yuk = form.slice(i, form.indexOf("\n    };", i));
  check(i >= 0, "PersonForm yükü bulundu");

  // Yük içinde `|| undefined` ya da `: undefined` ile biten hiçbir alan olmamalı.
  const kacaklar = yuk
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /\|\|\s*undefined,?$/.test(l) || /:\s*undefined,?$/.test(l));
  check(
    kacaklar.length === 0,
    `formda temizlenemeyen alan yok (bulunan: ${kacaklar.join(" ; ") || "—"})`
  );

  // Somut olarak en kritik ikisi:
  check(/\bconfidential,/.test(yuk), "confidential doğrudan gönderiliyor (false da gidiyor)");
  check(/\bprivateFields,/.test(yuk), "privateFields doğrudan gönderiliyor (boş dizi de gidiyor)");
}

/* --- Ve merge katmanı o değerleri gerçekten temizliyor mu? -------------- */
{
  const mevcut = {
    id: "x", firstName: "Ali", lastName: "Demir", gender: "male",
    parentIds: [], spouseIds: [],
    nickname: "Topal", bio: "hikaye", occupation: "Terzi",
    photo: "a.jpg", photos: ["a.jpg"], videos: ["v.mp4"], documents: ["d.pdf"],
    memories: [{ id: "m", text: "ani" }], sources: [{ id: "s", title: "k" }],
    associations: [{ id: "a", personId: "z", type: "arkadas" }],
    confidential: true, privateFields: ["health"],
  } as unknown as Person;

  const bosaltilmis = {
    firstName: "Ali", lastName: "Demir", gender: "male",
    nickname: "", bio: "", occupation: "", photo: "",
    photos: [], videos: [], documents: [], memories: [], sources: [], associations: [],
    confidential: false, privateFields: [],
  };

  const out = mergePersonFields(mevcut, bosaltilmis) as unknown as Record<string, unknown>;
  for (const k of ["nickname", "bio", "occupation", "photo"]) {
    check(out[k] === undefined, `${k} temizlendi`);
  }
  for (const k of ["photos", "videos", "documents", "memories", "sources", "associations", "privateFields"]) {
    const v = out[k];
    check(Array.isArray(v) && v.length === 0, `${k} boşaltıldı`);
  }
  check(out.confidential === false, "confidential geri alınabiliyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
