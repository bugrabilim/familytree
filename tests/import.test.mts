import { detectFormat, parseNonGedcom, parseCsv, parseJson, exportCsv } from "../lib/import.ts";

let ok = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
};

// Biçim algılama
check("detect .ged", detectFormat("a.ged", "0 HEAD") === "gedcom");
check("detect .csv", detectFormat("a.csv", "ad,soyad") === "csv");
check("detect .json", detectFormat("a.json", "[]") === "json");
check("detect gedcom by content", detectFormat("x.txt", "0 HEAD\n1 SOUR X") === "gedcom");
check("detect json by content", detectFormat("x.txt", '  {"people":[]}') === "json");
check("detect unknown", detectFormat("x.dat", "lorem ipsum") === null);

// CSV — TR başlıklar + bağlar (baba/anne/eş id ile)
const csv = [
  "id,ad,soyad,cinsiyet,dogum,baba,anne,es",
  "1,Ahmet,Yılmaz,erkek,1950,,,2",
  "2,Ayşe,Yılmaz,kadın,01.02.1955,,,1",
  "3,Mehmet,Yılmaz,erkek,10032000,1,2,",
].join("\n");
const cp = parseCsv(csv);
check("csv: 3 kişi", cp.length === 3);
const mehmet = cp.find((p) => p.firstName === "Mehmet")!;
const ahmet = cp.find((p) => p.firstName === "Ahmet")!;
const ayse = cp.find((p) => p.firstName === "Ayşe")!;
check("csv: mehmet iki ebeveyn", mehmet.parentIds.length === 2);
check("csv: mehmet ebeveynleri doğru", mehmet.parentIds.includes(ahmet.id) && mehmet.parentIds.includes(ayse.id));
check("csv: eş simetrik", ahmet.spouseIds.includes(ayse.id) && ayse.spouseIds.includes(ahmet.id));
check("csv: tarih normalize (01.02.1955→1955-02-01)", ayse.birthDate === "1955-02-01");
check("csv: kompakt tarih (10032000→2000-03-10)", mehmet.birthDate === "2000-03-10");
check("csv: cinsiyet", ahmet.gender === "male" && ayse.gender === "female");

// JSON — düz dizi ve {people:[]}
const jp = parseJson('[{"firstName":"Zeynep","lastName":"Kaya","gender":"female"}]');
check("json: düz dizi", jp.length === 1 && jp[0].firstName === "Zeynep");
const jp2 = parseJson('{"people":[{"firstName":"Ali","gender":"male","parentIds":["x"],"spouseIds":[]}]}');
check("json: people sarmalı", jp2.length === 1 && jp2[0].parentIds[0] === "x");

// parseNonGedcom yönlendirme
check("parseNonGedcom csv", parseNonGedcom("csv", csv).length === 3);

// CSV dışa aktarım geri okunabilir olmalı (round-trip: bağlar korunur)
const round = parseCsv(exportCsv(cp));
const m2 = round.find((p) => p.firstName === "Mehmet")!;
check("csv round-trip: mehmet iki ebeveyn", m2.parentIds.length === 2);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
