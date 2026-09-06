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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
