import { isLiving, isMasked, maskPerson, stripPrivateFields, viewAll, viewPerson }
  from "../apps/mobile/src/lib/privacy.ts";
import type { Person } from "../apps/mobile/src/lib/types.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * MOBİL GİZLİLİK KATMANI (denetim B7).
 *
 * ## Neden bu test kökteki paketten koşuyor
 *
 * `apps/mobile` kendi araç zincirinde derleniyor ve kök `tsconfig`/eslint
 * dışında (`"apps"` hariç tutulmuş). Yani mobil kodun hiçbir otomatik
 * denetimi YOK — mobilde gizlilik katmanının hiç olmadığının aylarca fark
 * edilmemesinin sebebi de bu.
 *
 * `src/lib/privacy.ts` SAF ve yalnız TİP içe aktarıyor (`--experimental-strip-types`
 * onu siliyor), dolayısıyla kökteki koşucudan içe aktarılabiliyor. Böylece
 * mobil kuralın en kritik parçası kök testlerinde koşuyor ve gerileme
 * sessizce geçemiyor.
 */

const k = (o: Partial<Person> = {}): Person => ({
  id: "k1", firstName: "Ayşe", lastName: "Yılmaz", gender: "female",
  parentIds: [], spouseIds: [], ...o,
});

/* ── Kim maskeleniyor ─────────────────────────────────────────────────────── */
check(isLiving(k()), "ölüm tarihi yoksa yaşıyor");
check(!isLiving(k({ deathDate: "2020-01-01" })), "ölüm tarihi varsa yaşamıyor");

/*
 * `confidential` KOŞULSUZ. "Bu kaydı kimse görmesin" demek ve bir görüntü
 * tercihine bağlanamaz — tercih kapalıyken de maskeli.
 */
check(isMasked(k({ confidential: true }), false), "gizli kayıt tercihten BAĞIMSIZ maskeli");
check(isMasked(k({ confidential: true, deathDate: "1990-01-01" }), false),
  "vefat etmiş gizli kayıt da maskeli");
check(!isMasked(k(), false), "tercih kapalıyken yaşayan maskeli değil");
check(isMasked(k(), true), "tercih açıkken yaşayan maskeli");
check(!isMasked(k({ deathDate: "2020-01-01" }), true), "tercih açık olsa da vefat eden maskeli değil");

/* ── Maskeli kopya: BEYAZ LİSTE ──────────────────────────────────────────── */
{
  const ham = k({
    birthDate: "1950-03-02", birthPlace: "Kayseri", photo: "http://x/y.jpg",
    bio: "uzun hikâye", orientation: "x", religion: "y", ethnicity: "z",
    occupation: "öğretmen", education: "lise", nationality: "n", language: "l",
    burialPlace: "b", confidential: true,
  });
  const m = maskPerson(ham);
  /*
   * Beyaz liste olması bilinçli: ileride eklenecek hassas bir alan varsayılan
   * olarak GİZLİ kalır. Kara liste olsaydı her yeni alan sessizce açıkta
   * olurdu ve kimse fark etmezdi — mobilde tam olarak bu oldu.
   */
  for (const alan of ["birthDate", "birthPlace", "photo", "bio", "orientation",
                      "religion", "ethnicity", "occupation", "education",
                      "nationality", "language", "burialPlace"] as const) {
    check(!(alan in (m as unknown as Record<string, unknown>)), `maskeli kopyada ${alan} YOK`);
  }
  check(m.firstName === "Ayşe" && m.lastName === "Yılmaz", "ad korunuyor");
  check(m.confidential === true, "gizli bayrağı korunuyor (isMasked maskeli kopyada da doğru)");
}
{
  /* Ölüm tarihi korunuyor: vefat rozeti ve "yaşıyor mu" hesabı için gerekli. */
  const m = maskPerson(k({ deathDate: "2020-05-05", confidential: true }));
  check(m.deathDate === "2020-05-05", "ölüm tarihi maskeli kopyada duruyor");
  check(isMasked(m, false), "maskeli kopya yeniden sorulduğunda da maskeli");
}
{
  /*
   * İLİŞKİ DİZİLERİ korunuyor ama KOPYALANIYOR. Sığ taşımada maskeli kopya
   * ile ham kayıt aynı diziyi paylaşırdı: kopyaya `push` yapan HAM veriyi
   * bozardı ve "görüntü katmanı veriyi değiştirmez" sözü tutulmazdı.
   */
  const ham = k({ parentIds: ["a"], spouseIds: ["b"], formerSpouseIds: ["c"] });
  const m = maskPerson(ham);
  check(m.parentIds.join() === "a" && m.spouseIds.join() === "b", "ağaç yapısı korunuyor");
  m.parentIds.push("YENI");
  m.formerSpouseIds!.push("YENI");
  check(ham.parentIds.length === 1, "ham kaydın ebeveyn dizisi BOZULMUYOR");
  check(ham.formerSpouseIds!.length === 1, "ham kaydın eski eş dizisi BOZULMUYOR");
}

/* ── Alan-bazlı gizlilik ─────────────────────────────────────────────────── */
{
  /*
   * Bu, mobilde hiç uygulanmayan kuraldı ve en ağırı: kullanıcı bir alanı
   * GİZLİ işaretlemiş, uygulama gizlemiş gibi davranıyor ve telefonda
   * gösteriyordu. Yalnız bir yüzeyde çalışan gizlilik, hiç çalışmamasından
   * beter — kullanıcı korunduğunu sanıyor.
   */
  const ham = k({
    bio: "hikâye", photo: "p.jpg", orientation: "x", religion: "din",
    ethnicity: "köken", nationality: "uyruk", language: "dil",
    birthPlace: "Kayseri", burialPlace: "Develi", birthDate: "1950-01-01",
    privateFields: ["story", "photo", "orientation", "belief", "origin", "birthPlace", "burialPlace"],
  });
  const v = stripPrivateFields(ham) as unknown as Record<string, unknown>;
  for (const alan of ["bio", "photo", "orientation", "religion", "ethnicity",
                      "nationality", "language", "birthPlace", "burialPlace"]) {
    check(!(alan in v), `gizli grup alanı çıkarılıyor: ${alan}`);
  }
  /* Gizli olmayan alan DURUYOR: süzgeç fazla geniş uygulanmamalı. */
  check(v.birthDate === "1950-01-01", "gizli olmayan alan korunuyor");
  /* Ham kayıt değişmiyor. */
  check(ham.bio === "hikâye", "ham kayıt bozulmuyor");
}
{
  const p = k();
  check(stripPrivateFields(p) === p, "grup yoksa AYNI nesne dönüyor");
  check(stripPrivateFields(k({ privateFields: [] })) !== undefined, "boş grup listesi çökmüyor");
  check(stripPrivateFields(k({ privateFields: ["bilinmeyen-grup"], bio: "x" })).bio === "x",
    "tanınmayan grup hiçbir alanı silmiyor");
}

/* ── Tek kapı ─────────────────────────────────────────────────────────────── */
{
  const gizli = k({ id: "g", confidential: true, bio: "sır" });
  const alanGizli = k({ id: "a", bio: "sır", privateFields: ["story"] });
  const acik = k({ id: "b", bio: "açık" });
  const liste = viewAll([gizli, alanGizli, acik], false);
  check(liste[0].bio === undefined, "gizli kayıt maskeleniyor");
  check(liste[1].bio === undefined, "alan-bazlı gizli alan çıkarılıyor");
  check(liste[2].bio === "açık", "gizlenmemiş kayıt olduğu gibi");
  check(liste.length === 3, "kimse listeden DÜŞMÜYOR (ağaç bozulmasın)");
  /* Tercih açıkken yaşayan herkes maskeli. */
  check(viewPerson(acik, true).bio === undefined, "tercih açıkken yaşayan maskeli");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
