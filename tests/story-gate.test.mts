import { readFileSync } from "node:fs";
import { PUBLIC_EXACT, PUBLIC_PREFIXES, isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: hikâye talebi (madde 49/50).
 *
 * Bu maddenin tamamı tek bir cümleye dayanıyor: GİRİŞSİZ yazma, ailenin
 * kaydına DOĞRUDAN girmez. Bağlantı bir kez iletildiğinde kimin elinde
 * olduğu bilinemez — iletilmiş bir posta, ortak kullanılan bir telefon, bir
 * ekran görüntüsü. Kuyruk o belirsizliği kaydın DIŞINDA tutuyor.
 */

const store = kodu(read("../lib/story-store.ts"));
const acik = kodu(read("../app/api/hikaye/[treeId]/route.ts"));
const sahip = kodu(read("../app/api/family/stories/route.ts"));
const sayfa = read("../app/hikaye/[treeId]/page.tsx");
const pencere = kodu(read("../components/StoriesDialog.tsx"));
const hub = kodu(read("../components/ShareHubDialog.tsx"));
const ws = kodu(read("../app/tree/Workspace.tsx"));

/* --- 1. KAPI DEPODA, çağıranda değil ------------------------------------ */
/*
 * `lib/gathering-store.ts`teki ilkenin aynısı: girişsiz yazma tek bir
 * işlevden geçiyor ve o işlev jetonu KENDİ doğruluyor. Rotaya "önce jetonu
 * kontrol et" diye güvenmek, bir gün o kontrolü atlayan ikinci bir çağıranın
 * kapıyı ardına kadar açması demek.
 */
check(/export async function submitContribution\(/.test(store), "girişsiz yazma tek işlevde");
check(/const request = eslesen\(box, token\);/.test(store), "yazma işlevi jetonu KENDİ çözüyor");
check(/submitContribution\(treeId, token/.test(acik), "rota yazmayı depoya devrediyor");
check(!/box\.contributions\.push/.test(acik), "rota kuyruğa doğrudan yazmıyor");

/* --- 2. Jetonun ÖZETİ saklanıyor ---------------------------------------- */
/*
 * Deponun okunması, açık duran bütün yazma bağlantılarını ele geçirmeye
 * yetmemeli.
 */
check(/tokenHash: sha256\(token\)/.test(store), "kayda özet yazılıyor");
check(!/token,\s*$/m.test(store.split("createRequest")[1] ?? ""), "ham jeton kayda girmiyor");
check(/sonuc: \{ request, token \}/.test(store), "ham jeton yalnız üretimde dönüyor");
check(/link: `\$\{SITE_URL\}\/hikaye\//.test(sahip), "bağlantı yalnız oluşturma yanıtında");
check(/tokenHash: undefined/.test(sahip), "listeleme özeti dışarı vermiyor");

/* --- 3. BOŞ ÖZET asla eşleşmiyor ---------------------------------------- */
/*
 * `gathering-store`taki boş jeton tuzağının aynısı: bozuk tek bir kayıt,
 * bütün ağaç için açık kapı olurdu.
 */
check(/if \(!t\) return null;/.test(store), "boş jeton reddediliyor");
check(/if \(!r\.tokenHash\) continue;/.test(store), "özetsiz kayıt eşleştirilmiyor");
check(/typeof r\.tokenHash === "string" && !!r\.tokenHash/.test(store),
  "özetsiz kayıt okuma sırasında zaten eleniyor");
check(/timingSafeEqual\(/.test(store), "karşılaştırma sabit zamanlı");

/* --- 4. Kabul kararı SAF katmanda ---------------------------------------- */
/*
 * Sıra önemli: talep denetimi kotalardan ÖNCE. Kota önce denetlenseydi,
 * geçersiz bir jetonla dövmek de kotayı tüketir ve gerçek akrabayı
 * kilitlerdi. Kural `lib/contribution.ts`te ve orada test ediliyor; burada
 * kilitlenen şey rotanın kendi kuralını UYDURMAMASI.
 */
check(/planSubmit\(request, input, new Date\(\)/.test(store), "karar `planSubmit`e bırakılmış");
check(!/MAX_TEXT|MAX_PER_TOKEN >|length > 4000/.test(acik), "rota kendi sınırlarını yazmıyor");

/* --- 5. Yanıtlayan ağacın içini GÖRMÜYOR --------------------------------- */
check(/publicRequest\(r, fullName\(kisi\)\)/.test(acik), "girişsiz görünüm `publicRequest`ten geçiyor");
check(!/expiresAt|personId:|tokenHash/.test(acik.split("export async function POST")[0].split("publicRequest")[1] ?? ""),
  "GET yanıtına ek alan sızmıyor");

/* --- 6. GİZLİ KAYIT hakkında talep açılamaz ------------------------------ */
/*
 * Talep, o kişinin adını taşıyan girişsiz bir sayfa demek; `confidential`
 * işareti "bu kayıt hiçbir yerde görünmesin" demek. İkisi aynı anda doğru
 * olamaz.
 */
check(/if \(kisi\.confidential\)/.test(sahip), "gizli kayıt için talep reddediliyor");
{
  const i = sahip.indexOf("if (kisi.confidential)");
  const j = sahip.indexOf("createRequest(");
  check(i > -1 && j > i, "denetim talep AÇILMADAN önce");
}

/* --- 7. Oturum sınırları ------------------------------------------------- */
for (const yol of ["/hikaye/abc", "/api/hikaye/abc"])
  check(isPublicPath(yol), `${yol} oturumsuz açık`);
check(!isPublicPath("/api/family/stories"), "ağaç sahibinin ucu oturumsuz açık DEĞİL");
check(/canEdit\(ctx\.role\)/.test(sahip), "sahip ucu düzenleme yetkisi istiyor");
check(/robots: \{ index: false, follow: false \}/.test(sayfa),
  "jetonlu sayfa arama motorlarına kapalı");

/* --- 8. İYİMSER KİLİT karardan ÖNCE ------------------------------------- */
/*
 * Sonra olsaydı, çakışma yüzünden reddedilen bir istekte katkı kuyrukta
 * "onaylandı" işaretlenmiş ama kişinin kaydına hiç yazılmamış olurdu — ve
 * bir daha uygulanamazdı, çünkü `applyApproval` yalnız "bekliyor" durumunu
 * kabul ediyor. Hikâye sessizce kaybolurdu.
 */
{
  const iKilit = sahip.indexOf("if (versionMismatch(");
  const iKarar = sahip.indexOf("decideContribution(");
  const iYaz = sahip.indexOf("await saveFamilyData(");
  check(iKilit > -1, "sahip ucunda iyimser kilit var");
  /*
   * `iKilit > -1` KOŞULU ŞART: kilit tamamen silinirse `indexOf` -1 döner ve
   * "her şey -1'den büyüktür" diye sıra iddiaları kendiliğinden geçerdi —
   * yani kilidin YOKLUĞU, sırasının doğru olduğunu kanıtlar hâle gelirdi.
   */
  check(iKilit > -1 && iKarar > iKilit, "kilit KARARDAN önce");
  check(iKilit > -1 && iYaz > iKilit, "kilit yazmadan önce");
  check(/headers: mutationHeaders\(\)/.test(pencere), "pencere sürüm başlığını taşıyor");
}

/* --- 9. Onay İKİ KEZ uygulanamıyor -------------------------------------- */
/*
 * Onay düğmesine iki kez basmak ya da ağ katmanının isteği yinelemesi aynı
 * hikâyeyi iki kez eklememeli. İki katman birden: depo yalnız "bekliyor"
 * olanı işliyor, `applyApproval` da yalnız "bekliyor" olanı kabul ediyor.
 */
/*
 * İddia `return null` yerine SONUCA bakıyor: depo artık kararı ortak
 * oku→değiştir→yaz sarmalayıcısından geçiriyor (`lib/store-mutate.ts`) ve
 * "işlem yok" durumu `{ yaz: false, sonuc: null }` biçiminde dönüyor.
 * Kilitlenen kural değişmedi — yalnız bekleyen katkı işleniyor.
 */
check(/if \(!c \|\| c\.status !== "bekliyor"\) return \{ yaz: false, sonuc: null \};/.test(store),
  "depo yalnız bekleyeni işliyor");
check(/applyApproval\(data\.people\[i\], c,/.test(sahip), "kayda yazma `applyApproval` üstünden");
check(!/memories: \[/.test(sahip), "rota anıyı kendi elleriyle kurmuyor");

/* --- 10. Kuyruk kişi verisine DOKUNMUYOR --------------------------------- */
/*
 * İki depo birbirini tanımıyor: kuyruk kendi blobunda, kişiler başka blobda.
 * Kuyruğun kişi verisine dokunabildiği bir yol bırakılmadı.
 */
check(!/saveFamilyData|getFamilyData/.test(store), "kuyruk deposu kişi verisine erişmiyor");

/* --- 11. Arayüz gerçekten BAĞLI ------------------------------------------ */
/*
 * Onaylanmayan katkı, hiç gönderilmemiş katkıya eşit. Uç ve depo var olup
 * onları çağıran bir ekran olmasaydı, özellik teknik olarak "bitmiş" ama
 * pratikte erişilemez olurdu — bu depoda tam olarak bu bir kez yaşandı
 * (bildirim ayarları).
 */
check(/<StoriesDialog/.test(ws), "pencere ağaç ekranında render ediliyor");
check(/onStories=\{/.test(ws), "hub'a bağlanmış");
check(/onStories && <Row/.test(hub), "hub satırı var");
check(/fetch\("\/api\/family\/stories"/.test(pencere), "pencere ucu çağırıyor");
check(/t\("stories\.approve"\)/.test(pencere), "onay düğmesi var");
/* Kişi listesi HAM kayıttan değil, görüntü katmanından geliyor. */
check(/people\.map\(maskView\)[\s\S]{0,80}StoriesDialog|StoriesDialog[\s\S]{0,400}people\.map\(maskView\)/.test(ws),
  "kişi listesi görüntü katmanından geçiyor");

/* --- ONAY SIRASI: önce ağaç, sonra damga -------------------------------- */
/*
 * Ters sıradaydı ve dışarıdan gelen bir aile hikâyesini GERİ GETİRİLEMEZ
 * biçimde kaybediyordu: `decideContribution` durumu "onaylandi" yapıp
 * KAYDEDİYOR, ondan sonra kişi aranıyordu. Kişi arada silinmişse (ya da ağaç
 * yazması düşerse) uç hata dönüyor ama katkı kuyrukta "onaylandı" görünüyor
 * — ve bir daha uygulanamıyor, çünkü `applyApproval` yalnız "bekliyor"
 * durumunu kabul ediyor.
 *
 * Dosyanın kendi yorumu iyimser kilidin karardan önce olması gerektiğini
 * zaten anlatıyordu: tehlike görülmüş ama yalnız YARISI düzeltilmişti.
 */
{
  const rota = kodu(read("../app/api/family/stories/route.ts"));
  const i = rota.indexOf("export async function PATCH");
  const patch = i > -1 ? rota.slice(i) : rota;

  /* Karar vermeden ÖNCE okuyan bir yol olmalı. */
  check(/findContribution\(g\.ctx\.treeId, id\)/.test(patch), "katkı önce YALNIZ OKUNUYOR");
  check(/c\.status !== "bekliyor"/.test(patch), "karara bağlanmış katkı reddediliyor");

  /* Sıra: ağaç yazması, damgadan ÖNCE. */
  const iOnay = patch.indexOf('karar === "reddet"');
  const iAgac = patch.indexOf("await saveFamilyData(");
  const iDamga = patch.indexOf('decideContribution(g.ctx.treeId, id, "onayla")');
  check(iAgac > -1 && iDamga > iAgac, "ağaç yazması, katkı damgasından ÖNCE");
  check(iOnay > -1 && iOnay < iAgac, "ret dalı ağaca hiç dokunmadan çıkıyor");

  /* Damga düşerse kullanıcıya ne olduğu SÖYLENİYOR — "bulunamadı" denmiyor. */
  check(/applied: true/.test(patch), "ağaca yazıldıysa istemciye bildiriliyor");

  /*
   * Anı kimliği KARARLI olmalı: damga düşünce katkı "bekliyor" kalıyor ve
   * tekrar onaylanabiliyor; rastgele kimlik o tekrarı yinelenmeye çevirirdi.
   */
  check(/memoryIdFor\(c\)/.test(patch), "anı kimliği katkıdan türetiliyor");
  check(!/randomUUID\(\)/.test(patch), "rastgele anı kimliği kalmadı");
}

/* ══ HAFTALIK SERİ (madde 39) ═══════════════════════════════════════════════
 *
 * Kadans eklenince bu maddenin dengesi değişti: kuyruğa artık İKİ yazar
 * bakıyor — ağaç sahibinin ucu ve zamanlanmış iş. Aşağıdaki kapılar tam
 * olarak "ikinci yazar geldi" gerçeğini kilitliyor.
 * ------------------------------------------------------------------------ */

const seri = kodu(read("../lib/story-series.ts"));

/* --- 12. GİZLİ KAYIT denetimi DEPODA ------------------------------------- */
/*
 * Denetim eskiden YALNIZ rotadaydı ve o zaman doğruydu: tek yazar vardı.
 * Cron ikinci yazar; rotadaki kopyaya güvenmek, o kopyayı unutan ikinci
 * çağıranın gizli bir kayıt hakkında girişsiz bir sayfa açması demek.
 * Bu, `tests/story-gate.test.mts`in 1. bölümündeki "kapı depoda, çağıranda
 * değil" ilkesinin aynısı — orada jeton için, burada gizlilik için.
 */
check(/function gizli\(konu: StorySubject, personId: string\): boolean/.test(store),
  "gizlilik kapısı depoda tanımlı");
check(/return konu\.id !== personId \|\| !!konu\.confidential;/.test(store),
  "kimlik uyuşmazlığı da reddediliyor (başka kişinin işaretiyle çağrılamaz)");
for (const fn of ["createRequest", "createSeries", "issueWeekly"]) {
  const i = store.indexOf(`export async function ${fn}(`);
  check(i > -1, `${fn} bulundu`);
  const govde = store.slice(i, store.indexOf("\nexport ", i + 10));
  check(/konu: StorySubject/.test(govde), `${fn} kişi işaretini ZORUNLU alıyor`);
  check(/gizli\(konu, /.test(govde), `${fn} gizlilik kapısından geçiyor`);
}
/* İki depo hâlâ birbirini tanımıyor: işaret çağırandan geliyor, kayıt okunmuyor. */
check(!/saveFamilyData|getFamilyData/.test(store), "kuyruk deposu hâlâ kişi verisine erişmiyor");
/* Rotadaki denetim de duruyor — iki kat, çünkü mesajı kullanıcıya rota veriyor. */
check(/const konu = \{ id: kisi\.id, confidential: kisi\.confidential \}/.test(sahip),
  "rota işareti depoya taşıyor");

/* --- 13. HER HAFTA YENİ JETON, ÖNCEKİ KAPANIYOR -------------------------- */
/*
 * İki ayrı arıza birden önleniyor:
 *
 *  · TEK UZUN ÖMÜRLÜ JETON — bir kez iletilen bağlantı altı ay boyunca
 *    ailenin kuyruğuna yazma yetkisi olurdu. Her hafta yeni jeton, bu
 *    yetkiyi bir haftaya indiriyor.
 *  · TAVAN — `MAX_REQUESTS = 100` ve seri onlarca hafta sürüyor. Eskisini
 *    kapatmayan bir akış birkaç seriyle tavana çarpar ve o andan sonra
 *    HİÇBİR talep açılamaz, elle açılanlar dâhil.
 *
 * İkisi de TEK işlemde olmak zorunda: kapatma ayrı bir yazma olsaydı
 * aradaki her düşüş geriye açık bir talep bırakır ve sızıntı birikirdi.
 */
{
  const i = store.indexOf("export async function issueWeekly(");
  const govde = store.slice(i, store.indexOf("\nexport ", i + 10));
  check((govde.match(/mutate</g) ?? []).length === 1, "issueWeekly TEK mutasyon işlemi");
  const iKapat = govde.indexOf("onceki.closed = true");
  const iSay = govde.indexOf("if (acik >= MAX_REQUESTS)");
  const iAc = govde.indexOf("box.requests.push(request)");
  check(iKapat > -1 && iSay > iKapat, "önceki talep tavan SAYIMINDAN önce kapanıyor");
  check(iAc > iSay, "tavan denetimi yeni talepten önce");
  check(/randomBytes\(24\)\.toString\("base64url"\)/.test(govde), "her hafta YENİ rastgele jeton");
  check(/tokenHash: sha256\(ham\)/.test(govde), "kayda yine yalnız özet giriyor");
  check(/s\.currentRequestId = request\.id;/.test(govde), "açık talep serinin üstünde izleniyor");
  /*
   * İŞARET BURADA DEĞİL: talep gönderimden ÖNCE açılmak zorunda (bağlantı
   * postanın içinde), hafta damgası ise yalnız posta gittiyse konmalı.
   * Aynı işleve konsaydı, düşen bir gönderim kişinin hiç görmediği bir
   * soruyu "sorulmuş" sayar ve o soru bir daha hiç sorulmazdı.
   */
  check(!/s\.asked\.push|s\.lastWeek =/.test(govde), "hafta damgası issueWeekly'de KONMUYOR");
}
{
  const i = store.indexOf("export async function markWeeklySent(");
  check(i > -1, "işaretleme ayrı bir işlev");
  const govde = store.slice(i, store.indexOf("\nexport ", i + 10));
  check(/if \(!s\.asked\.includes\(promptId\)\) s\.asked\.push\(promptId\);/.test(govde),
    "aynı soru defterde iki kez yer almıyor");
  check(/s\.lastWeek = week;/.test(govde), "hafta damgası konuyor");
}
/* Seri durdurulunca açık haftalık talep de kapanıyor — canlı uç kalmasın. */
{
  const i = store.indexOf("export async function closeSeries(");
  const govde = store.slice(i, store.indexOf("\nexport ", i + 10));
  check(/s\.closed = true;/.test(govde), "seri kapanıyor");
  check(/if \(r\) r\.closed = true;/.test(govde), "açık haftalık talep de kapanıyor");
}
/* Ağaçtan çıkarılan kişinin serisi de duruyor. */
{
  const i = store.indexOf("export async function closeRequestsOfPeople(");
  const govde = store.slice(i, store.indexOf("\nexport ", i + 10));
  check(/for \(const s of box\.series\)/.test(govde), "silinen kişinin serisi de kapatılıyor");
}

/* --- 14. Kabul kuralları DEĞİŞMEDİ --------------------------------------- */
/*
 * Seriden gelen yanıt, elle açılmış bir talebin yanıtından farklı muamele
 * görmemeli: ikisi de girişsiz yazma, ikisi de aynı onay kuyruğu.
 * `planSubmit`in yeni alanlara bakması, kuyruğu iki sınıflı hâle getirir ve
 * "seriden geldi, güvenilir" gibi bir ayrıcalık er geç doğardı.
 */
{
  const katki = kodu(read("../lib/contribution.ts"));
  const i = katki.indexOf("export function planSubmit(");
  const govde = katki.slice(i, katki.indexOf("\n/* ── Onay", i));
  check(!/seriesId|promptId/.test(govde), "`planSubmit` seri alanlarına BAKMIYOR");
  check(/seriesId\?: string;/.test(katki) && /promptId\?: string;/.test(katki),
    "talep seri izini taşıyor");
}

/* --- 15. Ses seçimi SAF katmanda ----------------------------------------- */
/*
 * Serinin postası konunun KENDİ adresine gidiyor; "about" sesli sorular
 * üçüncü tekil kurulmuş ("{name} — sesi nasıldı?") ve kişinin kendisine
 * gönderildiğinde anlamsız. Kural cron'a bırakılsaydı ikinci bir çağıran
 * onu farklı seçebilirdi.
 */
check(/export const SERIES_VOICE: PromptVoice = "self";/.test(seri), "ses saf katmanda sabit");
check(/\{ voice: SERIES_VOICE \}/.test(seri), "soru seçimi o sesle süzülüyor");
check(/PROMPTS\.filter\(\(p\) => p\.voice === SERIES_VOICE\)\.length/.test(seri),
  "hafta sayısı bankadan türetiliyor (sabit 52 yazılmamış)");
check(!/new Date\(\)/.test(seri), "saf katmanda saat okunmuyor (karar `today` ile geliyor)");
check(!/from "@\//.test(seri), "saf katmanda çalışma zamanı `@/` içe aktarımı yok");

/* --- 16. YENİ OTURUMSUZ UÇ YOK ------------------------------------------ */
/*
 * Kadans, girişsiz yüzeyi BÜYÜTMEDEN kuruldu: haftalık posta zaten var olan
 * `/hikaye` sayfasına yeni bir jetonla gidiyor. Madde 39'un ilk teşhisi
 * ("ayrı giriş kapısı gerek") tam da burada çürüyor — gereken kapı zaten
 * açıktı. Ayrıntılı gerekçe `tests/tree-identity-gate.test.mts`te.
 */
check(PUBLIC_PREFIXES.filter((p) => /hikaye/.test(p)).length === 2,
  "hikâye için oturumsuz önek sayısı ARTMADI (/hikaye, /api/hikaye)");
check(![...PUBLIC_PREFIXES, ...PUBLIC_EXACT].some((p) => /seri|series|weekly|hafta/i.test(p)),
  "seri için ayrı bir oturumsuz yol açılmadı");
check(!isPublicPath("/api/cron/reminders"), "gönderen iş oturumsuz açık DEĞİL");
/* Seri uçları ağaç sahibinin KAPALI ucunda yaşıyor. */
check(/createSeries\(/.test(sahip) && /closeSeries\(/.test(sahip),
  "seri işlemleri düzenleyici ucunda");

/* --- 17. Arayüz gerçekten BAĞLI ----------------------------------------- */
/*
 * Onaylanmayan katkı hiç gönderilmemiş katkıya eşitse, başlatılamayan seri
 * de hiç yazılmamış seriye eşit.
 */
check(/mode: "seri"/.test(pencere), "pencere seriyi başlatabiliyor");
check(/JSON\.stringify\(\{ seriesId \}\)/.test(pencere), "pencere seriyi durdurabiliyor");
check(/t\("stories\.seriesProgress", \{ sent: s\.sent, total: s\.total \}\)/.test(pencere),
  "ilerleme gösteriliyor");
/*
 * İlerlemenin paydası UÇTAN geliyor (`total`), ekranda sabit yazmıyor:
 * "52" yazıp 26'da bitmek kullanıcıya yalan söylemek olurdu.
 */
check(!/\/\s*52/.test(pencere), "paydada sabit 52 yazmıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
