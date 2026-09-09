import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: `User`ın HER alanı Postgres aynasına yazılır.
 *
 * Faz 4 / parça 2 `users.json`ı kimlik deposu olmaktan çıkarıyor ve
 * `docs/SUPABASE-GECIS.md` bunu "veri zaten Postgres + Auth'ta" diye tarif
 * ediyordu. DEĞİLDİ: on sekiz alanın on üçü yalnız Blob'da yaşıyordu, çünkü
 * ayna beş sütunla açılmış ve sonradan eklenen hiçbir alan oraya
 * yazılmamıştı. Kimse fark etmedi, çünkü hiçbir şey soruyordu.
 *
 * `users.json` o hâliyle emekliye ayrılsaydı yumuşak silinmiş hesap geri
 * dirilir, şifre sıfırlama oturumları düşürmez, kurtarma koduyla sıfırlama
 * hiç çalışmazdı — üçü de hata vermeden.
 *
 * Bu kapı `User` tipini KAYNAK sayıyor: yarın eklenen bir alan aynaya
 * yazılmazsa test kırılır. Elle liste tutmak, düzeltilen hatanın aynısını
 * testin içinde yeniden kurmak olurdu.
 */

/** `User` arayüzünün alan adları (yorumlar ayıklanmış gövdeden). */
function userAlanlari(): string[] {
  const t = read("../types/user.ts");
  const i = t.indexOf("export interface User {");
  const govde = kodu(t.slice(i, t.indexOf("\n}", i)));
  return [...govde.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
}

/** camelCase → snake_case (ayna sütun adı kuralı). */
const sutun = (alan: string) => alan.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const alanlar = userAlanlari();
check(alanlar.length >= 18, `User alanları okundu (${alanlar.length})`);

const db = kodu(read("../lib/db.ts"));
/*
 * Sütun nesnesi artık `dbUpsertAccount`ın gövdesinde değil, ortak
 * `hesapSatiri`de. Faz 4 / 2c-2 iki yazma yolu daha ekledi (satır ekleme ve
 * koşullu güncelleme); nesne upsert'ün içinde kalsaydı kopyalanırdı ve
 * yarın eklenen bir alan yollardan yalnız birine yazılırdı — hata da alanın
 * hangi yoldan yazıldığına göre değişirdi (kayıtta var, güncellemede yok).
 */
const builder = db.slice(db.indexOf("function hesapSatiri(u: User)"));
const govde = builder.slice(0, builder.indexOf("\n}\n") + 3);
const sema = read("../supabase/schema.sql");

/* --- 0. ÜÇ yazma yolu da ortak nesneyi kullanıyor ---------------------- */
{
  check(govde.length > 200, "ortak sütun nesnesi bulundu");
  for (const yol of ["dbUpsertAccount", "dbInsertAccount", "dbUpdateAccountIf"]) {
    const i = db.indexOf(`export async function ${yol}`);
    const g = db.slice(i, db.indexOf("\n}\n", i) + 3);
    check(i > -1 && /hesapSatiri\(u\)/.test(g), `${yol}: ortak sütun nesnesini kullanıyor`);
  }
}

/* --- 1. Her alan hem ŞEMADA hem AYNADA -------------------------------- */

for (const alan of alanlar) {
  const s = sutun(alan);
  check(
    new RegExp(`\\b${s}\\b`).test(sema),
    `şemada sütun var: ${alan} → ${s}`
  );
  check(
    new RegExp(`${s}:\\s*u\\.${alan}\\b`).test(govde),
    `ayna alanı yazıyor: ${alan}`
  );
}

/* --- 2. Boşluk `null` olarak yazılıyor -------------------------------- */
/*
 * `undefined` gönderilen alanı Supabase YAZMIYOR; yani bir alanın SİLİNMESİ
 * aynaya hiç ulaşmazdı. Kullanıcı bildirim adresini kaldırdığında ayna eski
 * adresi tutmaya devam eder, okuma yolu Postgres'e döndüğünde SİLİNMİŞ BİR
 * ONAY geri gelirdi.
 */
{
  const istegeBagli = alanlar.filter((a) => {
    const t = read("../types/user.ts");
    const i = t.indexOf("export interface User {");
    return new RegExp(`^\\s{2}${a}\\?:`, "m").test(kodu(t.slice(i, t.indexOf("\n}", i))));
  });
  check(istegeBagli.length >= 12, `isteğe bağlı alanlar bulundu (${istegeBagli.length})`);
  for (const a of istegeBagli) {
    if (a === "recoveryCodeIndex") continue; // aşağıda ayrı; `?? null` ile aynı kural
    check(
      new RegExp(`${sutun(a)}:\\s*u\\.${a}\\s*\\?\\?\\s*(null|"")`).test(govde),
      `boşluk açıkça yazılıyor: ${a}`
    );
  }
}

/* --- 3. Kurtarma indeksi ARANABİLİR ----------------------------------- */
/*
 * Kod tek başına hesabı gösteriyor (`findUserByRecoveryIndex`), ağaç adı
 * sorulmuyor. Okuma yolu Postgres'e döndüğünde bu arama indekssiz tam tarama
 * olurdu — ve o uç ORAN SINIRLI bir kaba kuvvet yüzeyi.
 */
check(/accounts_recovery_code_index_key/.test(sema), "kurtarma indeksi için veritabanı indeksi var");

/* --- 4. Şema yeniden koşturulabilir ----------------------------------- */
/*
 * Betik hem ilk kurulumda hem var olan veritabanında aynı sonucu vermeli;
 * yoksa "şemayı uygula" adımı üretimde patlar ve kimse ikinci kez denemez.
 */
{
  const eklemeler = sema.match(/alter table public\.accounts add column[^;]*/g) ?? [];
  check(eklemeler.length >= 13, `sütun eklemeleri bulundu (${eklemeler.length})`);
  const korumasiz = eklemeler.filter((e) => !/if not exists/.test(e));
  check(korumasiz.length === 0, `hepsi 'if not exists' ile (${korumasiz.length} değil)`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
