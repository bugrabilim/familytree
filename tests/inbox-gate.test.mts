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
check(/req\.headers\.get\("svix-id"\) \?\? ""/.test(webhook), "kimlik sağlayıcının id'sinden");
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

/* Her yöntem ayrı ayrı korunuyor — biri atlanırsa kapı kırık demektir. */
for (const y of ["PATCH", "POST", "DELETE"]) {
  const i = api.indexOf(`export async function ${y}(`);
  const govde = api.slice(i, i + 400);
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

/* --- 3. HTML HİÇ SAKLANMIYOR, HİÇ ÇİZİLMİYOR ---------------------------- */
check(!/html/i.test(inbox.replace(/htmlden/gi, "")), "saf katman html'e hiç dokunmuyor");
check(!/dangerouslySetInnerHTML/.test(ekran), "ekranda dangerouslySetInnerHTML YOK");
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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
