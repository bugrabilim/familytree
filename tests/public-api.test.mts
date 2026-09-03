import type { Person } from "../types/family.ts";
import { PERSON_FIELDS } from "../lib/person-fields.ts";
import {
  PUBLIC_API_VERSION,
  PUBLIC_PERSON_FIELDS,
  toPublicPerson,
  toPublicTree,
} from "../lib/public-api.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const P = (extra: Partial<Person> = {}): Person => ({
  id: "x", firstName: "Ali", lastName: "Demir", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});

/* --- SÖZLEŞME DAR: yeni alanlar kendiliğinden dışarı çıkmamalı ---------- */
/*
 * Asıl mesele bu. `Person` ürünle birlikte büyüyor; maskelenmiş `Person`i
 * doğrudan döndürseydik ileride eklenen HER alan, kimse karar vermeden
 * genel API'nin çıktısına girerdi. Bu test yeni bir alanın sessizce
 * yayımlanmasını engelliyor: eklendiğinde KIRILIR ve birinin "bu gerçekten
 * genel mi olmalı" diye düşünmesi gerekir.
 */
{
  // Kayıt defterindeki HER alanı doldur, sonra ne çıktığına bak.
  const ornek: Record<string, unknown> = {
    text: "değer", array: ["a"], bool: true, obj: { lat: 41, lng: 29 },
  };
  const dolu: Record<string, unknown> = { ...P() };
  for (const spec of PERSON_FIELDS) dolu[String(spec.key)] = ornek[spec.merge];
  // Kimlik ve ilişki alanları geçerli kalsın.
  Object.assign(dolu, {
    id: "x", firstName: "Ali", lastName: "Demir", gender: "male",
    parentIds: ["p1"], spouseIds: ["s1"], formerSpouseIds: ["e1"],
  });

  const cikti = toPublicPerson(dolu as unknown as Person);
  const cikanAlanlar = Object.keys(cikti).sort();
  const izinli = [...PUBLIC_PERSON_FIELDS].sort();
  const fazla = cikanAlanlar.filter((k) => !izinli.includes(k));
  check(fazla.length === 0, `izin verilmeyen alan dışarı çıkmıyor (fazla: ${fazla.join(", ") || "—"})`);

  // Somut olarak hassas olanlar:
  const yasak = ["bio", "healthCondition", "congenitalCondition", "deathCause",
    "religion", "denomination", "ethnicity", "orientation", "photos", "photo",
    "memories", "sources", "events", "documents", "videos", "confidential",
    "privateFields", "publicVisibility", "associations", "burialPlace",
    "birthCoords", "burialCoords", "healthNote", "lineage"];
  for (const k of yasak) {
    check(!(k in cikti), `${k} genel API'de yok`);
  }
}

/* --- Beklenen alanlar geçiyor ------------------------------------------- */
{
  const p = P({
    code: "289001", nickname: "Topal", patronymic: "Şaban oğlu",
    birthDate: "1950-01-01", deathDate: "2010", birthPlace: "Rize",
    occupation: "marangoz", parentIds: ["a", "b"], spouseIds: ["s"],
    formerSpouseIds: ["e"],
  });
  const o = toPublicPerson(p);
  eq(o.id, "x", "kimlik");
  eq(o.code, "289001", "kod");
  eq(o.nickname, "Topal", "lakap");
  eq(o.patronymic, "Şaban oğlu", "baba adına göre anılma");
  eq(o.birthDate, "1950-01-01", "doğum tarihi");
  eq(o.deathDate, "2010", "ölüm tarihi");
  eq(o.birthPlace, "Rize", "doğum yeri");
  eq(o.occupation, "marangoz", "meslek");
  eq(o.parentIds, ["a", "b"], "ebeveynler");
  eq(o.spouseIds, ["s"], "eşler");
  eq(o.formerSpouseIds, ["e"], "eski eşler");
}
{
  // Boş/eksik alanlar yanıtı ŞİŞİRMEMELİ: `undefined` yerine alan hiç olmasın.
  const o = toPublicPerson(P({ nickname: "", birthDate: "   ", formerSpouseIds: [] }));
  check(!("nickname" in o), "boş lakap alanı hiç yazılmıyor");
  check(!("birthDate" in o), "boşluktan ibaret tarih yazılmıyor");
  check(!("formerSpouseIds" in o), "boş eski-eş dizisi yazılmıyor");
  eq(Object.keys(o).sort(), ["firstName", "gender", "id", "lastName", "parentIds", "spouseIds"],
    "asgari kayıtta yalnız zorunlu alanlar");
}
{
  // Diziler KOPYALANIYOR: yanıtı değiştiren biri kaynağı bozmasın.
  const kaynak = P({ parentIds: ["a"], spouseIds: ["s"] });
  const o = toPublicPerson(kaynak);
  o.parentIds.push("hile");
  eq(kaynak.parentIds, ["a"], "yanıtı değiştirmek kaynağı bozmuyor");
}

/* --- Ağaç zarfı ---------------------------------------------------------- */
{
  const t = toPublicTree([P({ id: "1" }), P({ id: "2" })], { name: "Demir", hideLiving: true });
  eq(t.version, PUBLIC_API_VERSION, "sürüm yanıtta");
  eq(t.name, "Demir", "ağaç adı");
  eq(t.count, 2, "sayı");
  eq(t.people.length, 2, "kişiler");
  /*
   * `hideLiving` yanıtta OLMALI: tüketici eksik veriyi yorumlayabilsin.
   * Olmasaydı bir istemci "bu kişinin doğum tarihi bilinmiyor" ile "gizli"
   * arasındaki farkı göremez ve yanlış sonuç çıkarırdı.
   */
  eq(t.hideLiving, true, "gizleme durumu bildiriliyor");

  const t2 = toPublicTree([], { hideLiving: false });
  check(!("name" in t2), "adsız ağaçta alan hiç yok");
  eq(t2.count, 0, "boş ağaç");
  eq(t2.people, [], "boş kişi listesi");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
