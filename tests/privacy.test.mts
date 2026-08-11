import { isLiving, isMasked, maskPerson } from "../lib/privacy.ts";
import type { Person } from "../types/family.ts";

let ok = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
}

const yasayan: Person = {
  id: "p1",
  code: "289001",
  firstName: "Ayşe",
  lastName: "Yılmaz",
  nickname: "Küçük",
  patronymic: "Veli kızı",
  gender: "female",
  birthDate: "1990-05-01",
  birthPlace: "İzmir",
  photo: "https://example/x.jpg",
  bio: "Gizli hikâye",
  religion: "X",
  denomination: "Y",
  ethnicity: "Z",
  nationality: "TR",
  orientation: "Gizli",
  congenitalCondition: "A",
  healthCondition: "B",
  healthNote: "C",
  language: "Türkçe",
  parentIds: ["a", "b"],
  parentLinks: { a: { kind: "adoptive", note: "hassas not" } },
  spouseIds: ["s1"],
  formerSpouseIds: ["s0"],
};

const vefat: Person = {
  id: "p2",
  firstName: "Mehmet",
  lastName: "Yılmaz",
  gender: "male",
  birthDate: "1920-01-01",
  deathDate: "1998-03-03",
  deathCause: "Kalp",
  parentIds: [],
  spouseIds: [],
};

// isLiving
check("yaşayan (ölüm yok) → living", isLiving(yasayan) === true);
check("vefat eden → not living", isLiving(vefat) === false);

// maskPerson: hassas alanlar boşaltılır
const m = maskPerson(yasayan);
check("maske: birthDate gizli", m.birthDate === undefined);
check("maske: birthPlace gizli", m.birthPlace === undefined);
check("maske: photo gizli", m.photo === undefined);
check("maske: bio gizli", m.bio === undefined);
check("maske: din gizli", m.religion === undefined);
check("maske: mezhep gizli", m.denomination === undefined);
check("maske: etnik köken gizli", m.ethnicity === undefined);
check("maske: uyruk gizli", m.nationality === undefined);
check("maske: yönelim gizli", m.orientation === undefined);
check("maske: doğuştan durum gizli", m.congenitalCondition === undefined);
check("maske: hastalık gizli", m.healthCondition === undefined);
check("maske: eski sağlık notu gizli", m.healthNote === undefined);
check("maske: dil gizli", m.language === undefined);
check("maske: deathCause gizli", m.deathCause === undefined);

// maskPerson: kimlik/yapı korunur
check("maske: id korunur", m.id === "p1");
check("maske: code korunur", m.code === "289001");
check("maske: ad korunur", m.firstName === "Ayşe");
check("maske: soyad korunur", m.lastName === "Yılmaz");
check("maske: lakap korunur", m.nickname === "Küçük");
check("maske: baba adı korunur", m.patronymic === "Veli kızı");
check("maske: cinsiyet korunur", m.gender === "female");
check("maske: parentIds korunur", m.parentIds.length === 2);
check("maske: spouseIds korunur", m.spouseIds[0] === "s1");
check("maske: formerSpouseIds korunur", (m.formerSpouseIds ?? [])[0] === "s0");

// maskPerson: ölüm tarihi korunur (vefat rozeti için)
const md = maskPerson(vefat);
check("maske: deathDate korunur", md.deathDate === "1998-03-03");
check("maske: vefat edende de living hesabı doğru", isLiving(md) === false);

// maskPerson: orijinali değiştirmez (kopya)
check("maske: orijinal mutasyona uğramaz", yasayan.birthPlace === "İzmir");

// isMasked
check("isMasked: gizleme kapalı, yaşayan → false", isMasked(yasayan, false) === false);
check("isMasked: gizleme açık, yaşayan → true", isMasked(yasayan, true) === true);
check("isMasked: gizleme açık, vefat → false", isMasked(vefat, true) === false);

const gizli: Person = { ...vefat, id: "p3", confidential: true };
check("isMasked: confidential her zaman gizli (kapalıyken bile)", isMasked(gizli, false) === true);
check("isMasked: confidential maskede korunur", maskPerson(gizli).confidential === true);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
