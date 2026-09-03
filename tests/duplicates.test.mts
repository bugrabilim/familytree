import { findDuplicatePairs, mergePeople, applyBulkMerge } from "../lib/duplicates.ts";
import type { Person } from "../types/family.ts";
import { PERSON_FIELDS } from "../lib/person-fields.ts";

let ok = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
};

const P = (o: Partial<Person> & { id: string }): Person => ({
  firstName: "Ali",
  lastName: "Veli",
  gender: "male",
  parentIds: [],
  spouseIds: [],
  ...o,
});

// Aynı ad + aynı yıl → kopya
let pairs = findDuplicatePairs([
  P({ id: "a", birthDate: "1950" }),
  P({ id: "b", birthDate: "1950" }),
]);
check("aynı ad+yıl kopya", pairs.length === 1 && pairs[0].reason === "yearMatch");

// Aynı ad, farklı yıl (>1) → kopya değil
check("farklı yıl kopya değil", findDuplicatePairs([P({ id: "a", birthDate: "1950" }), P({ id: "b", birthDate: "1980" })]).length === 0);

// Aynı ad + ortak ebeveyn (yıl yok) → kopya
pairs = findDuplicatePairs([
  P({ id: "a", parentIds: ["m"] }),
  P({ id: "b", parentIds: ["m"] }),
  P({ id: "m", firstName: "Anne", lastName: "V" }),
]);
check("ortak ebeveyn kopya", pairs.some((x) => x.reason === "sharedParent"));

// Eş olan aynı adlılar → kopya DEĞİL (doğrudan bağlı)
check("eşler kopya değil", findDuplicatePairs([P({ id: "a", spouseIds: ["b"] }), P({ id: "b", spouseIds: ["a"] })]).length === 0);

// Farklı ad → kopya değil
check("farklı ad", findDuplicatePairs([P({ id: "a" }), P({ id: "b", firstName: "Ayşe", gender: "female" })]).length === 0);

// 3C: soyadsız "Buğra" ile soyadlı "Buğra Bilim", aynı yıl → kopya önerisi.
pairs = findDuplicatePairs([
  P({ id: "x", firstName: "Buğra", lastName: "", birthDate: "1984" }),
  P({ id: "y", firstName: "Buğra", lastName: "Bilim", birthDate: "1984" }),
]);
check("soyadsız+soyadlı aynı ad/yıl kopya", pairs.length === 1 && pairs[0].reason === "yearMatch");

// Aynı ad, İKİ farklı soyad, yalnız yıl (yapısal bağ yok) → kopya DEĞİL (yanlış-pozitif koruması).
check(
  "farklı soyad + yalnız yıl kopya değil",
  findDuplicatePairs([
    P({ id: "a", firstName: "Ahmet", lastName: "Yılmaz", birthDate: "1950" }),
    P({ id: "b", firstName: "Ahmet", lastName: "Kaya", birthDate: "1950" }),
  ]).length === 0
);

// Birleştirme: referanslar keep'e taşınır, drop silinir
const people = [
  P({ id: "keep", birthDate: "1950", photos: ["u1"] }),
  P({ id: "drop", birthPlace: "İzmir", photos: ["u2"], spouseIds: ["s"] }),
  P({ id: "child", parentIds: ["drop"] }),
  P({ id: "s", firstName: "Eş", gender: "female", spouseIds: ["drop"] }),
];
const merged = mergePeople(people, "keep", "drop");
check("drop silindi", !merged.some((p) => p.id === "drop"));
check("keep sayısı", merged.length === 3);
const child = merged.find((p) => p.id === "child")!;
check("çocuğun ebeveyni keep'e taşındı", child.parentIds.includes("keep") && !child.parentIds.includes("drop"));
const spouse = merged.find((p) => p.id === "s")!;
check("eşin bağı keep'e taşındı", spouse.spouseIds.includes("keep"));
const keep = merged.find((p) => p.id === "keep")!;
check("keep boş alanı drop'tan doldurdu", keep.birthPlace === "İzmir");
check("foto birleşti", (keep.photos ?? []).length === 2);
check("keep eş bağı aldı", (keep.spouseIds ?? []).includes("s"));
check("kendine-referans yok", !keep.parentIds.includes("keep") && !(keep.spouseIds ?? []).includes("keep"));

// Çakışan tek-değerli alanlar biyografiye not olarak korunur (kaybolmaz)
const conflPeople = [
  P({ id: "k", religion: "İslam", language: "Türkçe", bio: "Notlar" }),
  P({ id: "d", religion: "Hristiyan", language: "Kürtçe", ethnicity: "Zaza" }),
];
const conflMerged = mergePeople(conflPeople, "k", "d");
const kk = conflMerged.find((p) => p.id === "k")!;
check("çakışan din bio'ya not düştü", (kk.bio ?? "").includes("din: Hristiyan"));
check("çakışan dil bio'ya not düştü", (kk.bio ?? "").includes("dil: Kürtçe"));
check("keep'te boş alan drop'tan doldu (etnik)", kk.ethnicity === "Zaza");
check("mevcut bio korundu", (kk.bio ?? "").startsWith("Notlar"));

// Toplu birleştirme — birden çok çift, daha eksiksiz kayıt korunur, zincir
const bulkPeople = [
  P({ id: "a1", birthDate: "1950", birthPlace: "Ordu", photos: ["u"] }), // daha dolu
  P({ id: "a2", birthDate: "1950" }),
  P({ id: "b1", firstName: "Ayşe", gender: "female", birthDate: "1970", occupation: "öğretmen" }),
  P({ id: "b2", firstName: "Ayşe", gender: "female", birthDate: "1970" }),
];
const bulk = applyBulkMerge(bulkPeople, [
  { aId: "a1", bId: "a2" },
  { aId: "b1", bId: "b2" },
]);
check("iki çift birleşti", bulk.merged === 2);
check("dört kayıt ikiye indi", bulk.people.length === 2);
check("daha dolu kayıt (a1) korundu", bulk.people.some((p) => p.id === "a1") && !bulk.people.some((p) => p.id === "a2"));
check("daha dolu kayıt (b1) korundu", bulk.people.some((p) => p.id === "b1") && !bulk.people.some((p) => p.id === "b2"));

// Zincir: a==b==c → tüketilmiş kimlik içeren çift atlanır (çökme yok)
const chain = [
  P({ id: "c1", birthDate: "1900" }),
  P({ id: "c2", birthDate: "1900" }),
  P({ id: "c3", birthDate: "1900" }),
];
const chained = applyBulkMerge(chain, [
  { aId: "c1", bId: "c2" },
  { aId: "c2", bId: "c3" }, // c2 tüketildi → atlanır
]);
check("zincirde tüketilen çift atlanır", chained.merged === 1 && chained.people.length === 2);

/* --- KAYIPSIZLIK: kayıt defterindeki HER alan birleştirmeden sağ çıkmalı -- */
/*
 * Burada eskiden elle yazılmış bir alan listesi vardı ve sonradan eklenen
 * alanlar o listeye hiç girmedi: `lineage`, `burialPlace`,
 * `officialBirthDate`, `videos`, `documents`, `healthNote`, `associations`
 * ve `birthCoords` bırakılan kayıtla birlikte siliniyordu — fonksiyonun
 * kendi başlığı "kayıpsız" derken.
 *
 * Bu test tek tek alan saymıyor; KAYIT DEFTERİNİ dolaşıyor. Yeni bir alan
 * eklendiğinde kendiliğinden kapsıyor, böylece aynı sapma tekrarlanamıyor.
 */
{
  const ornek: Record<string, unknown> = {
    text: "değer", array: ["a"], bool: true,
    obj: { lat: 41, lng: 29 },
  };
  const bosKeep = {
    id: "k", firstName: "Ali", lastName: "Demir", gender: "male",
    parentIds: [], spouseIds: [],
  } as unknown as Person;

  const doluDrop: Record<string, unknown> = {
    id: "d", firstName: "Ali", lastName: "Demir", gender: "male",
    parentIds: [], spouseIds: [],
  };
  for (const spec of PERSON_FIELDS) {
    if (["firstName", "lastName", "gender"].includes(String(spec.key))) continue;
    doluDrop[String(spec.key)] = ornek[spec.merge];
  }

  const out = mergePeople([bosKeep, doluDrop as unknown as Person], "k", "d")
    .find((p) => p.id === "k") as unknown as Record<string, unknown>;

  const kayip = PERSON_FIELDS
    .map((f) => String(f.key))
    .filter((k) => !["firstName", "lastName", "gender"].includes(k))
    .filter((k) => {
      const v = out[k];
      if (v === undefined) return true;
      if (Array.isArray(v)) return v.length === 0;
      return false;
    });
  check(`birleştirmede kaybolan alan yok (kayıp: ${kayip.join(", ") || "—"})`, kayip.length === 0);
}
{
  // Mantıksal alanda GÜVENLİ taraf kazanır: biri "gizli kayıt" ise birleşim de.
  const a = { id: "k", firstName: "A", lastName: "B", gender: "male", parentIds: [], spouseIds: [] } as unknown as Person;
  const b = { id: "d", firstName: "A", lastName: "B", gender: "male", parentIds: [], spouseIds: [], confidential: true } as unknown as Person;
  const out = mergePeople([a, b], "k", "d").find((p) => p.id === "k")!;
  check("gizlilik işareti birleştirmede kalkmıyor", out.confidential === true);
}

/* --- Birleştirmede `parentLinks` anahtarları da çevrilir ----------------- */
/*
 * `parentLinks` ANAHTARLARI ebeveyn kimliğidir; `parentIds` gibi çevrilmeleri
 * gerekir. Eskiden iki nesne üst üste bindiriliyordu, yani bırakılan kimliğe
 * bakan anahtar olduğu gibi kalıyor ve kendine bağ temizlenmiyordu.
 *
 * Bedeli sarkan bir kimlikten ağır: `parentLinkOf` bağı GÜNCEL ebeveyn
 * kimliğiyle arıyor, bulamayınca evlatlık/üvey/koruyucu bağ sessizce KAN
 * BAĞINA dönüyor — görünmeyen bir veri bozulması.
 */
{
  const kisi = (o: Partial<Person> & { id: string }): Person =>
    ({ firstName: "A", lastName: "B", gender: "unknown", parentIds: [], spouseIds: [], ...o }) as Person;

  // (a) Kişi kendi ebeveyniyle birleşiyor → kendine bağ kalmamalı.
  {
    const out = mergePeople(
      [kisi({ id: "dad" }), kisi({ id: "child", parentIds: ["dad"], parentLinks: { dad: { kind: "step" } } })],
      "child", "dad");
    const c = out.find((x) => x.id === "child")!;
    check("kendi ebeveyniyle birleşince kendine parentLinks kalmıyor",
      !c.parentLinks || !("child" in c.parentLinks) && !("dad" in c.parentLinks));
    check("kendi ebeveyniyle birleşince parentIds da temiz", !c.parentIds.includes("child") && !c.parentIds.includes("dad"));
  }

  // (b) Bırakılan kimliğe bakan bağ TUTULANA çevrilmeli, türü korunarak.
  {
    const out = mergePeople(
      [kisi({ id: "k" }), kisi({ id: "d" }),
       kisi({ id: "c", parentIds: ["d"], parentLinks: { d: { kind: "foster" } } })],
      "k", "d");
    const c = out.find((x) => x.id === "c")!;
    check("bırakılan ebeveyn kimliği tutulana çevrildi", c.parentIds.includes("k"));
    check("bağın TÜRÜ korundu (koruyucu aile kan bağına dönmedi)", c.parentLinks?.k?.kind === "foster");
  }

  // (c) Alakasız bir ebeveyne bakan bağ olduğu gibi kalmalı.
  {
    const out = mergePeople(
      [kisi({ id: "gp" }),
       kisi({ id: "a", parentIds: ["gp"], parentLinks: { gp: { kind: "adoptive" } } }),
       kisi({ id: "b", parentIds: ["gp"] })],
      "a", "b");
    const a = out.find((x) => x.id === "a")!;
    check("ilgisiz ebeveyn bağı bozulmadan duruyor", a.parentLinks?.gp?.kind === "adoptive");
  }
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
