import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** Bir işlevin gövdesi (yorumlar ayıklanmış kaynaktan). */
const govdesi = (src: string, imza: string) => {
  const i = src.indexOf(imza);
  return i === -1 ? "" : src.slice(i, src.indexOf("\n}\n", i) + 3);
};

const users = kodu(read("../lib/users.ts"));
const db = kodu(read("../lib/db.ts"));
const sema = read("../supabase/schema.sql");

/**
 * KAPI: kimlik YAZMALARI Postgres'e gidiyor ve koruma GERÇEKTEN koşullu.
 *
 * ## Neyin nöbetini tutuyor
 *
 * Faz 4 / 2c-2 `users.json`ı asıl kaynak olmaktan çıkarıyor. Bu, geri
 * dönüşü en zor adım, ve üç ayrı sessiz arıza yolu var:
 *
 *  1. Koşullu güncelleme koşulunu kaybederse (`where updated_at = …`
 *     düşerse) kayıp yazma koruması TAMAMEN gider — üstelik test edilen
 *     her senaryo yine geçer, çünkü çakışma ancak eşzamanlılıkta görünür.
 *  2. Blob aynası boş liste yazarsa geri düşüş kopyası SİLİNİR: aynanın
 *     okunamadığı ilk anda kimse giriş yapamaz.
 *  3. Acil durum anahtarı kaybolursa geri dönüş yolu kalmaz.
 *
 * Üçü de "çalışıyor gibi görünen" arızalar. Kapı bu yüzden davranışa değil
 * (davranış `tests/store-mutate-row.test.mts`te koşuyor) YAPIYA bakıyor.
 */

/* --- 1. Acil durum anahtarı ------------------------------------------- */
{
  const g = govdesi(users, "function aynayaYazilirMi()");
  check(g.length > 0, "anahtar işlevi var");
  check(/IDENTITY_WRITE_BLOB/.test(g), "anahtar adı `IDENTITY_WRITE_BLOB`");
  /*
   * VARSAYILAN YENİ DAVRANIŞ. Bayrağın varsayılanı eski davranış olsaydı
   * hiç açılmaz ve göç hiç yapılmamış olurdu — `AUTH_BCRYPT_FALLBACK` ile
   * aynı kalıp: kapatılmayan bayrak koruma değil süstür.
   */
  check(/return !\(/.test(g), "varsayılan ayna; bayrak Blob'a GERİ ALIR");
  /*
   * Supabase yoksa (yerel geliştirme) bayrağa hiç bakılmadan Blob asıl
   * kalıyor: olmayan bir aynaya yazmayı denemek, yerelde her kimlik
   * işlemini öldürürdü.
   */
  const i = g.indexOf("isSupabaseConfigured");
  const j = g.indexOf("IDENTITY_WRITE_BLOB");
  check(i > -1 && i < j, "ayna yapılandırılmamışsa bayrak ARANMADAN Blob'a düşülüyor");
  check(/\.env\.local\.example/.test("x") || /IDENTITY_WRITE_BLOB/.test(read("../.env.local.example")),
    "anahtar örnek ortam dosyasında yazılı");
  check(/IDENTITY_WRITE_BLOB/.test(read("../docs/SUPABASE-GECIS.md")),
    "anahtar göç belgesinde yazılı");
}

/* --- 2. Üç kapının hepsi anahtara bakıyor ------------------------------ */
/*
 * Biri bakmasaydı geri dönüş YARIM olurdu: bayrak açıldığında yedi yol
 * Blob'a döner, sekizincisi aynaya yazmaya devam ederdi — ve iki depo
 * birbirinden habersiz ayrışırdı.
 */
for (const kapi of ["async function hesabiDegistir", "async function hesabiEkle", "async function hesabiSil"]) {
  const g = govdesi(users, kapi);
  check(g.length > 0, `${kapi.split(" ").pop()}: bulundu`);
  check(/aynayaYazilirMi\(\)/.test(g), `${kapi.split(" ").pop()}: anahtara bakıyor`);
}

/* --- 3. Güncelleme yolu GERÇEKTEN koşullu ----------------------------- */
{
  const g = govdesi(users, "async function hesabiDegistir");
  check(/mutateRow</.test(g), "ayna yolu satır korumasını kullanıyor");
  check(/dbGetAccountRow\(bul\)/.test(g), "satır kimlik/ad ile okunuyor");
  check(/dbUpdateAccountIf\(/.test(g), "yazma KOŞULLU güncelleme");

  const u = govdesi(db, "export async function dbUpdateAccountIf");
  check(u.length > 0, "koşullu güncelleme bulundu");
  check(/\.eq\("id", u\.id\)/.test(u), "hedef satır kimlikle daraltılıyor");
  check(/\.eq\("updated_at", eskiDamga\)/.test(u), "KOŞUL: damga hâlâ aynı mı");
  /*
   * `is null` dalı olmadan, sütun sonradan eklendiği için damgası boş kalan
   * her eski hesap bir daha HİÇ güncellenemezdi (`= null` hiçbir satırla
   * eşleşmez) — ve bu, kullanıcının ilk şifre sıfırlamasına kadar
   * görünmezdi.
   */
  check(/\.is\("updated_at", null\)/.test(u), "damgası olmayan eski satır da güncellenebiliyor");
  check(/\.select\("id"\)/.test(u) && /\.length > 0/.test(u),
    "sonuç ETKİLENEN SATIRDAN okunuyor (yoksa çakışma 'başarı' sanılırdı)");
  check(/updated_at: yeniDamga/.test(u), "yeni damga yazılıyor");
  /*
   * `created_at` yamada olmamalı: sütun `not null` ve okunan satırda boş
   * kalmış bir değer geri yazılsaydı istek tip hatasıyla düşerdi.
   */
  check(/delete yama\.created_at/.test(u), "açılış tarihi yamadan çıkarılıyor");
}

/* --- 4. Ad araması JOKER kabul etmiyor -------------------------------- */
/*
 * `ilike` deseninde `%` ve `_` joker. Bir aile adı bunları içerebilir;
 * filtresiz bırakılsaydı "A%" adıyla giriş denemesi BAŞKA bir hesabın
 * satırını getirebilirdi.
 */
{
  const g = govdesi(db, "export async function dbGetAccountRow(");
  check(/\.ilike\("family_name"/.test(g), "ad araması büyük/küçük harf duyarsız");
  check(/toLowerCase\(\) === bul\.familyName\.toLowerCase\(\)/.test(g),
    "sonuç ayrıca TAM karşılaştırmadan geçiyor (joker koruması)");
}

/* --- 5. Blob artık ayna — ve KENDİNİ SİLMİYOR ------------------------- */
{
  const g = govdesi(users, "async function blobAynasi");
  check(g.length > 0, "ayna işlevi var");
  check(/dbGetAccountRows\(\)/.test(g), "ayna Postgres'ten YENİDEN KURULUYOR");
  /*
   * Yama yapılsaydı (yalnız değişen satırı Blob listesine yazmak) Blob'un
   * kendi kayıp yazma sorunu geri gelirdi: oku-değiştir-yaz, kilitsiz.
   */
  check(!/getUsersData\(\)/.test(g), "ayna Blob'u okuyup yamamıyor");
  /*
   * BOŞ AYNA YAZILMAZ. Geçici bir okuma sorunu sıfır satır döndürseydi
   * `users.json` boşalırdı — ve o dosya tam olarak "ayna okunamazsa
   * düşülecek yer". Yedeğin kendisini silen bir yedekleme olurdu.
   */
  check(/users\.length === 0/.test(g) && /return;/.test(g), "boş liste Blob'a YAZILMIYOR");
  check(/catch/.test(g), "ayna best-effort (asıl kaynak artık Postgres)");
}
{
  // Ayna yalnız BAŞARILI yazmadan sonra çalışıyor.
  const d = govdesi(users, "async function hesabiDegistir");
  check(/if \(yazildi\) await blobAynasi\(\)/.test(d), "güncelleme: ayna yalnız yazıldıysa");
  const e = govdesi(users, "async function hesabiEkle");
  check(/=== "ok"\) await blobAynasi\(\)/.test(e), "ekleme: ayna yalnız eklendiyse");
  const si = govdesi(users, "async function hesabiSil");
  /*
   * SİLME yeniden kurmayla YANSITILAMAZ. `blobAynasi` boş liste yazmayı
   * reddediyor; son hesap silindiğinde ayna boşalır, yeniden kurma erken
   * döner ve `users.json` silinen hesabı tutmaya devam eder. Okuma yolu boş
   * aynayı güvenilmez sayıp Blob'a düştüğü için hesap ŞİFRESİYLE BİRLİKTE
   * geri dirilir — bu deponun `demo-hesap` satırında bir kez yaşadığı arıza.
   */
  check(/blobdanSil\(id\)/.test(si), "silme: Blob'dan HEDEFLİ çıkarılıyor");
  check(!/blobAynasi\(\)/.test(si), "silme: yeniden kurmaya güvenmiyor");
  check(/if \(!ok\) return false/.test(si), "silme: satır yoksa Blob'a dokunulmuyor");
  check(/catch/.test(si), "silme: Blob tarafı best-effort (asıl kaynak Postgres)");
}

/* --- 6. Şema: damga sütunu ------------------------------------------- */
{
  check(/add column if not exists updated_at/.test(sema), "damga sütunu şemada, `if not exists` ile");
}

/* --- 7. Okuma ve yazma AYRI anahtarlarda ----------------------------- */
/*
 * İkisi tek bayrağa bağlansaydı geri alma kaba olurdu: yalnız yazmada bir
 * sorun görüldüğünde okuma da geri alınmak zorunda kalırdı (ya da tersi).
 */
{
  check(/IDENTITY_READ_BLOB/.test(users) && /IDENTITY_WRITE_BLOB/.test(users),
    "okuma ve yazma ayrı ayrı geri alınabiliyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
