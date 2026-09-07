import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: yedek işi.
 *
 * Bu uç depodaki HER ŞEYİ okuyup yazıyor ve tek `del` çağıran zamanlanmış iş.
 * Rota birim testi koşulamadığı için üç şey kaynak düzeyinde kilitleniyor:
 * kimin çağırabildiği, neyin kopyalandığı ve neyin silinebildiği.
 */

/*
 * YORUMLAR AYIKLANIYOR. Olumsuz bir iddia, yasakladığı kalıbı ANLATAN yorum
 * metnine takılıp boşuna kırmızı yanabiliyor — bu depoda birkaç kez oldu.
 * Bir kuralın varlığını kanıtlarken koda bakmalı, kodun anlatımına değil.
 */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const rota = readFileSync(new URL("../app/api/cron/backup/route.ts", import.meta.url), "utf8");
const lib = readFileSync(new URL("../lib/backup.ts", import.meta.url), "utf8");

/* --- Kimin çağırabildiği ------------------------------------------------- */
/*
 * KAPALI DÜŞMELİ. `secret && …` yazılsaydı, `CRON_SECRET` tanımsızken denetim
 * tamamen atlanırdı — ve bu uçta bedeli, tek bir HTTP çağrısıyla deponun
 * tamamının kopyalanması olurdu. Aynı hata `/api/cron/reminders`te gerçekten
 * yapılmıştı.
 */
check(/if \(!secret \|\| auth !== `Bearer \$\{secret\}`\)/.test(rota), "sır yoksa REDDEDİYOR");
check(!/if \(secret &&/.test(rota), "`secret &&` kalıbı yok (açık düşmüyor)");
check(!isPublicPath("/api/cron/backup"), "yedek ucu oturumsuz açık DEĞİL");

/* --- Neyin kopyalandığı -------------------------------------------------- */
/*
 * Yedeğin yedeği alınırsa her koşu bir öncekinin tamamını kopyalar ve depo
 * katlanarak büyür — yedeğin kendisi arızaya dönüşür.
 */
check(/backupSources\(/.test(rota), "kaynaklar süzgeçten geçiyor (yedeğin yedeği yok)");
check(/allowOverwrite: true/.test(rota), "aynı günün ikinci koşusu ikizlemiyor");

/* --- Neyin silinebildiği ------------------------------------------------- */
/*
 * Silme kararı ROTADA HESAPLANMAMALI: kural (`backups/` dışına dokunma,
 * tanınmayan damgayı silme, en az bir görüntü tut) `lib/backup.ts`te ve
 * birim testiyle kilitli. Rota yalnız planı uygular.
 */
check(/planRetention\(/.test(rota), "silme planı kütüphaneden geliyor");
check(/for \(const p of plan\.remove\)/.test(rota), "yalnız plandaki yollar siliniyor");
{
  // `del(` YALNIZ plan döngüsünün içinde çağrılmalı.
  const delCagrilari = [...rota.matchAll(/\bawait del\(/g)];
  check(delCagrilari.length === 1, `tek bir silme çağrısı var (${delCagrilari.length})`);
  const iDongu = rota.indexOf("for (const p of plan.remove)");
  check(iDongu > 0 && delCagrilari[0].index! > iDongu, "silme çağrısı plan döngüsünün İÇİNDE");
}
{
  /*
   * ASIL KİLİT: kopyalama başarısızsa silme YAPILMAZ. Depo erişimi bozukken
   * eski görüntüleri silmek, elde hiçbir yedek bırakmamak olurdu — yedeğin
   * kendisinin yol açabileceği en ağır zarar.
   */
  check(/if \(summary\.copied > 0 && summary\.verifyFailed\.length === 0\) \{/.test(rota),
    "silme yalnız kopyalama başarılıysa");
  const iKosul = rota.indexOf("if (summary.copied > 0");
  const iDel = rota.indexOf("await del(");
  check(iKosul > 0 && iDel > iKosul, "silme çağrısı o koşulun içinde");
}

/* --- TEMİZLİK YEDEĞE BAĞLI DEĞİL --------------------------------------- */
{
  /*
   * 30 günü dolmuş verinin kalıcı silinmesi (`sweepExpired`) bu işin son
   * adımı — ama yedeğin BAŞARISINA bağlı değil. İlk hâlinde çağrı yedeğin
   * `try` bloğunun içindeydi: depo listelenemediğinde akış doğrudan `catch`e
   * atlıyor ve temizlik hiç çağrılmıyordu. Yani ilgisiz bir altyapı arızası,
   * kullanıcının silme talebini süresiz askıya alıyordu — sessizce.
   *
   * İddia konumla kuruluyor: `sweepExpired` çağrısı, yedek bloğunu kapatan
   * `catch`ten SONRA gelmeli.
   */
  const iYedekCatch = rota.indexOf("yedekHatasi = (e as Error).message;");
  const iSweep = rota.indexOf("await sweepExpired(");
  check(iYedekCatch > 0, "yedek bloğunun kendi `catch`i var");
  check(iSweep > iYedekCatch, "temizlik, yedeğin catch'inden SONRA — yani her hâlükârda koşuyor");
  /*
   * Ve temizlik yedekten SONRA: silinen verinin o günkü görüntüsü alınmış
   * olsun. Sıranın iki yönü de kural.
   */
  check(iSweep > rota.indexOf("await put(snapshotPath("), "temizlik kopyalamadan SONRA");
  /* Temizliğin kendi hatası yanıtı düşürmüyor, özete yazılıyor. */
  check(/sweep\.failed\.push\(`sweep:/.test(rota), "temizlik hatası özete yazılıyor");
  /* Her koşuda satır: "sıfır" ile "hiç koşmadı" ayrılabilsin. */
  const iTemizlikLog = rota.indexOf("`[temizlik] ${stamp}");
  check(iTemizlikLog > 0, "temizlik günlüğe yazılıyor");
  const oncekiSatir = rota.slice(rota.lastIndexOf("\n", rota.lastIndexOf("console.log(", iTemizlikLog)), iTemizlikLog);
  check(!/if \(/.test(oncekiSatir), "temizlik günlüğü KOŞULSUZ (sıfır de yazılıyor)");
}

/* --- YAZDIĞINI GERİ OKU --------------------------------------------------- */
{
  /*
   * `put`ın dönmesi, dosyanın okunabilir olduğunu KANITLAMIYOR. Bu depoda tam
   * olarak bu tür bir sessizlik bir kez yaşandı: iş her gün 200 dönüyordu ama
   * `private` depoya düz `fetch` attığı için hiçbir dosya kopyalanmıyordu —
   * aylarca, ve dışarıdan bakınca yedek vardı.
   */
  check(/verifySample\(yazilanlar\)/.test(rota), "yazılan görüntülerden örnek geri okunuyor");
  check(/JSON\.parse\(metin\)/.test(rota),
    "içerik AYRIŞTIRILIYOR (yalnız boy bakmak yarım dosyayı sağlam sayardı)");
  check(/summary\.verifyFailed\.push/.test(rota), "başarısız doğrulama kayda geçiyor");
  /*
   * DOĞRULAMA DÜŞTÜYSE ESKİ GÖRÜNTÜLER SİLİNMEZ: yazdığını geri okuyamayan
   * bir koşunun elindekini atmaya hakkı yok.
   */
  check(/if \(summary\.copied > 0 && summary\.verifyFailed\.length === 0\)/.test(rota),
    "doğrulama düştüyse saklama temizliği yapılmıyor");
  const iDogrula = rota.indexOf("verifySample(yazilanlar)");
  check(iDogrula > 0 && iDogrula < rota.indexOf("for (const p of plan.remove)"),
    "doğrulama silmeden ÖNCE");
  check(/GERİ OKUMA BAŞARISIZ/.test(rota), "başarısızlık günlükte uyarı seviyesinde");
}

/* --- AYNA TARAMASI ------------------------------------------------------- */
{
  /*
   * `/api/admin/drift` tam denetimi yapıyor ama yalnız ELLE, yalnız giriş
   * yapmış founder'ın kendi ağaçları için, ve o düğmeyi kimse görmüyor.
   * Günlük ucuz tarama, "ayrışma var ama kimsenin haberi yok" hâlini
   * ortadan kaldırıyor.
   */
  check(/await scanMirror\(/.test(rota), "günlük ayna taraması koşuyor");
  check(/mirrorScanPossible\(\)/.test(rota), "Supabase yoksa tarama denenmiyor");
  check(/console\.warn\(satir\)/.test(rota), "ayrışma UYARI seviyesinde");
  /*
   * TARAMA ONARMIYOR. Onarım Blob'u kaynak alıp Postgres'te kayıt SİLİYOR;
   * kimsenin bakmadığı bir zamanlanmış işin böyle bir yetkisi olmamalı.
   */
  const scan = kodu(readFileSync(new URL("../lib/mirror-scan.ts", import.meta.url), "utf8"));
  for (const yasak of ["dbUpsertPeople", "dbDeletePeople", "dbReplacePeople", "saveFamilyData"]) {
    check(!new RegExp(yasak).test(scan), `tarama ${yasak} ÇAĞIRMIYOR (onarmıyor)`);
  }
  /*
   * SALT BLOB. `getFamilyData` Postgres'i öne alıyor ve ağaç orada varsa
   * Blob'a hiç inmiyor — yani ayna kendisiyle karşılaştırılır ve tarama her
   * ağaç için "eşit" derdi. Bir denetim aracının verebileceği en kötü yanıt.
   */
  check(/readFamilyFromBlob\(/.test(scan), "kaynak doğrudan Blob'dan okunuyor");
  check(!/getFamilyData\(/.test(scan), "Postgres'i öne alan okuyucu KULLANILMIYOR");
  /* Yedekle aynı iki kural: bütçe ve döndürme. */
  check(/butce\.spent\(\)/.test(scan), "tarama bütçeye bakıyor");
  check(/rotateForDay\(/.test(scan), "tarama listesi günlük döndürülüyor");
}

/* --- Kütüphanedeki kurallar hâlâ yerinde -------------------------------- */
check(/if \(s === null\) continue;/.test(lib), "tanınmayan damga silinmiyor");
check(/Number\.isFinite\(keep\)/.test(lib), "sayı olmayan `keep` hepsini silmeye dönüşmüyor");
check(/export const BACKUP_PREFIX = "backups\/";/.test(lib), "yedekler tek bir kökte");

/* --- ÖZEL DEPO: blob URL'ine düz `fetch` ATILMAZ ----------------------- */
/*
 * Bu depo `private`. İlk sürüm `fetch(b.downloadUrl ?? b.url)` kullanıyordu
 * ve her istek yetkisiz dönüyordu: `failed` artıyor, `copied` sıfırda
 * kalıyor, iş yine de 200 dönüyordu. Yedek hiç alınmıyordu ve dışarıdan
 * bakınca çalışıyor görünüyordu — canlıda Blob deposunda `backups/`
 * klasörünün hiç oluşmamasıyla anlaşıldı.
 *
 * Doğru yol `get(pathname, { access: "private" })` ve deponun geri kalanı
 * (`lib/blob.ts`, `lib/members.ts`, `lib/trees.ts`) baştan beri onu
 * kullanıyor. Aynı kural ELLE yedek betiği için de geçerli: o da aynı hatayı
 * taşıyordu, yani belgelenen yedek komutu da çalışmıyordu.
 */
const betik = readFileSync(new URL("../scripts/backup.mjs", import.meta.url), "utf8");
/*
 * YORUMLAR AYIKLANIYOR. İlk yazdığımda olumsuz iddia, yasakladığı kalıbı
 * ANLATAN yorum metnine takılıp boşuna kırmızı yanıyordu — bu depoda daha
 * önce de olan bir tuzak (import satırına eşleşen kapı testleri). Bir kuralın
 * varlığını kanıtlarken koda bakmalı, kodun anlatımına değil.
 */

for (const [ad, kaynak] of [["rota", kodu(rota)], ["betik", kodu(betik)]] as const) {
  check(/await get\(/.test(kaynak), `${ad}: özel depo okuyucusu (get) kullanılıyor`);
  check(/access: "private"/.test(kaynak), `${ad}: access "private" veriliyor`);
  check(!/fetch\((?:b\.)?(?:downloadUrl|url)/.test(kaynak),
    `${ad}: blob URL'ine düz fetch YOK`);
}

/* --- SONUÇ GÜNLÜĞE YAZILIYOR ------------------------------------------- */
/*
 * Bu işi cron tetikliyor; yanıt gövdesini okuyan bir insan ya da istemci YOK.
 * Sağlayıcı günlüğünde yalnız durum kodu göründüğü için "200 döndü ama sıfır
 * dosya kopyaladı" hâli tamamen görünmezdi: hata yok, uyarı yok, yedek de
 * yok. Bu depoda aynı sessizlik türü bir kez Postgres aynasını aylarca ölü
 * tuttu — orada da her şey "başarılı" görünüyordu.
 */
check(/console\.(log|warn)\(/.test(rota), "özet günlüğe yazılıyor");
check(/if \(summary\.copied === 0\) console\.warn\(/.test(rota),
  "sıfır kopya UYARI seviyesinde (200 içinde saklı başarısızlık)");
check(/console\.error\(`\[yedek\]/.test(rota), "sert hata da günlüğe düşüyor");
{
  // Özet, kararı verdiren sayıları taşımalı — yoksa günlük yine okunamaz.
  const iOzet = rota.indexOf("const satir =");
  const ozet = rota.slice(iOzet, rota.indexOf("console.warn(`${satir}", iOzet));
  for (const alan of ["copied", "failed", "removed", "bytes"])
    check(ozet.includes(`${alan}`), `günlük satırı ${alan} taşıyor`);
}

/* --- Zamanlama tanımlı mı ----------------------------------------------- */
/*
 * Rota yazılıp cron'a bağlanmazsa hiç koşmaz; "yedek var" sanmak, yedek
 * olmamasından kötüdür.
 */
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
  crons?: Array<{ path: string; schedule: string }>;
};
const is = (vercel.crons ?? []).find((c) => c.path === "/api/cron/backup");
check(!!is, "yedek işi vercel.json'da zamanlanmış");
check(!!is && /^\S+ \S+ \S+ \S+ \S+$/.test(is.schedule), `zamanlama geçerli biçimde (${is?.schedule})`);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
