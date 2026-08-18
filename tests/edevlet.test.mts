import { parseEdevletText } from "../lib/edevlet.ts";

let ok = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log(`✗ ${name}`); } };

// Gerçek e-Devlet "Alt-Üst Soy Belgesi" PDF metnini birebir taklit eden örnek.
const text = [
  "T.C.",
  "İÇİŞLERİ BAKANLIĞI",
  "ALT ÜST SOY BELGESİ",
  "Sıra C Yakınlık Derecesi Adı Soyadı Baba Adı Ana Adı Doğum Yeri ve",
  "Tarihi İl-İlçe-Mahalle/Köy Cilt-Hane-",
  "Birey Sıra No",
  "Medeni",
  "Hali Durumu",
  "31 E Babasının Babası HÜSEYİN BİLİM OSMAN HAVVA ORDU",
  "01/03/1927",
  "Ordu/",
  "Altınordu/",
  "KÖKENLİ MAHALLESİ",
  "66-68-16 Evli Ölüm",
  "24/02/1996",
  "32 K Babasının Annesi NURİYE BİLİM ABDULLAH HANİFE ORDU",
  "05/05/1927",
  "Ordu/",
  "Altınordu/",
  "KÖKENLİ MAHALLESİ",
  "66-68-35 Dul Ölüm",
  "16/09/2022",
  "35 E Babası ERDAL BİLİM HÜSEYİN NURİYE BİNGÖL",
  "04/07/1957",
  "Ordu/",
  "Altınordu/",
  "KÖKENLİ MAHALLESİ",
  "66-68-45 Evli Sağ",
  "-",
  "36 K Annesi KADRİYE BİLİM SALAHATTİN HACCE İSTANBUL",
  "13/08/1962",
  "Ordu/",
  "Altınordu/",
  "KÖKENLİ MAHALLESİ",
  "66-68-106 Evli Sağ",
  "-",
  "37 E Kendisi BUĞRA BİLİM ERDAL KADRİYE İSTANBUL",
  "06/04/1984",
  "Ordu/",
  "Altınordu/",
  "KÖKENLİ MAHALLESİ",
  "66-68-109 Evli Sağ",
  "-",
  "38 E Oğlu BUZUL BİLİM BUĞRA BUSE ŞİŞLİ",
  "01/02/2022",
  "Ordu/",
  "Altınordu/",
  "KÖKENLİ MAHALLESİ",
  "66-68-161 Bekâr Sağ",
  "-",
  "AÇIKLAMALAR",
  "1-) İŞBU BELGE ...",
].join("\n");

const people = parseEdevletText(text);
const by = (n: string) => people.find((p) => p.firstName === n)!;

check("6 kişi", people.length === 6);
check("Türkçe başlık düzeni (Buğra Bilim)", by("Buğra")?.lastName === "Bilim");
check("cinsiyet E→male, K→female", by("Buğra").gender === "male" && by("Kadriye").gender === "female");
check("doğum tarihi dd/mm/yyyy→ISO", by("Buğra").birthDate === "1984-04-06");
check("ölüm tarihi", by("Hüseyin").deathDate === "1996-02-24");
check("Sağ → ölüm yok", by("Erdal").deathDate === undefined);
check("doğum yeri", by("Kadriye").birthPlace === "İstanbul");

// İlişkiler (yakınlık zincirinden)
const parentsOf = (n: string) => by(n).parentIds.map((id) => people.find((p) => p.id === id)!.firstName).sort();
check("ego ebeveynleri Erdal+Kadriye", parentsOf("Buğra").join(",") === "Erdal,Kadriye");
check("Erdal ebeveynleri Hüseyin+Nuriye", parentsOf("Erdal").join(",") === "Hüseyin,Nuriye");
check("oğul Buzul → ebeveyn Buğra", parentsOf("Buzul").join(",") === "Buğra");

// Eş bağları (ortak çocuk)
check("Erdal-Kadriye eş", by("Erdal").spouseIds.includes(by("Kadriye").id) && by("Kadriye").spouseIds.includes(by("Erdal").id));
check("Hüseyin-Nuriye eş", by("Hüseyin").spouseIds.includes(by("Nuriye").id));
check("en derin ata ebeveynsiz", parentsOf("Hüseyin").length === 0);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
