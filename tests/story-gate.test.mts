import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

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
check(/return \{ request, token \}/.test(store), "ham jeton yalnız üretimde dönüyor");
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
check(/if \(!c \|\| c\.status !== "bekliyor"\) return null;/.test(store), "depo yalnız bekleyeni işliyor");
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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
