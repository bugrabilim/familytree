import { findIssues } from "../lib/consistency.ts";
import type { Person } from "../types/family.ts";

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
  firstName: "X",
  lastName: "Y",
  gender: "male",
  parentIds: [],
  spouseIds: [],
  ...o,
});

const has = (people: Person[], id: string, kind: string) =>
  findIssues(people).some((i) => i.personId === id && i.kind === kind);

// Ölüm doğumdan önce
check("deathBeforeBirth", has([P({ id: "a", birthDate: "2000", deathDate: "1990" })], "a", "deathBeforeBirth"));
// Temiz kayıt uyarı vermez
check("temiz kayıt", findIssues([P({ id: "a", birthDate: "1950", deathDate: "2000" })]).length === 0);
// Gelecekte doğum
check("bornInFuture", has([P({ id: "a", birthDate: "3000" })], "a", "bornInFuture"));
// Ebeveyn çocuktan küçük
const fam = [P({ id: "c", birthDate: "1980", parentIds: ["p"] }), P({ id: "p", birthDate: "1990" })];
check("parentYoungerThanChild", has(fam, "c", "parentYoungerThanChild"));
// Çok genç ebeveyn
const fam2 = [P({ id: "c", birthDate: "2010", parentIds: ["p"] }), P({ id: "p", birthDate: "2000" })];
check("tooYoungParent", has(fam2, "c", "tooYoungParent"));
// Ebeveyn ölümünden sonra doğum (2 yıl sonra)
const fam3 = [P({ id: "c", birthDate: "2005", parentIds: ["p"] }), P({ id: "p", birthDate: "1960", deathDate: "2002" })];
check("bornAfterParentDeath", has(fam3, "c", "bornAfterParentDeath"));
// Kendine eş / kendine ebeveyn
check("selfSpouse", has([P({ id: "a", spouseIds: ["a"] })], "a", "selfSpouse"));
check("selfParent", has([P({ id: "a", parentIds: ["a"] })], "a", "selfParent"));
// İmkânsız yaş
check("implausibleAge", has([P({ id: "a", birthDate: "1800", deathDate: "1950" })], "a", "implausibleAge"));
// Kısmi tarihte yanlış-pozitif yok (yalnız yıl, aynı yıl)
check("aynı yıl belirsizlik", findIssues([P({ id: "a", birthDate: "1990", deathDate: "1990" })]).length === 0);

// Cinsiyet seçilmemiş kayıt uyarı verir; "other" (bilinçli seçim) VERMEZ.
check("missingGender: unknown → uyarı", has([P({ id: "a", gender: "unknown" })], "a", "missingGender"));
check("missingGender: other → uyarı yok", !has([P({ id: "a", gender: "other" })], "a", "missingGender"));
check("missingGender: male → uyarı yok", !has([P({ id: "a" })], "a", "missingGender"));

/* --- BİYOLOJİ KURALLARI YALNIZ KAN BAĞINDA ---------------------------- */
/*
 * Üç kural da biyolojiden geliyor. Evlat edinen/üvey/koruyucu bağa
 * uygulanınca DOĞRU veri hata diye işaretleniyordu — üvey baba çocuğundan
 * küçük olabilir, evlat edinme bağı çocuk doğduktan yıllar sonra kurulmuş
 * olabilir. Susturulamayan yanlış uyarı, listenin tamamının görmezden
 * gelinmesinin en hızlı yolu.
 */
for (const tur of ["adoptive", "step", "foster"] as const) {
  const uvey = [
    P({ id: "c", birthDate: "1990", parentIds: ["e"], parentLinks: { e: { kind: tur } } }),
    P({ id: "e", birthDate: "2000", deathDate: "1980" }),
  ];
  check(`${tur}: küçük ebeveyn hata değil`, !has(uvey, "c", "parentYoungerThanChild"));
  check(`${tur}: ölümden sonra doğum uyarısı yok`, !has(uvey, "c", "bornAfterParentDeath"));
  check(`${tur}: genç ebeveyn uyarısı yok`, !has(uvey, "c", "tooYoungParent"));
}
{
  // Kan bağında (açık ya da varsayılan) kurallar AYNEN duruyor.
  const kan = [
    P({ id: "c", birthDate: "1990", parentIds: ["e"] }),
    P({ id: "e", birthDate: "2000" }),
  ];
  check("kan bağı: küçük ebeveyn hâlâ hata", has(kan, "c", "parentYoungerThanChild"));
  const acik = [
    P({ id: "c", birthDate: "1990", parentIds: ["e"], parentLinks: { e: { kind: "biological" } } }),
    P({ id: "e", birthDate: "2000" }),
  ];
  check("açıkça biological: kural duruyor", has(acik, "c", "parentYoungerThanChild"));
}

/* --- Ölümden sonra doğum: +1 yıl payı BABANIN --------------------------- */
/*
 * Tolerans gebelikten geliyor: baba çocuğun doğumundan aylar önce ölmüş
 * olabilir. Aynı payı anneye vermek o gerekçeyi yok saymak ve gerçek bir veri
 * hatasını (çoğu zaman karışmış iki kişi) sessizce geçirmekti.
 */
{
  const babali = [
    P({ id: "c", birthDate: "1901", parentIds: ["b"] }),
    P({ id: "b", gender: "male", birthDate: "1870", deathDate: "1900" }),
  ];
  check("baba: ölümün ertesi yılı doğum hoş görülüyor", !has(babali, "c", "bornAfterParentDeath"));
  const anneli = [
    P({ id: "c", birthDate: "1901", parentIds: ["a"] }),
    P({ id: "a", gender: "female", birthDate: "1870", deathDate: "1900" }),
  ];
  check("anne: ölümden sonraki yıl doğum UYARI", has(anneli, "c", "bornAfterParentDeath"));
  const ayniYil = [
    P({ id: "c", birthDate: "1900", parentIds: ["a"] }),
    P({ id: "a", gender: "female", birthDate: "1870", deathDate: "1900" }),
  ];
  check("anne: aynı yıl doğum uyarı değil", !has(ayniYil, "c", "bornAfterParentDeath"));
  const uzakBaba = [
    P({ id: "c", birthDate: "1905", parentIds: ["b"] }),
    P({ id: "b", gender: "male", birthDate: "1870", deathDate: "1900" }),
  ];
  check("baba: beş yıl sonrası yine uyarı", has(uzakBaba, "c", "bornAfterParentDeath"));
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
