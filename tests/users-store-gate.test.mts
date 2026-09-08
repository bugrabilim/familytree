import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Olumsuz iddialardan önce yorumlar ayıklanır. */
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const src = kodu(read("../lib/users.ts"));
const tipler = read("../types/user.ts");

/**
 * KAPI: `users.json` üzerindeki HER yazma kayıp yazma korumasından geçer.
 *
 * `users.json` bütün hesapların TEK dosyası. Sekiz ayrı yazma yolu dosyayı
 * okuyup TAMAMINI geri yazıyordu ve hiçbirinde koruma yoktu — yani çakışma
 * olasılığı bir ağacın değil SİSTEMİN toplam yazma hızıyla ölçekleniyordu.
 *
 * En pahalı senaryo kayıt: iki kişi aynı anda kaydolduğunda ikisi de N
 * satırlık listeyi okur, kendi satırını ekleyip yazar; ikinci yazma
 * birincinin satırını siler. Kaybeden kullanıcı başarı ekranını ve kurtarma
 * kodunu GÖRÜR, Supabase Auth kaydı açılmıştır, Postgres'te hesap ve ev
 * ağacı satırı vardır — ama giriş `users.json`dan doğrulandığı için o hesaba
 * BİR DAHA HİÇ girilemez. Pencere de dar değil: okuma ile yazma arasında bir
 * Supabase Auth admin çağrısı duruyor.
 *
 * `lib/store-mutate.ts` bu depoda zaten vardı ve yedi yan koleksiyonu
 * koruyordu; kimlik deposu listeye hiç girmemişti.
 */

/* --- 1. Kutu damgalı, damga yazılıyor --------------------------------- */

check(/updatedAt: string;/.test(tipler.slice(tipler.indexOf("export interface UsersData"))),
  "UsersData sürüm damgası taşıyor");
check(/data\.updatedAt = new Date\(\)\.toISOString\(\)/.test(src),
  "her yazma damgayı ileri alıyor");
check(/updatedAt: kutu\.updatedAt \?\? ""/.test(src),
  "damgası olmayan ESKİ dosya tutarlı bir başlangıç alıyor");

/* --- 2. Doğrudan yazma YOK: tek kapı `mutateUsers` --------------------- */
/*
 * Asıl kural bu. Tek bir `saveUsersData` çağrısı korumanın dışında kalsa,
 * o yol sessizce eski davranışa döner.
 */
{
  const cagrilar = src.match(/await saveUsersData\(/g) ?? [];
  check(cagrilar.length === 0, `doğrudan saveUsersData çağrısı kalmadı (${cagrilar.length})`);
  check(/function mutateUsers</.test(src), "ortak sarmalayıcı var");
  check(/mutateStore\(getUsersData, saveUsersData,/.test(src),
    "sarmalayıcı ortak korumayı kullanıyor (kopya mantık yok)");
}

/* --- 3. Sekiz yazma yolunun hepsi sarmalayıcıdan geçiyor -------------- */
{
  const YAZANLAR = [
    "createUser", "updateUserNotify", "updateUserAuthEmail", "updateUserResetToken",
    "updateUserPassword", "applyRecoveryReset", "setUserDeletedAt", "deleteUserRow",
  ];
  for (const ad of YAZANLAR) {
    const i = src.indexOf(`export async function ${ad}(`);
    const govde = src.slice(i, src.indexOf("\n}\n", i) + 3);
    check(i > -1, `${ad} bulundu`);
    check(govde.includes("mutateUsers"), `${ad}: korumadan geçiyor`);
  }
}

/* --- 4. Dış etkiler gövdenin DIŞINDA ---------------------------------- */
/*
 * Gövde çakışmada YENİDEN KOŞUYOR. Postgres aynası, Supabase Auth ve
 * önbellek temizliği içeride olsalardı iki kez çalışırlardı.
 */
for (const [ad, disEtki] of [
  ["updateUserPassword", "dbUpdateAccountPassword("],
  ["applyRecoveryReset", "dbUpdateAccountPassword("],
  ["createUser", "dbUpsertAccount("],
] as const) {
  const i = src.indexOf(`export async function ${ad}(`);
  const govde = src.slice(i, src.indexOf("\n}\n", i) + 3);
  const mut = govde.indexOf("mutateUsers");
  /*
   * Gövdenin kapanışı `}, "<etiket>");` — `});` aramak yanılıyordu, çünkü
   * `dbUpsertTree({ ... });` de öyle bitiyor ve DAHA SONRA geliyordu.
   */
  const kapanis = govde.indexOf('}, "', mut);
  const etki = govde.indexOf(disEtki);
  check(etki > -1 && mut > -1 && etki > kapanis,
    `${ad}: ${disEtki} mutasyon gövdesinin DIŞINDA (çakışmada iki kez koşmasın)`);
}

/* --- 5. Ad tekilliği ATOMİK pencerede ---------------------------------- */
/*
 * Denetim yalnız rotalarda duruyordu ve okuma ile yazma arasında saniyeler
 * vardı. Yarışı yalnız burası kapatabilir: tek atomik pencerede hem bakıp
 * hem yazan tek yer burası.
 */
{
  const i = src.indexOf("export async function createUser(");
  const govde = src.slice(i, src.indexOf("\n}\n", i) + 3);
  const mut = govde.indexOf("mutateUsers");
  const denetim = govde.indexOf("familyName.toLowerCase()");
  const push = govde.indexOf("data.users.push(");
  check(denetim > mut && push > denetim, "ad denetimi mutasyonun İÇİNDE ve eklemeden ÖNCE");
  check(/throw new Error\(AD_DOLU\)/.test(govde), "çakışmada işaretli hata fırlıyor");
  check(/export const AD_DOLU/.test(src), "işaret dışa veriliyor (rotalar 409'a çevirsin)");
  check(!/Bu adla zaten/.test(src), "kitaplık KULLANICI METNİ üretmiyor (dil rotanın işi)");
}
{
  // Ve rotalar işareti gerçekten 409'a çeviriyor.
  for (const [ad, yol] of [
    ["web", "../app/api/register/route.ts"],
    ["mobil", "../app/api/mobile/register/route.ts"],
  ] as const) {
    const r = kodu(read(yol));
    check(/AD_DOLU/.test(r), `${ad} kayıt: işareti tanıyor`);
    /*
     * İlk geçtiği yer İÇE AKTARMA satırı; aranan KARŞILAŞTIRMA. `indexOf`
     * ilkini bulduğu için pencere hep içe aktarmanın etrafına düşüyordu.
     */
    const i = r.search(/===\s*AD_DOLU|message === AD_DOLU/);
    check(i > -1, `${ad} kayıt: işaret karşılaştırılıyor`);
    check(i > -1 && /status: 409/.test(r.slice(i, i + 320)), `${ad} kayıt: işaret 409'a çevriliyor`);
  }
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
