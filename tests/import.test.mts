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
check("json: people sarmalı", jp2.length === 1 && jp2[0].firstName === "Ali");
/*
 * Dosyada TANIMLI OLMAYAN kimliğe bakan bağ atılıyor. Eskiden olduğu gibi
 * geçirilirse ağaca doğduğu anda `error` düzeyinde sarkan bir bağ giriyordu.
 */
check("json: dosya dışına sarkan ebeveyn bağı atıldı", jp2[0].parentIds.length === 0);

/* --- JSON İÇE AKTARIMDA KİMLİKLER YENİDEN ÜRETİLİR -------------------- */
/*
 * Bu, kimlik taşıyan TEK içe aktarıcıydı. Sonucu: kullanıcı uygulamanın kendi
 * JSON dışa aktarımını "ekle" kipinde geri yüklediğinde her kimlik ağaçta İKİ
 * KEZ oluyordu — `findRefIssues` onarılamaz `duplicateId` bildiriyor,
 * Postgres aynası çakışmayla düşüyor ve o hata yutuluyordu: kullanıcı
 * "içe aktarıldı" görüyordu.
 */
{
  const kaynak = JSON.stringify({
    people: [
      { id: "abc", firstName: "Dede", lastName: "Y", gender: "male" },
      { id: "def", firstName: "Torun", lastName: "Y", gender: "male", parentIds: ["abc"], formerSpouseIds: ["ghi"] },
      { id: "ghi", firstName: "Eski", lastName: "Y", gender: "female", spouseIds: [] },
    ],
  });
  const g = parseJson(kaynak);
  check("json: üç kişi geldi", g.length === 3);
  check("json: kaynak kimlikler KORUNMADI",
    !g.some((p) => ["abc", "def", "ghi"].includes(p.id)));
  check("json: kimlikler benzersiz", new Set(g.map((p) => p.id)).size === 3);
  const torun = g.find((p) => p.firstName === "Torun")!;
  const dede = g.find((p) => p.firstName === "Dede")!;
  const eski = g.find((p) => p.firstName === "Eski")!;
  check("json: dosya içi ebeveyn bağı YENİ kimlikle korundu", torun.parentIds[0] === dede.id);
  check("json: eski eş bağı da çevrildi", torun.formerSpouseIds?.[0] === eski.id);
  // İki kez içe aktarınca kimlikler yine çakışmıyor — asıl kural.
  const ikinci = parseJson(kaynak);
  const hepsi = [...g, ...ikinci];
  check("json: iki kez içe aktarımda kimlik çakışması yok",
    new Set(hepsi.map((p) => p.id)).size === hepsi.length);
}

// parseNonGedcom yönlendirme
check("parseNonGedcom csv", parseNonGedcom("csv", csv).length === 3);

// CSV dışa aktarım geri okunabilir olmalı (round-trip: bağlar korunur)
const round = parseCsv(exportCsv(cp));
const m2 = round.find((p) => p.firstName === "Mehmet")!;
check("csv round-trip: mehmet iki ebeveyn", m2.parentIds.length === 2);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
