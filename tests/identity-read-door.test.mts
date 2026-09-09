import { readFileSync, readdirSync, statSync } from "node:fs";

let ok = 0, fail = 0;
const check = (cond: boolean, msg: string) => { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const kodu = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: kimlik listesi TEK YERDEN okunur — `listUsers()`.
 *
 * ## Neden bu kapı var
 *
 * 2b-2 okuma yolunu Postgres aynasına çevirdi ama YALNIZ `lib/users.ts`
 * içindeki beş bulucuyu (`findUserById`, `findUserByFamilyName`,
 * `findUserByRecoveryIndex`, `deletedAccountIds`, `sessionEpochOf`). Dosyanın
 * DIŞINDA on çağıran daha vardı ve hepsi `getUsersData()` diyerek listeyi
 * doğrudan Blob'dan okuyordu:
 *
 *  · `app/api/cron/reminders`      — kime posta atılacağı (bildirim onayı)
 *  · `app/api/account/notify`      — tercih ekranının gösterdiği durum
 *  · `app/api/account/email(+verify)` — adres ve DOĞRULAMA JETONU
 *  · `app/api/reset-password/token`— ŞİFRE SIFIRLAMA JETONU
 *  · `app/api/family/proposals`    — öneri bildirimi adresi
 *  · `app/api/tree/join`           — davet ekranındaki ağaç adı
 *  · `app/api/admin/accounts`      — operatör konsolu (yumuşak silme/purge)
 *  · `lib/account-lifecycle`       — SÜRESİ DOLMUŞ HESAP SÜPÜRGESİ
 *
 * Bugün ikisi de aynı veriyi veriyor (yazma hâlâ Blob'a gidiyor), yani hata
 * GÖRÜNMÜYOR. Yazma yolu aynaya çevrildiği anda bu on okuma bayat veriye
 * bakmaya başlar ve hiçbiri hata vermez: kapatılmış bir bildirim onayı geri
 * gelir, harcanmış bir sıfırlama jetonu ikinci kez çalışır, kalıcı silme
 * süpürgesi silme damgasını hiç görmez.
 *
 * Bu tam olarak bu depoda beş kez tekrarlanmış desen: KURALI KOPYALAMAK.
 * Çözüm her seferinde aynı — tek karar noktası ve onu tarayan bir kapı.
 */

/* --- 1. Kapı var ve aynaya bakıyor ------------------------------------ */
{
  const src = read("../lib/users.ts");
  check(/export async function listUsers\(\): Promise<User\[\]>/.test(src),
    "`listUsers()` dışa açık");
  const govde = kodu(src.slice(src.indexOf("export async function listUsers")));
  check(/kimlikSatirlari\(\)/.test(govde.slice(0, govde.indexOf("\n}") + 2)),
    "kapı ayna-öncelikli okumayı kullanıyor (kopya mantık yok)");
  /*
   * Kapı `getUsersData`ya DOĞRUDAN gitmemeli: gitseydi acil durum anahtarını
   * (`IDENTITY_READ_BLOB`) ve "boş ayna güvenilmez" kuralını atlar, yani
   * 2b-2'yi sessizce geri alırdı.
   */
  check(!/getUsersData\(\)/.test(govde.slice(0, govde.indexOf("\n}") + 2)),
    "kapı Blob'a doğrudan inmiyor");
}

/* --- 2. Kapı dışında Blob okuyan herkes GEREKÇESİNİ yazmış ------------ */
/*
 * Elle liste tutmuyoruz: dizin taranıyor ve `getUsersData` kullanan her
 * dosyanın `KAPI-DISI: BLOB-ASLI` işaretini TAŞIMASI isteniyor. Yarın
 * eklenen bir okuma, gerekçesini yazmadan bu testten geçemez — ve gerekçeyi
 * yazarken insan zaten "bunun Blob'dan okuması gerekiyor mu" sorusuna
 * cevap vermiş olur.
 */
{
  const kok = new URL("../", import.meta.url).pathname;
  const bulunan: string[] = [];
  const tara = (dizin: string) => {
    for (const ad of readdirSync(kok + dizin)) {
      if (ad === "node_modules" || ad === ".next" || ad === "apps") continue;
      const yol = `${dizin}/${ad}`;
      if (statSync(kok + yol).isDirectory()) { tara(yol); continue; }
      if (!/\.tsx?$/.test(ad)) continue;
      if (yol === "lib/users.ts") continue; // kapının kendi evi
      const s = readFileSync(kok + yol, "utf8");
      if (/\bgetUsersData\b/.test(s)) bulunan.push(yol);
    }
  };
  tara("app");
  tara("lib");

  check(bulunan.length > 0, "tarama çalıştı (en az bir dosya bulundu)");
  const isaretsiz = bulunan.filter((y) => !/KAPI-DISI: BLOB-ASLI/.test(readFileSync(kok + y, "utf8")));
  check(isaretsiz.length === 0,
    `kapı dışı her okuma gerekçesini yazmış (işaretsiz: ${isaretsiz.join(", ") || "yok"})`);

  /*
   * İşaretli dosyalar SAYICA az kalmalı. Bu bir üslup kuralı değil: işaret
   * "Blob'un kendisine bakmam gerekiyor" demek ve bunun tek meşru sebebi
   * Blob'u AYNAYLA KARŞILAŞTIRMAK (kayma taraması, göç aracı). Üçüncü bir
   * dosya çıktığında testin kırılması, o dosyanın gerçekten karşılaştırma
   * yapıp yapmadığını birinin sormasını sağlıyor.
   */
  check(bulunan.length <= 2, `kapı dışı okuma yalnız karşılaştırma araçlarında (${bulunan.length})`);
}

/* --- 3. Yaşam döngüsü ve jeton okumaları kapıdan geçiyor -------------- */
/*
 * En pahalı üç okuma tek tek kilitleniyor. Yukarıdaki tarama "işaretsiz
 * kullanım yok" diyor; bu bölüm "bu dosyalar okumayı BIRAKMADI, kapıya
 * taşıdı" diyor. İkisi ayrı iddia: birinin `getUsersData`yı silip yerine
 * hiçbir şey koymaması da taramayı geçerdi.
 */
for (const [yol, ne] of [
  ["../lib/account-lifecycle.ts", "kalıcı silme süpürgesi"],
  ["../app/api/reset-password/token/route.ts", "şifre sıfırlama jetonu"],
  ["../app/api/account/email/verify/route.ts", "e-posta doğrulama jetonu"],
  ["../app/api/cron/reminders/route.ts", "bildirim onayı"],
  ["../app/api/admin/accounts/route.ts", "operatör konsolu"],
] as const) {
  const s = read(yol);
  check(/listUsers/.test(s), `${ne} kapıdan okuyor`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
