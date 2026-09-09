import { readFileSync, readdirSync } from "node:fs";

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

/* --- 4. Ayna TEK yazma noktasında, gövdede değil ---------------------- */
/*
 * Bu bölümün kuralı DEĞİŞTİ ve sebebi kayda geçsin.
 *
 * Önce "ayna mutasyon gövdesinin dışında olsun" deniyordu: gövde çakışmada
 * yeniden koşuyor, içeride bir ayna yazması iki kez çalışırdı. Kural
 * doğruydu ama yetersizdi — dışarıda olmak, aynanın ÇAĞRILDIĞI anlamına
 * gelmiyordu. Sekiz yazma yolunun BEŞİ (bildirim tercihi, kimlik e-postası,
 * sıfırlama jetonu, silme damgası, satır silme) aynaya hiç dokunmuyordu ve
 * bu kapı onu görmüyordu.
 *
 * Ayna artık `saveUsersData` içinde — depoya yazan tek nokta. Orası
 * `mutateStore`ta yalnız BAŞARILI yazmada çalışıyor (çakışmada `yaz`
 * hiç çağrılmıyor), dolayısıyla eski kaygı da ortadan kalkıyor: iki kez
 * koşma ihtimali yok.
 */
{
  const i = src.indexOf("async function saveUsersData");
  const govde = src.slice(i, src.indexOf("\n}\n", i) + 3);
  check(i > -1, "tek yazma noktası bulundu");
  check(govde.includes("dbUpsertAccount("), "ayna tek yazma noktasında");
  check(/for \(const u of data\.users\)/.test(govde),
    "hesapların TAMAMI aynalanıyor (ayna kendi kendini onarsın)");
  check(/catch/.test(govde), "ayna best-effort — Blob asıl kaynak, kimlik işlemi düşmesin");
}
{
  // Ve kopya ayna çağrıları KALMADI: kuralın sekiz yere dağılması, beşinde
  // hiç uygulanmamasının sebebiydi.
  const kopya = (src.match(/dbUpsertAccount\(/g) ?? []).length;
  check(kopya === 1, `tek ayna çağrısı var (${kopya} bulundu)`);
  check(!src.includes("dbUpdateAccountPassword"), "şifreye özel ayna yolu kaldırıldı");
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


/* --- 6. Satır silen HER yol aynadan da siler --------------------------- */
/*
 * `saveUsersData` aynaya UPSERT yapıyor; listeden DÜŞEN bir satırı silmiyor.
 * Dolayısıyla `users.json`dan bir satır kaldıran her yol, aynadaki
 * karşılığını da kaldırmak zorunda — yoksa kayıt yalnız bir depoda ölür.
 *
 * Tam olarak bu oldu: `/api/admin/demo-cleanup` yalnız `users.json`
 * satırını siliyordu ve `demo-hesap` şifre özetiyle birlikte aynada
 * kalmıştı. Faz 4'ün kalan parçası okuma yolunu Postgres'e çeviriyor, yani
 * o kalıntı demoyu kimlik deposuna GERİ SOKARDI. Kapı da görmüyordu:
 * `phase4`in `demo-acikta` engeli `users.json`a bakıyor, aynaya bakmıyor.
 *
 * Silme yönü otomatik uzlaştırılmadı (aynada olup listede olmayanı silmek)
 * bilerek: Blob okuması bir an eskiyse o mantık GERÇEK hesap satırlarını
 * silerdi. Kaynak kaynağı değiştirmek üzereyken böyle bir çıkarım fazla
 * tehlikeli; onun yerine her çağıran açıkça siliyor ve bu kapı unutulmasını
 * engelliyor.
 */
{
  const kok = new URL("../", import.meta.url).pathname;
  const tara = (dizin: string, out: string[] = []): string[] => {
    for (const g of readdirSync(dizin, { withFileTypes: true })) {
      if (g.name === "node_modules" || g.name === ".next" || g.name === "apps") continue;
      const yol = `${dizin}${g.name}`;
      if (g.isDirectory()) tara(`${yol}/`, out);
      else if (/\.tsx?$/.test(g.name)) out.push(yol);
    }
    return out;
  };
  const cagiranlar = tara(`${kok}app/`)
    .concat(tara(`${kok}lib/`))
    .filter((y) => !y.endsWith("lib/users.ts"))
    .filter((y) => /deleteUserRow\(/.test(readFileSync(y, "utf8")));

  check(cagiranlar.length >= 2, `deleteUserRow çağıranları bulundu (${cagiranlar.length})`);
  for (const yol of cagiranlar) {
    const ad = yol.slice(kok.length);
    const src = kodu(readFileSync(yol, "utf8"));
    check(/dbDeleteAccountRow\(|dbDeleteAccount\(/.test(src),
      `${ad}: aynadaki satırı da siliyor`);
  }
}
{
  // Demo temizliği ağaca DOKUNMAMALI: demo bir hesap değil, bir vitrin.
  const demo = kodu(read("../app/api/admin/demo-cleanup/route.ts"));
  check(/dbDeleteAccountRow\(/.test(demo), "demo temizliği dar silmeyi kullanıyor");
  check(!/dbDeleteAccount\(/.test(demo.replace(/dbDeleteAccountRow\(/g, "")),
    "demo temizliği ağaçları silen geniş yolu KULLANMIYOR");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
