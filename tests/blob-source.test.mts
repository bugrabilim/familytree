import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * KAPI: "Blob ne diyor" sorusunu soran kod `getFamilyData` KULLANAMAZ.
 *
 * `getFamilyData` Faz 2d'den beri ÖNCE Postgres'e bakıyor; ağaç orada varsa
 * Blob'a hiç inmiyor. Uygulamanın okuma yolu için doğru, ama adı hâlâ
 * `lib/blob.ts` içinde durduğu için "Blob okuyorum" gibi görünüyor. İki iş bu
 * yanılgıya düştü ve ikisi de sessizce çalıştı:
 *
 * · GÖÇ — ağaç satırını açtıktan SONRA `getFamilyData` ile okuyordu, yani
 *   Postgres'ten boş liste alıp `dbReplacePeople(treeId, [])` çağırıyordu:
 *   sıfır kişi taşıyor, üstelik `0 === 0` olduğu için "başarılı" diyordu.
 * · KAYMA DENETİMİ — iki kaynağı karşılaştırdığını sanırken Postgres'i
 *   Postgres'le karşılaştırıyordu; her ağaç için "ayrışma yok" derdi.
 *
 * İkisi de yalnız kod okunarak görülebilirdi, çünkü ikisi de "başarılı"
 * görünüyordu. Bu test o okumayı otomatikleştiriyor.
 */

const blob = read("../lib/blob.ts");
const drift = read("../app/api/admin/drift/route.ts");
const migrate = read("../app/api/admin/migrate/route.ts");

/* --- Önce dayanak: `getFamilyData` GERÇEKTEN Postgres öncelikli mi? ------ */
/*
 * Kural bu olguya dayanıyor. Okuma yolu bir gün Blob önceliğine dönerse bu
 * denetim gereksizleşir ve testin bunu fark etmesi gerekir — sessizce doğru
 * kalan bir kural, yanlış bir güvence kadar kötüdür.
 */
{
  const i = blob.indexOf("export async function getFamilyData");
  const govde = blob.slice(i, blob.indexOf("\n}", i));
  check(i > 0, "getFamilyData bulundu");
  check(govde.includes("dbGetFamilyData"), "getFamilyData Postgres'e bakıyor (kuralın dayanağı)");
  check(govde.indexOf("dbGetFamilyData") < govde.indexOf("readFromBlob"),
    "Postgres ÖNCE deneniyor — bu yüzden 'Blob okudum' sanılamaz");
}

/* --- Salt-Blob okuyucusu var ve dışa açık ------------------------------- */
check(blob.includes("export async function readFamilyFromBlob"), "salt-Blob okuyucusu dışa aktarılmış");
{
  const i = blob.indexOf("export async function readFamilyFromBlob");
  const govde = blob.slice(i, blob.indexOf("\n}", i));
  check(!govde.includes("dbGetFamilyData"), "salt-Blob okuyucusu Postgres'e HİÇ bakmıyor");
}

/* --- İki iş de salt-Blob okuyor ----------------------------------------- */
for (const [ad, kaynak] of [["kayma denetimi", drift], ["göç", migrate]] as const) {
  check(kaynak.includes("readFamilyFromBlob("), `${ad} salt-Blob okuyucusunu çağırıyor`);
  check(!/\bgetFamilyData\s*\(/.test(kaynak), `${ad} getFamilyData ÇAĞIRMIYOR`);
}

/* --- Göç: önce oku, sonra ağaç satırını aç ------------------------------ */
/*
 * Salt-Blob okuması tuzağı zaten kapatıyor, ama sıra da doğrusuna çevrildi:
 * okuma yolu gelecekte yine değişse bile `dbUpsertTree`in okumayı etkilemesi
 * mümkün olmasın.
 */
{
  const i = migrate.indexOf("export async function POST");
  const govde = migrate.slice(i);
  const oku = govde.indexOf("readFamilyFromBlob(");
  const ac = govde.indexOf("dbUpsertTree(");
  check(oku > 0 && ac > 0, "POST'ta iki çağrı da var");
  check(oku < ac, "göç ÖNCE okuyup SONRA ağaç satırını açıyor");
}

/* --- Onarım: kaynak okunamadıysa SİLME ---------------------------------- */
/*
 * Onarım Blob'u kaynak alıyor ve Blob'da olmayan her kaydı siliyor. Kaynak
 * okunamadığında bu "Postgres'i boşalt" demek olurdu — bir Blob kesintisi
 * onarım düğmesini veri silme düğmesine çevirmemeli.
 */
{
  const i = drift.indexOf("export async function POST");
  const govde = drift.slice(i);
  const guard = govde.indexOf("blobPeople === null");
  const sil = govde.indexOf("dbDeletePeople(");
  check(guard > 0, "onarımda 'kaynak okunamadı' koruması var");
  check(guard < sil, "koruma silmeden ÖNCE geliyor");
}
check(/blobMissing/.test(drift), "Blob dosyası yoksa ayrı bir durum olarak bildiriliyor");
{
  // Ve o durum TEMİZ sayılmıyor.
  const i = drift.indexOf("if (!blob) {");
  check(i > 0 && drift.slice(i, i + 700).includes("clean: false"),
    "Blob okunamayan ağaç temiz sayılmıyor");
}

/* --- Göç: boş Blob'la yazmaya girmiyor ---------------------------------- */
{
  const i = migrate.indexOf("export async function POST");
  const govde = migrate.slice(i);
  const guard = govde.indexOf("if (!fam)");
  const yaz = govde.indexOf("dbReplacePeople(");
  check(guard > 0 && guard < yaz, "Blob dosyası yoksa göç yazmaya girmiyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
