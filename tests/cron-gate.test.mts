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
  for (const alan of ["considered", "sent", "newsletters", "asked", "contacted", "weekly"])
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

/* ══ 6. Sağlık ucu DIŞARIDAN izlenebilir ═════════════════════════════════ */
/*
 * Bu uç yalnız oturum kabul ediyordu. Her sağlık izleme aracı (UptimeRobot,
 * bir cron, bir kontrol paneli) oturumsuz çağırır ve 401 alırdı — yani "her
 * şey çalışıyor mu" sorusunu ancak birinin aklına gelip elle bakması hâlinde
 * yanıtlayabilen bir sağlık ucu, yani sağlık ucu değil.
 */
{
  const health = kodu(read("../app/api/health/route.ts"));
  check(/auth_ === `Bearer \$\{secret\}`/.test(health), "makine kimliği kabul ediliyor");
  /*
   * KAPALI DÜŞÜYOR: sır tanımsızsa bu yol yok, yalnız oturum kalıyor.
   * "Sır yoksa serbest" davranışı ucu herkese açardı.
   */
  check(/const makine = !!secret &&/.test(health), "sır yoksa makine yolu KAPALI");
  check(/if \(!makine\) \{/.test(health), "makine değilse oturum denetimi sürüyor");
  check(/canManage\(session\.user\.role\)/.test(health), "oturum yolunda yönetici şartı duruyor");
  /* Sır sorgu dizesinden okunmuyor: erişim günlüklerine ve geçmişe düşerdi. */
  check(!/searchParams\.get\("token"\)/.test(health), "sır sorgu dizesinden alınmıyor");

  /*
   * AYNA SAĞLIK HESABINA KATILIYOR. Eskiden katılmıyordu ve gerekçesi
   * "henüz uygulamaya bağlı değil (Faz 2)" idi; o gerekçe geçersiz — okuma
   * yolu artık ÖNCE Postgres'e bakıyor ve yazma yolu iki yere birden yazıyor.
   * Ayna ölüyken uygulama Blob'a düşerek çalışmaya devam ediyor (kullanıcı
   * bir şey fark etmiyor) ama her yazma aynadan kaçıyor ve ayrışma birikiyor.
   */
  check(/const healthy = blob\.ok && cloudinary\.ok && \(!aynaGerekli \|\| supabase\.ok\)/.test(health),
    "ayna yapılandırılmışsa sağlık hesabına katılıyor");
  check(/isSupabaseConfigured\(\)/.test(health),
    "yapılandırılmamış kurulumda ayna eksikliği arıza sayılmıyor");
  /* İki zamanlanmış iş de buna bağlı; yokluğu hiçbir hata üretmiyor. */
  check(/CRON_SECRET: !!secret/.test(health), "cron sırrının varlığı yanıtta görünüyor");
}

/* ══ 7. HAFTALIK SORU SERİSİ (madde 39) ══════════════════════════════════
 *
 * Bu dal, günlük bir işin içinde yaşayan HAFTALIK bir gönderim. Üç şeyi
 * birden bozma potansiyeli var: izin (tekrarlayan posta), bütçe (ek G/Ç ve
 * ek posta) ve kadans (haftada bir). Üçü de burada kilitleniyor.
 */

/* --- 7a. Tek cron yuvası: kadans ZAMANLAMADA değil, İŞİN İÇİNDE ---------- */
/*
 * Vercel Hobby planında proje başına cron sayısı sınırlı ve iki yuva da dolu
 * (`reminders`, `backup`). Haftalık iş için ÜÇÜNCÜ bir zamanlama yok; bu
 * yüzden günlük iş haftada bir gün ek olarak seri postalarını da atıyor —
 * aylık bültenin `ayinIlkGunu` koşuluyla birebir aynı çözüm.
 *
 * Kapı kalkarsa "haftalık" seri HER GÜN gönderir: yedi kat posta, yedi kat
 * jeton, ve `MAX_REQUESTS` tavanı bir haftada dolar.
 */
check(/const hikayeGunu = today\.getDay\(\) === 0;/.test(rota), "haftanın günü kapısı var (pazar)");
check(/const ayinIlkGunu = today\.getDate\(\) === 1;/.test(rota),
  "bültenin ayın-ilk-günü kapısı duruyor (aynı kalıbın atası)");
{
  const iKapi = rota.indexOf("if (!hikayeGunu || kalanHafta <= 0) continue;");
  const iGonder = rota.indexOf("await issueWeekly(");
  check(iKapi > -1, "haftalık dal gün kapısıyla başlıyor");
  check(iKapi > -1 && iGonder > iKapi, "talep YALNIZ kapıdan sonra açılıyor");
}

/* --- 7b. İZİN: mevcut `canEmailContact`, yeni bir kavram DEĞİL ----------- */
/*
 * Seri, `planAsk`ın tek seferlik onay sorusundan farklı olarak TEKRARLAYAN
 * bir posta. Tam da bu yüzden kendine ait bir izin kavramı UYDURULMAMALI:
 * ikinci bir onay alanı, onayı ikiye böler ve iki kopya er geç ayrışır —
 * ayrıştığı gün onay vermemiş birine haftalarca posta gider.
 */
{
  const iIzin = rota.indexOf("if (!canEmailContact(kisi)) continue;");
  const iSeri = rota.indexOf("const seri = seriOf.get(kisi.id);");
  check(iIzin > -1 && iSeri > iIzin, "haftalık dal izin kapısının ARDINDA");
  check(!/seriesConsent|weeklyConsent|notifyStories/.test(rota), "yeni izin kavramı uydurulmamış");
  /* Çıkış bağlantısı bu postada da var — çıkışsız tekrarlayan posta olmaz. */
  const iNot = rota.indexOf("Bu haftalık soruları durdurmak için:");
  check(iNot > -1, "haftalık postada çıkış bağlantısı var");
  check(rota.slice(iNot, iNot + 200).includes("contact/cikis/${unsub}"),
    "çıkış bağlantısı imzalı jetonla kuruluyor");
  const iUnsub = rota.indexOf("if (!unsub) continue;");
  check(iUnsub > -1 && iNot > iUnsub, "çıkış jetonu üretilemiyorsa haftalık posta da gitmiyor");
}

/* --- 7c. BÜTÇE ve DÖNDÜRME: dal miras alıyor ---------------------------- */
/*
 * Yeni dal ayrı bir hesap döngüsü AÇMIYOR; ikinci döngünün içinde yaşıyor ve
 * onun döndürülmüş listesini, bütçe denetimini ve kişi döngüsündeki
 * `break`ini olduğu gibi devralıyor. Üçüncü bir döngü, her ağacı bir kez
 * daha okumak demek olurdu.
 *
 * Devraldığını KANITLAMAK gerekiyor: dal, kişi döngüsünün İÇİNDE ve o
 * döngü bütçeye bakıyor (yukarıda 2. bölüm).
 */
{
  const iDongu = rota.indexOf("for (let i = 0; i < data.people.length; i++)");
  const iDal = rota.indexOf("const haftalik = planWeekly(");
  const iSon = rota.indexOf("if (yeniJetonlar.size > 0)");
  check(iDongu > -1 && iDal > iDongu && iDal < iSon, "haftalık dal kişi döngüsünün içinde");
}
/*
 * Seri deposu ağaç başına TEK KEZ ve yalnız o gün okunuyor. Kişi döngüsünün
 * içine düşerse yüz kişilik bir ağaçta yüz blob isteği olur ve bütçe bu
 * işin geri kalanına yetmez.
 */
{
  const iOku = rota.indexOf("seriler = await readSeries(u.id);");
  const iDongu = rota.indexOf("for (let i = 0; i < data.people.length; i++)");
  check(iOku > -1 && iOku < iDongu, "seri deposu kişi döngüsünden ÖNCE okunuyor");
  check(/if \(hikayeGunu\) \{/.test(rota), "öbür altı gün hiç okunmuyor");
  check((rota.match(/readSeries\(/g) ?? []).length === 1, "tek okuma noktası");
}
/* Koşu başına ağaç başına tavan — `kalanSoru`nun eşi, aynı gerekçe. */
check(/let kalanHafta = \d+;/.test(rota), "koşu başına haftalık posta tavanı var");
check(/kalanHafta--;/.test(rota), "tavan yalnız gönderim başına düşüyor");

/* --- 7d. İŞARET YALNIZ GÖNDERİM BAŞARILIYSA ----------------------------- */
/*
 * `planAsk` dalındaki kuralın aynısı ve aynı sebeple: damga önce konsaydı,
 * düşen bir gönderim kişinin HİÇ GÖRMEDİĞİ bir soruyu "sorulmuş" sayardı ve
 * o soru bir daha hiç sorulmazdı — bankadan sessizce bir soru eksilirdi.
 *
 * Talep ise gönderimden ÖNCE açılmak zorunda: bağlantı postanın içinde.
 * Sıra bu yüzden "aç → gönder → işaretle" ve düşen talebi bir sonraki koşu
 * `issueWeekly` içinde kapatıyor.
 */
{
  const iAc = rota.indexOf("await issueWeekly(");
  const iGonder = rota.indexOf('subject: "🌳 Bu haftanın sorusu"');
  const iKosul = rota.indexOf("if (haftaPosta.sent) {");
  const iIsaret = rota.indexOf("await markWeeklySent(");
  check(iAc > -1 && iGonder > iAc, "talep gönderimden ÖNCE açılıyor (bağlantı postada)");
  check(iKosul > -1 && iGonder < iKosul, "işaret gönderimden SONRA");
  check(iKosul > -1 && iIsaret > iKosul, "işaret `haftaPosta.sent` koşulunun İÇİNDE");
  check(/if \("error" in acilan\) continue;/.test(rota), "talep açılamadıysa posta gitmiyor");
}

/* --- 7e. Karar SAF katmanda -------------------------------------------- */
/*
 * Hangi hafta, hangi soru, seri bitti mi — hepsi `lib/story-series.ts`te ve
 * orada birim testi koşuluyor. Cron kendi kuralını yazsaydı ikinci bir
 * kopya doğardı; `planAsk`/`planSubmit` ile aynı disiplin.
 */
check(/planWeekly\(seri, subjectFromPerson\(kisi, data\.people\), today\)/.test(rota),
  "kadans kararı saf katmanda");
check(/if \(haftalik\.kind !== "gonder"\) continue;/.test(rota), "yalnız `gonder` dalı gönderiyor");
check(!/weekIndex\(|SERIES_WEEKS|\.asked\.length/.test(rota), "cron kendi kadans kuralını yazmıyor");
/* Gizlilik işareti depoya taşınıyor — kapı orada (bkz. `tests/story-gate`). */
check(/\{ id: kisi\.id, confidential: kisi\.confidential \}/.test(rota),
  "cron kişi işaretini depoya taşıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
