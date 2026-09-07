import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: hatırlatma işi ve kalıcı silme sırası (madde E1/E5/E6/E9).
 *
 * Zamanlanmış işlerin ortak arıza türü SESSİZLİK: yanıtı okuyan kimse yok,
 * durum kodu 200, ve iş aslında hiçbir şey yapmıyor. Yedek işinin kendi
 * kapısı var (`backup-gate`); burası hatırlatma işi, hız sınırının düşüşü ve
 * ağaç silmenin SIRASI için.
 *
 * Bu dosyalar birim testi koşamıyor (hepsinde çalışma anında `@/…` değer
 * içe aktarımı var), bu yüzden kurallar kaynak düzeyinde kilitleniyor.
 */

const rota = kodu(read("../app/api/cron/reminders/route.ts"));
const trees = kodu(read("../lib/trees.ts"));
const lifecycle = kodu(read("../lib/account-lifecycle.ts"));
const rate = kodu(read("../lib/rate-limit.ts"));

/* ══ 1. Kimin çağırabildiği ═══════════════════════════════════════════════ */
/*
 * KAPALI DÜŞMELİ. Bu hata bir kez gerçekten yapıldı: koşul `secret && …`
 * idi, yani `CRON_SECRET` tanımsızken denetimin TAMAMI atlanıyordu — ve o
 * değişkenin tanımsız olması varsayılan durumdu. Herhangi biri `Bearer x`
 * ile bütün hesaplara posta gönderten işi tetikleyebiliyordu.
 */
check(/if \(!secret \|\| auth !== `Bearer \$\{secret\}`\)/.test(rota), "sır yoksa REDDEDİYOR");
check(!/if \(secret &&/.test(rota), "`secret &&` kalıbı yok (açık düşmüyor)");
check(!isPublicPath("/api/cron/reminders"), "hatırlatma ucu oturumsuz açık DEĞİL");

/* ══ 2. Süre bütçesi ve döndürme — açlık kalıcı olmasın ═══════════════════ */
/*
 * İki döngü de hesap sayısıyla büyüyor, işlevin ömrü sabit. Bütçe yokken iş
 * ORTADA kesiliyordu ve liste hep aynı yerden başladığı için hep AYNI
 * hesaplar işleniyordu: kuyruktakiler hatırlatmayı HİÇ almıyordu, üstelik
 * hiçbir iz bırakmadan.
 *
 * Kural: her hesap döngüsü hem bütçeye bakmalı hem de DÖNDÜRÜLMÜŞ liste
 * üzerinde dönmeli. Biri olmadan öbürü yetmez — bütçesiz döndürme kesilmeyi
 * çirkinleştirir, döndürmesiz bütçe açlığı kalıcı bırakır.
 */
{
  const dongular = [...rota.matchAll(/for \(const u of [^{]*\{/g)];
  check(dongular.length >= 2, `iki hesap döngüsü var (${dongular.length})`);
  let butcesiz = 0, dondurmesiz = 0;
  for (const d of dongular) {
    const bas = d[0];
    if (!/rotateForDay\(|of sira\b/.test(bas)) dondurmesiz++;
    const govde = rota.slice(d.index!, d.index! + 900);
    if (!/butce\.spent\(\)/.test(govde)) butcesiz++;
  }
  check(dondurmesiz === 0, `her hesap döngüsü döndürülmüş liste üzerinde (${dondurmesiz} değil)`);
  check(butcesiz === 0, `her hesap döngüsü bütçeye bakıyor (${butcesiz} bakmıyor)`);
}
check(/const sira = rotateForDay\(users, today\)/.test(rota), "ilk döngünün listesi döndürülüyor");
/*
 * Tek bir büyük ağaç bütçenin tamamını yiyebilir; iç döngü de bakmalı.
 * `break` (`continue` değil): toplanan jetonlar aşağıda yine YAZILMALI,
 * yoksa gönderilmiş sorular işaretlenmemiş kalır ve yarın tekrar sorulur.
 */
{
  const i = rota.indexOf("for (let i = 0; i < data.people.length; i++)");
  check(i > 0, "kişi döngüsü bulundu");
  check(/if \(butce\.spent\(\)\) break;/.test(rota.slice(i, i + 400)),
    "kişi döngüsü bütçe dolunca BREAK ediyor (jetonlar yine yazılsın)");
  const iYaz = rota.indexOf("if (yeniJetonlar.size > 0)");
  check(iYaz > i, "jeton yazımı kişi döngüsünden SONRA — break onu atlamıyor");
}
/* Bütçe `maxDuration`ın ALTINDA olmalı: özeti yazacak süre kalsın. */
{
  const md = /maxDuration = (\d+)/.exec(rota);
  const bm = /BUDGET_MS = ([\d_]+)/.exec(rota);
  check(!!md && !!bm, "iki sınır da tanımlı");
  const saniye = Number(bm![1].replace(/_/g, "")) / 1000;
  check(saniye < Number(md![1]), `bütçe (${saniye}sn) maxDuration'ın (${md![1]}sn) altında`);
}

/* ══ 3. Günlük — "sıfır" ile "hiç koşmadı" ayrılabilmeli ═════════════════ */
check(/console\.(log|warn)\(/.test(rota), "özet günlüğe yazılıyor");
{
  const i = rota.indexOf("const satir =");
  check(i > 0, "özet satırı var");
  const ozet = rota.slice(i, rota.indexOf("return NextResponse.json(ozet)", i));
  for (const alan of ["considered", "sent", "newsletters", "asked", "contacted"])
    check(ozet.includes(alan), `günlük satırı ${alan} taşıyor`);
  /*
   * `skipped > 0` UYARI seviyesinde: iş 200 dönüyor ama bazı hesaplar bugün
   * hiç işlenmedi. Büyüme sınırına gelindiğinin tek görünür işareti bu.
   */
  check(/if \(skipped > 0\) console\.warn\(/.test(ozet), "atlanan hesap UYARI seviyesinde");
}

/* ══ 4. AĞAÇ SİLME SIRASI: önce depo, kayıt en son ═══════════════════════ */
/*
 * `purgeAccount` bu kuralı yazıyor ve gerekçesi dosya başında: yarıda kalan
 * silme bir sonraki koşuda kaldığı yerden devam edebilsin.
 *
 * `purgeTree` TERSİNİ yapıyordu — kayıt satırını siliyor, sonra depoyu
 * temizliyordu. Depo temizliği en iyi çaba ve yarıda kalabilir; kayıt önce
 * silindiğinde geriye YETİM VERİ kalıyordu: `treeId` artık hiçbir kayıtta
 * yok, `duePurgeTrees` onu bir daha görmüyor, kimse bir daha denemiyor.
 * Kullanıcıya "sildik" denmiş, kişiler depoda duruyor.
 */
{
  const i = trees.indexOf("export async function purgeTree(");
  check(i > 0, "purgeTree bulundu");
  const govde = trees.slice(i, trees.indexOf("\n}", i));
  const iDepo = govde.indexOf("purgeTreeStorage(treeId)");
  const iKayit = govde.indexOf("writeRegistry(");
  check(iDepo > -1 && iKayit > -1, "iki adım da var");
  check(iDepo < iKayit, "DEPO önce, kayıt sonra");
  /*
   * Ve depo tam temizlenmediyse kayıt DURUYOR — bir sonraki koşu yeniden
   * denesin diye. Bu erken dönüş olmadan sıra tek başına yetmez.
   */
  check(/if \(failed\.length > 0\) return failed;/.test(govde),
    "depo yarım kaldıysa kayıt kapatılmıyor (tekrar denenebilsin)");
  check(govde.indexOf("if (failed.length > 0) return failed;") < iKayit,
    "erken dönüş kayıt yazımından ÖNCE");
}
/*
 * Ve yarım kalan silme "silindi" diye SAYILMIYOR: günlükte bitmiş görünen
 * ama her gün yeniden denenen bir iş, sayının kendisini yalana çevirirdi.
 */
{
  const i = lifecycle.indexOf("for (const t of dueTrees)");
  const govde = lifecycle.slice(i, i + 500);
  check(/if \(kalan\.length === 0\) ozet\.purgedTrees\+\+;/.test(govde),
    "yalnız TAM biten silme sayılıyor");
}

/* ══ 5. Hız sınırının düşüşü sessiz değil ════════════════════════════════ */
/*
 * Paylaşımlı (Postgres) katman çalışmadığında örnek-içi kovaya düşülüyor —
 * doğru karar, ama iz bırakmadan yapıldığında kalıcı bir bozulma (RPC
 * kaldırılmış, şema değişmiş, anahtar dönmüş) hiç fark edilmiyordu: sınır
 * sessizce ÖRNEK BAŞINA sınıra iniyor ve korunan global kaynak açıkta kalıyor.
 */
{
  const i = rate.indexOf("export async function rateLimitShared");
  const govde = rate.slice(i, rate.indexOf("\n}", i));
  check(!/\} catch \{/.test(govde), "boş `catch {}` yok");
  check(/sharedFallbackWarn\(/.test(govde), "düşüş günlüğe yazılıyor");
  check(/return rateLimit\(key, opts\);/.test(govde), "düşünce istek yine de REDDEDİLMİYOR");
}
/*
 * Uyarı KISILMIŞ olmalı: katman bozulduğunda her istek buradan geçer ve
 * kısılmamış bir uyarı arızayı görünür kılmak yerine günlüğü kullanılamaz
 * hâle getirir.
 */
{
  const i = rate.indexOf("function sharedFallbackWarn");
  const govde = rate.slice(i, rate.indexOf("\n}", i));
  check(/if \(now - sonUyari < UYARI_ARALIGI_MS\) return;/.test(govde), "uyarı kısılmış");
  check(/console\.warn\(/.test(govde), "uyarı `warn` seviyesinde");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
