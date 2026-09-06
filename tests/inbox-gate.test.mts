import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";
import { isAdminAccount, isAdminConfigured } from "../lib/admin.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: gelen posta kutusu.
 *
 * Üç ayrı şeyi kilitliyor ve üçü de sessizce ihlal edilebilir:
 *
 *  1. Webhook OTURUMSUZ — kimlik yalnız imzada. İmza gevşerse kutuya sahte
 *     posta yazılır ve orada okunan hiçbir şey güvenilir olmaz.
 *  2. Kutuyu YALNIZ işletmeci okur. `isFounder` ile korunsaydı, bu depoda
 *     herkes kendi ağacının kurucusu olduğu için kaydolan HERKES okurdu.
 *  3. Gelen HTML hiç saklanmıyor ve hiç çizilmiyor.
 */

const webhook = kodu(read("../app/api/inbound/resend/route.ts"));
const api = kodu(read("../app/api/admin/inbox/route.ts"));
const inbox = kodu(read("../lib/inbox.ts"));
const store = kodu(read("../lib/inbox-store.ts"));
/*
 * YORUMLAR AYIKLANARAK okunuyor. İlk hâlinde ham okunuyordu ve dosyadaki
 * "`dangerouslySetInnerHTML` ... YOK" YORUMU, tam da yasakladığı deseni
 * içerdiği için iddiayı düşürüyordu. Kuralı ANLATAN metin, kuralın ihlali
 * değildir — bu tuzağa depoda birkaç kez düşüldü.
 */
const ekran = kodu(read("../app/admin/posta/InboxClient.tsx"));

/* --- 1. İMZA: sır yoksa KAPALI ------------------------------------------ */
/*
 * Bu depoda bir kez "sır yoksa denetimi atla" yazılmıştı (`CRON_SECRET`) ve
 * sonuç, herkesin bütün hesaplara posta gönderten günlük işi tetikleyebilmesi
 * oldu. Aynı hata burada gelen kutusuna sahte posta yazmak demek olurdu.
 */
check(/verifyWebhook\(\s*process\.env\.RESEND_WEBHOOK_SECRET/.test(webhook), "webhook imzayı doğruluyor");
check(/if \(!r\.ok\)/.test(webhook) && /status: 401/.test(webhook), "imza tutmazsa 401");
{
  const sig = kodu(read("../lib/webhook-signature.ts"));
  check(/if \(!secret\?\.trim\(\)\) return \{ ok: false, error: "yapilandirilmamis" \}/.test(sig),
    "sır yoksa doğrulama KAPALI düşüyor");
}

/* --- HAM gövde üstünden imza -------------------------------------------- */
/*
 * `req.json()` ile ayrıştırıp yeniden metne çevirmek (anahtar sırası, boşluk,
 * unicode kaçışları) imzayı bozar ve doğrulama HER ZAMAN başarısız olurdu —
 * yani bütün gelen posta sessizce kaybolurdu.
 */
check(/const body = await req\.text\(\);/.test(webhook), "ham gövde okunuyor");
{
  const iHam = webhook.indexOf("await req.text()");
  const iDog = webhook.indexOf("verifyWebhook(");
  const iAyr = webhook.indexOf("JSON.parse(body)");
  check(iHam > -1 && iDog > iHam, "doğrulama ham gövdeden sonra");
  check(iAyr > -1 && iAyr > iDog, "JSON ayrıştırma doğrulamadan SONRA");
}

/* --- Yeniden denemede posta ÇOĞALMIYOR ---------------------------------- */
/*
 * Kimlik, İMZASI DOĞRULANAN başlıktan geliyor — ayrıca okunan bir başlıktan
 * değil. İkisi ayrışsaydı, imza bir kimlikle doğrulanıp kayıt başka bir
 * kimlikle yazılabilirdi.
 *
 * `readHeaders` iki yazımı da (`svix-*` ve `webhook-*`) kabul ediyor;
 * yalnız `svix-*` okumak gerçek bir arızaya yol açtı: Resend `webhook-*`
 * gönderiyor, doğrulama 401 dönüyor ve gelen kutusu sessizce boş kalıyordu.
 */
check(/const basliklar = readHeaders\(req\.headers\)/.test(webhook), "başlıklar tek yerden okunuyor");
check(/verifyWebhook\(process\.env\.RESEND_WEBHOOK_SECRET, basliklar,/.test(webhook),
  "doğrulama o başlıklarla yapılıyor");
check(/const id = basliklar\.id \?\? ""/.test(webhook), "kimlik AYNI başlıklardan alınıyor");
check(/if \(mevcut\.some\(\(m\) => m\.id === yeni\.id\)\) return mevcut;/.test(inbox),
  "aynı kimlikli posta çoğaltılmıyor");
check(/status: 500/.test(webhook), "saklanamazsa sağlayıcı yeniden denesin diye 500");

/* --- 2. KUTUYU YALNIZ İŞLETMECİ OKUR ------------------------------------ */
check(/isAdminAccount\(id\)/.test(api), "uç işletmeci denetimi yapıyor");
check(!/isFounder/.test(api), "`isFounder` bu kapıda KULLANILMIYOR");
/* Yapılandırma yoksa hiç kimse. Ters varsayım kutuyu ilk kaydolana açardı. */
check(!isAdminConfigured(""), "boş yapılandırmada işletmeci yok");
check(!isAdminAccount("herhangi", ""), "yapılandırma yokken kimse işletmeci değil");
check(!isAdminAccount("baska-id", "dogru-id"), "listede olmayan kimlik reddediliyor");
check(isAdminAccount("dogru-id", "baska, dogru-id"), "listedeki kimlik kabul");
check(isAdminAccount("DOGRU-ID", "dogru-id"), "harf kutusu engel değil");
check(!isAdminAccount("", "dogru-id"), "boş kimlik reddediliyor");
check(!isAdminAccount(undefined, "dogru-id"), "kimliksiz oturum reddediliyor");

/*
 * Her yöntem ayrı ayrı korunuyor — biri atlanırsa kapı kırık demektir.
 *
 * `GET` bu listede YOKTU ve bu, kapının en pahalı yöntemini denetimsiz
 * bıraktı: `GET` kutunun TAMAMINI döndürüyor, ama kendi kopya denetimini
 * taşıdığı için `guard()` aranmıyordu. `isAdminAccount(id)` iddiası da
 * boşluğu kapatmıyor: o desen `guard()`ın içinde de geçiyor, yani `GET`ten
 * denetim tümüyle silinse bile yeşil kalıyordu (denendi: 52/52 geçti).
 */
for (const y of ["GET", "PATCH", "POST", "DELETE"]) {
  const i = api.indexOf(`export async function ${y}(`);
  /*
   * Pencere BİR SONRAKİ yönteme kadar. Sabit uzunlukta bir pencere (ilk
   * hâli 400 karakterdi) komşu yöntemin gövdesine taşıyor ve iddiayı
   * BOŞUNA yeşil bırakıyordu: `GET`ten denetim tümüyle silindiğinde bile
   * pencere `PATCH`in `guard()` çağrısını görüp geçiyordu. Denendi.
   */
  const sonraki = api.indexOf("export async function ", i + 1);
  const govde = api.slice(i, sonraki > -1 ? sonraki : undefined);
  check(i > -1 && /const g = await guard\(\);/.test(govde), `${y} kapıdan geçiyor`);
}

/* --- Oturum sınırları ---------------------------------------------------- */
check(isPublicPath("/api/inbound/resend"), "webhook oturumsuz açık");
check(!isPublicPath("/api/admin/inbox"), "gelen kutusu ucu oturumsuz açık DEĞİL");
check(!isPublicPath("/admin/posta"), "gelen kutusu ekranı oturumsuz açık DEĞİL");

/* --- Yanıtın ALICISI kayıttan, istemciden değil -------------------------- */
/*
 * İstemci alıcı belirtebilseydi, bu uç "işletmeci hesabından istediğim adrese
 * posta at" aracına dönerdi — doğrulanmış alan adımızdan istenmeyen posta
 * göndermenin yolu.
 */
check(/to: mail\.from,/.test(api), "alıcı kayıttaki gönderenden");
check(!/to: body\./.test(api), "alıcı gövdeden OKUNMUYOR");
/*
 * Alıcı kayıttan geliyor ama BAŞLIKLAR da yabancı: konu ve `Message-ID`
 * gönderenin yazdığı başlıklardan. Satır sonu taşıyan bir değer, giden
 * yanıtımızda YENİ BİR BAŞLIK açardı (`Bcc:`) — doğrulanmış alan adımızdan
 * gizli kopya göndermenin yolu. Rota bu değerleri ham kullanmamalı.
 */
check(/subject: replySubject\(mail\.subject\)/.test(api), "konu temizleyen yardımcıdan geçiyor");
check(!/subject: mail\.subject/.test(api), "ham konu doğrudan gönderilmiyor");
check(/headers: threadHeaders\(mail\)/.test(api), "zincir başlıkları temizleyen yardımcıdan");
check(!/"In-Reply-To"/.test(api), "rota başlığı kendi eliyle kurmuyor");
{
  const inboxSrc = kodu(read("../lib/inbox.ts"));
  check(/const id = safeMessageId\(m\.messageId \?\? ""\);/.test(inboxSrc),
    "`threadHeaders` depodan geleni de doğruluyor (ikinci kat)");
  check(/subject: headerSafe\(/.test(inboxSrc), "konu ayrıştırmada temizleniyor");
}

/* --- 3. HTML HİÇ SAKLANMIYOR, HİÇ ÇİZİLMİYOR ---------------------------- */
/*
 * KURAL DEĞİŞTİ ve nedeni yazılmalı: eskiden "saf katman html'e hiç
 * dokunmasın" deniyordu ve bu YANLIŞTI — iki ayrı şeyi karıştırıyordu.
 * Tehlikeli olan işaretlemenin TARAYICIDA YORUMLANMASI, karakterlerin
 * kendisi değil. Kuralın bedeli de somuttu: bugünün postalarının çoğu yalnız
 * HTML gövdeli, "bakmayız" demek gelen kutusunu kullanılmaz kılıyordu.
 *
 * Yeni kural daha dar ve doğru yerde: HTML SAKLANMIYOR ve ÇİZİLMİYOR.
 * Çıkarılan düz metin saklanıyor.
 */
check(/export function htmlToText\(/.test(inbox), "html'den düz metin çıkarılıyor");
{
  /*
   * Desen `Mail` arayüzünün İÇİNE bakıyor. Dosya genelinde "html:" aramak
   * `htmlToText(html: string)` imzasıyla eşleşip iddiayı sahte kırmızıya
   * düşürüyordu — aranan şey saklanan ALAN, geçen her kelime değil.
   */
  const i = inbox.indexOf("export interface Mail {");
  const govde = inbox.slice(i, inbox.indexOf("\n}", i));
  check(i > -1 && !/\bhtml\b/.test(govde), "`Mail` kaydında html alanı YOK");
}
{
  /* Depoya yazılan alanlar arasında html yok. */
  check(!/\bhtml\b/.test(store), "depo html'e hiç dokunmuyor");
  /* Çıkarma saf dize işlemi: DOM ya da değerlendirme yok. */
  for (const tehlike of ["innerHTML", "eval(", "new Function", "document."])
    check(!inbox.includes(tehlike), `çıkarma ${tehlike} kullanmıyor`);
}
check(!/dangerouslySetInnerHTML/.test(ekran), "ekranda dangerouslySetInnerHTML YOK");
/*
 * Gövde tek yabancı alan değil: konu, gönderenin GÖRÜNEN ADI ve ek adlarını
 * da gönderen yazıyor. Hepsi JSX metin çocuğu olarak çiziliyor (React
 * kaçırıyor); ham HTML'e açılan BAŞKA bir kapı da olmamalı.
 */
for (const kapi of ["innerHTML", "insertAdjacentHTML", "document.write"])
  check(!ekran.includes(kapi), `ekranda ${kapi} yok`);
check(/whitespace-pre-wrap/.test(ekran), "gövde düz metin olarak çiziliyor");
check(!/m\.html/.test(ekran), "ekran html alanı okumuyor");

/* --- Ekin İÇERİĞİ saklanmıyor ------------------------------------------- */
/*
 * Desen dar: çıplak `content`, `contentType` (blob yazarken kullanılıyor)
 * ile eşleşiyor ve iddiayı sahte kırmızıya düşürüyordu. Aranan şey EKİN
 * İÇERİĞİ, yani `content` alanının okunması.
 */
check(!/\.content\b|content:/.test(store), "depo ek içeriğine dokunmuyor");
check(/name: metin\(a\?\.filename \?\? a\?\.name\)/.test(inbox), "ekten yalnız ad alınıyor");

/* --- Kutu ağaç verisinden AYRI ------------------------------------------ */
/*
 * Bir ağacın yedeği alınırken ya da silinirken yabancıların postaları da
 * gitmemeli; ters yönde de, gelen kutusu ağaç verisine hiç dokunmamalı.
 */
check(!/getFamilyData|saveFamilyData/.test(store), "gelen kutusu deposu ağaç verisine erişmiyor");
check(/const PATHNAME = "inbox\.json"/.test(store), "kutu kendi dosyasında");

/* --- YARIŞ ve OKUMA HATASI: kuralların depoya BAĞLI olduğu ------------- */
/*
 * Kuralların kendisi `lib/inbox-box.ts`te ve orada birim testi var
 * (`tests/inbox-box.test.mts`). Burada denetlenen tek şey, deponun onları
 * gerçekten KULLANDIĞI: kural doğru olup da bağlanmamışsa hiçbir işe
 * yaramaz.
 *
 * İkisi de gerçek kayıp senaryosu:
 *  · Okuma başarısız olunca boş kutu dönülüyordu ve üstüne yazılıyordu —
 *    tek bir geçici 503, kutudaki her postayı siliyordu (webhook 200
 *    dönerek).
 *  · Kilit yoktu: aynı anda gelen iki posta aynı sürümü okuyup ikisi de
 *    yazıyor, ikincisi birincisini siliyordu.
 */
{
  const kutu = kodu(read("../lib/inbox-box.ts"));
  check(/mutateBox\(/.test(store), "yazmalar tek çakışma-korumalı yoldan geçiyor");
  check(!/async function saveBox|await saveBox\(/.test(store), "doğrudan yazma yolu KALMADI");
  check(/ifMatch: etag/.test(store), "yazma sürüm damgasıyla KOŞULLU (kilit yerine CAS)");
  check(/instanceof BlobPreconditionFailedError/.test(store), "sürüm çakışması tanınıyor");
  check(/etag: direct\.blob\.etag/.test(store), "okurken sürüm damgası alınıyor");
  check(/throw new Error\(`inbox\.json okunamadı/.test(store),
    "indirme hatası BOŞ KUTUYA düşmüyor, fırlatıyor");
  check(/if \(!io\.isConflict\(e\)\) throw e;/.test(kutu), "çakışma olmayan hata yeniden denenmiyor");
  check(/throw son;/.test(kutu), "denemeler tükenince sessiz başarı YOK");
}

/* --- Yanıt metni: GÖNDERİLEN ile SAKLANAN ayrışmıyor -------------------- */
/*
 * Depo `MAX_TEXT` uyguluyor. Daha uzun bir metin gönderilip kaydın içinde
 * eksik dursaydı, kullanıcı ne yazdığını sandığından farklı bir şey görür ve
 * farkı hiç öğrenemezdi.
 */
check(/metin\.length > MAX_TEXT/.test(api), "aşırı uzun yanıt gönderilmeden reddediliyor");

/* --- GÖVDE ÇEKME postayı riske ATMIYOR ---------------------------------- */
/*
 * Sıra bilinçli: önce posta saklanıyor, sonra gövde deneniyor. Ters olsaydı
 * ve çekme başarısız olsaydı (en olası sebep API anahtarının izninin
 * yetmemesi — beklemekle geçmeyen bir durum), 500 döner, sağlayıcı yeniden
 * dener ve posta HİÇ kutuya düşmezdi.
 */
{
  const iSakla = webhook.indexOf("await storeMail(mail)");
  const iGovde = webhook.indexOf("fetchInboundBody(");
  check(iSakla > -1 && iGovde > iSakla, "gövde çekme saklamadan SONRA");
  /*
   * Çekmeden SONRA hiçbir 500 yolu kalmamalı. Pencereye bakmak yerine
   * dosyanın kalanına bakılıyor: ilk hâlinde 200 karakterlik pencere,
   * saklamanın kendi 500'ünü içine alıp iddiayı sahte kırmızıya
   * düşürüyordu.
   */
  check(!webhook.slice(iGovde).includes("status: 500"), "çekmeden sonra 500 yolu yok");
  check(/if \(g\.ok\) await setBody/.test(webhook), "başarıda gövde yazılıyor");
  check(/else \{\s*await setBody\(mail\.id, \{ state: g\.state \}\)/.test(webhook),
    "başarısızlıkta NEDEN yazılıyor");
}

/* --- Gövde yeniden DENENEBİLİYOR ---------------------------------------- */
/*
 * En olası arıza (anahtar izni) sonradan düzeltilebilir. Yeniden deneme
 * olmasaydı, düzeltmeden önce gelen bütün postalar kalıcı olarak gövdesiz
 * kalırdı ve tek çare gönderenden postayı tekrar istemek olurdu.
 */
check(/mail\.bodyFetch && mail\.bodyFetch !== "bulunamadi"/.test(api),
  "açılışta gövde yeniden deneniyor (kalıcı olmayan hatalarda)");
check(/GOVDE_MESAJI/.test(ekran), "ekran gövdenin neden yok olduğunu söylüyor");
check(/Full access/.test(ekran), "yetki hatasında ne yapılacağı yazıyor");

/* --- Yanıt YALNIZ gönderim başarılıysa saklanıyor ----------------------- */
/*
 * Gönderilmemiş bir metni "yanıtım" diye kaydetmek, olmayan bir yazışmayı
 * kayda geçirmek olurdu — ve kullanıcı karşı tarafın onu okuduğunu sanırdı.
 */
{
  const iSent = api.indexOf("if (!r.sent)");
  const iKaydet = api.indexOf("await markReplied(");
  check(iSent > -1 && iKaydet > iSent, "yanıt metni gönderim denetiminden SONRA saklanıyor");
  check(/markReplied\(id, new Date\(\)\.toISOString\(\), metin\)/.test(api),
    "gönderilen metnin kendisi saklanıyor");
  check(/m\.replies\.map/.test(ekran), "ekran eski yanıtları gösteriyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
