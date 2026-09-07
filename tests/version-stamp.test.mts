import { readFileSync } from "node:fs";
import { normalizeStamp, pickVersion } from "../lib/version-stamp.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ---------------------------------------------------------------- 1. normalizeStamp */

check(normalizeStamp("2026-09-06T10:00:00.000Z") === "2026-09-06T10:00:00.000Z", "ISO-Z aynen kalır");
check(normalizeStamp("2026-09-06T10:00:00.123+00:00") === "2026-09-06T10:00:00.123Z", "Postgres biçimi ISO-Z'ye iner");
check(normalizeStamp("2026-09-06T13:00:00+03:00") === "2026-09-06T10:00:00.000Z", "saat dilimi UTC'ye çevrilir");

check(normalizeStamp("") === "", "boş dizge → damga yok");
check(normalizeStamp("   ") === "", "yalnız boşluk → damga yok");
check(normalizeStamp(null) === "", "null → damga yok");
check(normalizeStamp(undefined) === "", "undefined → damga yok");
check(normalizeStamp(123) === "", "sayı → damga yok");
check(normalizeStamp({}) === "", "nesne → damga yok");
check(normalizeStamp("hiç de zaman değil") === "", "ayrıştırılamayan → damga yok");

/*
 * BİÇİM KARIŞIMI TUZAĞI — bu testin asıl varlık sebebi.
 *
 * Aynı ANI iki biçimde yazınca ham dizge karşılaştırması ters cevap veriyor:
 * "+" (0x2B) < "Z" (0x5A). Yani Postgres'ten gelen damga, Blob'dan gelen
 * eşiti karşısında hep "küçük" görünürdü.
 */
{
  const pg = "2026-09-06T10:00:00.000+00:00";
  const js = "2026-09-06T10:00:00.000Z";
  check(pg < js, "ham dizgede aynı an farklı sıralanıyor (tuzağın kendisi)");
  check(normalizeStamp(pg) === normalizeStamp(js), "normalize edilince aynı an EŞİT");
}

/* ---------------------------------------------------------------- 2. pickVersion */

const A = "2026-09-06T10:00:00.000Z";
const B = "2026-09-06T11:00:00.000Z";
const C = "2026-09-06T12:00:00.000Z";

check(pickVersion(null, [A, B]) === B, "ağaç damgası yoksa kişilerin en yenisi");
check(pickVersion(undefined, []) === "", "hiç damga yoksa boş jeton");
check(pickVersion(C, [A, B]) === C, "ağaç damgası daha yeniyse o kazanır");
check(pickVersion(A, [B, C]) === C, "kişi damgası daha yeniyse o kazanır");
check(pickVersion(B, [B]) === B, "eşitlikte aynı değer");
check(pickVersion(B, []) === B, "kişi yokken ağaç damgası tek başına yeter");
check(pickVersion("2026-09-06T12:00:00+00:00", [A]) === C, "ağaç damgası da normalize edilir");
check(pickVersion(A, ["2026-09-06T12:00:00+00:00"]) === C, "kişi damgası da normalize edilir");
check(pickVersion("bozuk", [A]) === A, "bozuk ağaç damgası jetonu düşürmez");
check(pickVersion(A, ["bozuk", null, B]) === B, "bozuk kişi damgaları atlanır");
check(pickVersion(A, [C, B]) === C, "sıra önemsiz — en büyüğü bulunur");

/*
 * ASIL DAVRANIŞ: SİLME JETONU GERİYE GÖTÜRMEZ.
 *
 * Hata şuydu: jeton yalnız kişilerden türeyince, en son güncellenen kişiyi
 * silmek en büyük damgayı da götürüyor ve ağaç eski bir sürüme "geri
 * dönüyordu". Eski jetonu elinde tutan istemci çakışma görmeden yazıyor ve
 * silinen kişi diriliyordu.
 */
{
  // Silmeden önce: kişiler A ve C var, ağaç son C'de kaydedilmiş.
  const oncePeople = [A, C];
  const eskiJeton = pickVersion(null, oncePeople);          // eski davranış
  check(eskiJeton === C, "silme öncesi jeton C");

  // C damgalı kişi silindi; kaydetme ağacı YENİ bir damgayla işaretledi.
  const sonraPeople = [A];
  const damga = "2026-09-06T12:30:00.000Z";
  check(pickVersion(null, sonraPeople) === A, "eski davranışta jeton C'den A'ya DÜŞÜYOR (hata)");
  check(pickVersion(damga, sonraPeople) === damga, "yeni davranışta jeton ilerliyor");
  check(pickVersion(damga, sonraPeople) > eskiJeton, "silme sonrası jeton silme öncesinden BÜYÜK");
}

/*
 * YARIM AYNA: damga yazılamadıysa (ayna zaman aşımı) jeton yine de kişi
 * damgasıyla ilerler — "büyüğünü al" kuralının ikinci işi bu.
 */
{
  const eskiDamga = A;      // ağaç damgası eski kaldı
  const yeniKisi = C;       // ama kişi yazılabildi
  check(pickVersion(eskiDamga, [yeniKisi]) === C, "damga geride kalsa da jeton kişiyle ilerler");
}

/* ---------------------------------------------------------------- 3. Kapılar */

const db = kodu(read("../lib/db.ts"));
const blob = kodu(read("../lib/blob.ts"));
const drift = kodu(read("../app/api/admin/drift/route.ts"));

/* dbGetFamilyData ağaç damgasını GERÇEKTEN okumalı ve pickVersion'a vermeli. */
{
  const i = db.indexOf("export async function dbGetFamilyData");
  const govde = db.slice(i, db.indexOf("\n}", i));
  check(i > 0, "dbGetFamilyData bulundu");
  check(/from\("trees"\)\s*\.select\("id, updated_at"\)/.test(govde), "ağaç satırı updated_at ile okunuyor");
  check(/updatedAt = pickVersion\(/.test(govde), "jeton pickVersion ile üretiliyor");
  check(!/for \(const r of rows\) if \(r\.updated_at > updatedAt\)/.test(govde), "elle en-büyük döngüsü kalmadı");
}

/* Damgayı yazan işlev var ve trees satırını güncelliyor. */
{
  const i = db.indexOf("export async function dbSetTreeUpdatedAt");
  const govde = db.slice(i, db.indexOf("\n}", i));
  check(i > 0, "dbSetTreeUpdatedAt bulundu");
  check(/\.update\(\{ updated_at: iso \}\)/.test(govde), "trees.updated_at güncelleniyor");
  check(/\.eq\("id", treeId\)/.test(govde), "yalnız hedef ağaç güncelleniyor");
}

/*
 * KAPI: her kaydetme damgayı ilerletmeli ve bunu KİŞİLERDEN ÖNCE yapmalı.
 *
 * Sıra iddiası gerçek bir arıza kipini tutuyor: ters sırada, kişiler silinip
 * damga yazılamazsa jeton geride kalır — dirilme hatası aynen geri gelir.
 */
{
  const i = blob.indexOf("export async function saveFamilyData");
  const govde = blob.slice(i);
  const iDamga = govde.indexOf("dbSetTreeUpdatedAt(userId");
  const iSil = govde.indexOf("dbDeletePeople(userId");
  const iYaz = govde.indexOf("dbUpsertPeople(userId");
  check(i > 0, "saveFamilyData bulundu");
  check(iDamga > -1, "saveFamilyData damgayı ilerletiyor");
  check(/dbSetTreeUpdatedAt\(userId, data\.updatedAt\)/.test(govde), "damga Blob'a yazılan sürümün TA KENDİSİ");
  check(iSil > -1 && iDamga < iSil, "damga, kişi silmeden ÖNCE");
  check(iYaz > -1 && iDamga < iYaz, "damga, kişi yazmadan ÖNCE");
}

/* KAPI: kayma onarımı da silme yapıyor — o da damgalamalı. */
{
  const iSil = drift.indexOf("dbDeletePeople(t.treeId");
  const iDamga = drift.indexOf("dbSetTreeUpdatedAt(t.treeId");
  check(iSil > -1, "onarım kişi siliyor (kuralın dayanağı)");
  check(iDamga > iSil, "onarım, silmeden sonra damgayı ilerletiyor");
}

/* ---------------------------------------------------------------- 4. Şema */

/*
 * SÜTUN ŞEMA DOSYASINDA OLMALI.
 *
 * Canlı veritabanına göçle eklenmişti ama `supabase/schema.sql` taşımıyordu.
 * Bu, sessiz bir felaketti: aynayı yazan blok önce damgayı vuruyor, damga
 * çağrısı "böyle sütun yok" diye hata verince aynı gövdedeki KİŞİ yazmaları
 * da hiç çalışmıyordu — yani bu dosyadan kurulmuş her ortamda Postgres
 * aynası tümüyle ölürdü ve kimse fark etmezdi (ayna en iyi çaba, hatası
 * yalnız günlüğe düşüyor).
 *
 * Denetim ŞEMANIN KENDİSİNE bakıyor, göç geçmişine değil: yeni bir ortam
 * bu dosyadan kuruluyor.
 */
{
  const sema = read("../supabase/schema.sql");
  const i = sema.indexOf("create table if not exists public.trees");
  const blok = i > -1 ? sema.slice(i, sema.indexOf(");", i)) : "";
  check(i > -1, "trees tablosu şemada bulundu");
  check(/updated_at\s+timestamptz/.test(blok), "trees.updated_at şemada VAR");
  /*
   * NULL olabilmeli: sütun sonradan eklendi ve var olan ağaçlarda boş.
   * `not null` yazsaydık şema canlıyla ayrışırdı ve `pickVersion`ın boşluğu
   * karşılayan yolu ölü kod olurdu.
   */
  check(!/updated_at\s+timestamptz\s+not null/.test(blok), "trees.updated_at NULL olabiliyor (canlıyla aynı)");
}

/* ------------------------------------------------- 5. Damga hatası ayna öldürmesin */

/*
 * Damga çağrısı KENDİ kapsülünde olmalı.
 *
 * Blok tek bir `async` gövde; çıplak bir `await` orada hata verirse altındaki
 * kişi yazmaları hiç çalışmaz. Yani damga ile kişi aynası aynı kadere
 * bağlanır ve tek bir sütun sorunu bütün aynayı sessizce durdurur.
 */
{
  const i = blob.indexOf("export async function saveFamilyData");
  const govde = blob.slice(i);
  const iDamga = govde.indexOf("dbSetTreeUpdatedAt(userId");
  const oncesi = govde.slice(Math.max(0, iDamga - 260), iDamga);
  check(/try \{/.test(oncesi), "damga çağrısı try içinde");
  check(/damgaDustu = true/.test(govde), "damga hatası işaretleniyor");
  check(/\[cift-yazma\] damga/.test(govde), "damga hatası günlüğe yazılıyor");
  /* Kişi yazmaları damga hatasına RAĞMEN çalışmalı. */
  const iSil = govde.indexOf("dbDeletePeople(userId");
  const iCatch = govde.indexOf("damgaDustu = true");
  check(iCatch > -1 && iSil > iCatch, "kişi yazmaları damga catch'inden SONRA (yani hata onları kesmiyor)");
  /* Geçici hatada jeton yine ilerlesin: kişilerden sonra ikinci deneme. */
  check(/if \(damgaDustu\) \{/.test(govde), "damga düştüyse ikinci deneme var");
  const iIkinci = govde.lastIndexOf("dbSetTreeUpdatedAt(userId");
  check(iIkinci > iSil, "ikinci deneme kişi yazmalarından SONRA");
}

/* ----------------------------------- 6. Jeton, istemciye dönen değerin TA KENDİSİ */

/*
 * İKİ TARAF AYNI DAMGAYI TAŞIMALI.
 *
 * Kaydetme yolu Blob'a `data.updatedAt` yazıyor ve o değeri istemciye
 * `version` olarak veriyor (öneri onayı bunu `x-base-version` diye geri
 * gönderiyor). Aynaya basılan KİŞİ SATIRLARI ise kendi "şimdi"sini
 * yazıyordu — Blob yazmasından birkaç milisaniye sonrasını.
 *
 * Jeton ikisinin BÜYÜĞÜ olduğu için (`pickVersion`) sonuç hep kişi damgası
 * oluyordu: istemcinin elindeki sürüm daha doğduğu anda bayat. Sonucu, arka
 * arkaya yapılan her İKİNCİ onayın "ağaç bu sırada başka bir yerde değişti"
 * diye 409 yemesi — yani kuyruğun asıl kullanımının (toplu onay, art arda
 * onay) kırılması.
 *
 * `pickVersion` bunu tek başına düzeltemez: elindeki iki değerden büyüğünü
 * seçmek zorunda, küçüğünü seçmek silme dirilmesini geri getirirdi. Düzeltme
 * kaynağında: iki tarafa AYNI damgayı yazmak.
 */
{
  const db = kodu(read("../lib/db.ts"));
  check(/function personToRow\(treeId: string, p: Person, stamp\?: string\)/.test(db),
    "satır kurucusu damga alabiliyor");
  check(/updated_at: stamp \?\? new Date\(\)\.toISOString\(\)/.test(db),
    "damga verilmişse o yazılıyor");
  check(/personToRow\(treeId, p, stamp\)/.test(db), "damga satır kurucusuna geçiyor");

  const i = blob.indexOf("export async function saveFamilyData");
  const govde = blob.slice(i);
  check(/dbUpsertPeople\(userId, changed, data\.updatedAt\)/.test(govde),
    "hedefli yazmada damga geçiyor");
  check(/dbReplacePeople\(userId, data\.people, data\.updatedAt\)/.test(govde),
    "tam yenilemede damga geçiyor");
  /*
   * AYNI değer olmalı, "yakın" değil: `data.updatedAt` dışında bir kaynak
   * (ör. yeni bir `new Date()`) yazılsaydı fark yine milisaniye olurdu ama
   * jeton yine istemcininkinden büyük çıkardı.
   */
  const iDamga = govde.indexOf("dbSetTreeUpdatedAt(userId");
  check(/dbSetTreeUpdatedAt\(userId, data\.updatedAt\)/.test(govde) && iDamga > -1,
    "ağaç damgası da AYNI değerden");
}

/* Sonuç: her iki taraf da aynı damgayı taşırsa jeton tam olarak o değerdir. */
{
  const t = "2026-09-07T04:00:00.123Z";
  check(pickVersion(t, [t, t, t]) === t, "iki taraf aynıysa jeton istemciye dönen değerin ta kendisi");
  /* Postgres biçimi de aynı ana çözülüyor — normalize bunun için var. */
  check(pickVersion("2026-09-07T04:00:00.123+00:00", [t]) === t, "Postgres yazımı da aynı jetona iniyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
