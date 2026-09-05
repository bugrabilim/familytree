import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: ağaçtaki kişiye giden postalar (madde 47/48 gönderim yolu).
 *
 * Burada kilitlenen şey geri alınamaz: gönderilmiş bir posta geri alınamaz ve
 * onay vermemiş birine yas gününü hatırlatan bir posta göndermek özür
 * dilemekle telafi edilmez. İhlal de sessiz olur — kimse hata görmez, yalnız
 * istenmeyen posta gider.
 */

const cron = read("../app/api/cron/reminders/route.ts");
const cK = kodu(cron);
const yanit = kodu(read("../app/api/contact/answer/route.ts"));
const cikis = kodu(read("../app/api/contact/unsubscribe/route.ts"));
const lookup = kodu(read("../lib/contact-lookup.ts"));
const sayfa = kodu(read("../app/contact/[token]/page.tsx"));
const istemci = kodu(read("../app/contact/[token]/ContactAnswerClient.tsx"));
const cikisSayfa = kodu(read("../app/contact/cikis/[token]/page.tsx"));

/* --- TEK KAPI: gönderim yalnız `canEmailContact` üstünden ---------------- */
/*
 * Cron'un kendi başına "onayli mi" diye bakması, kuralın ikinci bir kopyası
 * demek olurdu; kopyalar ayrışır ve ayrıştığında onay vermemiş birine posta
 * gider.
 */
check(/if \(!canEmailContact\(kisi\)\) continue;/.test(cK), "bildirim gönderimi tek kapıdan geçiyor");
check(!/contactConsent === "onayli"/.test(cK), "cron onay denetimini KENDİ yazmıyor");
check(/planAsk\(kisi, today\)/.test(cK), "soru kararı da saf katmanda");

/* --- ÇIKIŞ BAĞLANTISI OLMADAN HİÇ GÖNDERİLMİYOR -------------------------- */
/*
 * Çıkışsız bir bildirim postası onayı tek yönlü bir kapıya çevirir: onay veren
 * kişinin uygulamada hesabı yok, fikrini değiştirmek için yapabileceği hiçbir
 * şey kalmaz.
 */
check(/if \(isUnsubConfigured\(\)\) \{/.test(cK), "çıkış jetonu üretilemiyorsa hiç gönderilmiyor");
check(/if \(!unsub\) continue;/.test(cK), "kişi başına çıkış bağlantısı yoksa posta yok");
check(/contact\/cikis\/\$\{unsub\}/.test(cK), "bildirim postasında çıkış bağlantısı var");

/* --- İŞARET YALNIZ GÖNDERİM BAŞARILIYSA ---------------------------------- */
/*
 * Önce konsaydı, başarısız bir gönderim kişiyi otuz gün "soruldu" sayar ve o
 * kişi hiç görmediği bir soruya yanıt veremediği için sessizce düşerdi.
 */
{
  const iGonder = cK.indexOf("subject: \"🌳 Sana bir soru var\"");
  const iKosul = cK.indexOf("if (r.sent) {");
  const iIsaret = cK.indexOf("yeniJetonlar.set(");
  check(iGonder > -1 && iIsaret > iGonder, "jeton özeti gönderimden SONRA kaydediliyor");
  /*
   * Gönderimden sonra olması YETMEZ: işaret `r.sent` KOŞULUNUN İÇİNDE
   * olmalı. Yalnız sıraya bakan bir iddia, koşulun altına taşınmış bir
   * atamayı yakalamıyordu — atama gönderimden sonra ama koşuldan önce
   * duruyordu ve kapı yeşil kalıyordu.
   */
  check(iKosul > -1 && iIsaret > iKosul, "işaret `r.sent` koşulunun İÇİNDE");
}

/* --- ÜÇÜNCÜ KİŞİYE giden içerik gizlilik süzgecinden geçiyor ------------- */
/*
 * Hesap sahibi kendi verisini görüyor; ağacın içindeki bir akraba yalnız bir
 * ALICI. `todaysReminders` kendi başına süzgeç uygulamıyor.
 */
check(/filter\(\(p\) => !p\.confidential\)/.test(cK), "confidential kayıt dışlanıyor");
check(/\.map\(stripPrivateFields\)/.test(cK), "alan-bazlı gizlilik uygulanıyor");
check(/todaysReminders\(gorunur, today\)/.test(cK), "hatırlatmalar SÜZÜLMÜŞ listeden üretiliyor");

/* --- Soru tavanı --------------------------------------------------------- */
/*
 * Toplu içe aktarılan yüzlerce adres, tavan olmadan tek gecede yüzlerce soru
 * postası demek olurdu — teknik olarak "izin isteme", pratikte toplu posta.
 */
check(/let kalanSoru = \d+;/.test(cK), "koşu başına soru tavanı var");
check(/if \(kalanSoru <= 0\) continue;/.test(cK), "tavan dolunca soru gönderilmiyor");

/* --- OTURUMSUZ yüzeyler gerçekten açık ---------------------------------- */
/*
 * Bu sayfaları açan kişinin hesabı YOK ve olması beklenemez. Kapalı
 * kalsalardı çift onay kâğıt üstünde kalır, çıkış hiç çalışmazdı.
 */
for (const yol of [
  "/contact/abc",
  "/contact/cikis/abc",
  "/api/contact/answer",
  "/api/contact/unsubscribe",
])
  check(isPublicPath(yol), `${yol} oturumsuz açık`);
/* Ters yön: "contact" öneki düzenleyici ucunu AÇMAMALI. */
check(!isPublicPath("/api/family/person/p1/contact"), "düzenleyici iletişim ucu kapalı kalıyor");

/* --- Karar GET ile verilemiyor ------------------------------------------ */
/*
 * Posta istemcileri ve önizleme botları bağlantıları ön-getiriyor. Karar GET
 * olsaydı, kullanıcı postayı açar açmaz onun yerine karar verilmiş olurdu.
 */
for (const [ad, src] of [["yanıt", yanit], ["çıkış", cikis]] as const) {
  check(/export async function POST\(/.test(src), `${ad} ucu POST`);
  check(!/export async function GET\(/.test(src), `${ad} ucunda GET YOK`);
}
check(/readAskToken\(token\)/.test(sayfa), "soru sayfası jetonu okuyor");
check(!/answerWithToken|applyAnswer/.test(sayfa), "soru sayfası jetonu TÜKETMİYOR");
check(!/unsubscribeWithToken/.test(cikisSayfa), "çıkış sayfası açılışta çıkarmıyor");
check(/fetch\("\/api\/contact\/answer"/.test(istemci), "kararı kullanıcı tıklamasıyla istemci gönderiyor");

/* --- Jeton geçersizse HİÇBİR ŞEY gösterilmiyor -------------------------- */
/*
 * Ad, aile, "böyle bir kayıt var mı" — hiçbiri. Yoksa sayfa kimlik tahmin
 * etmek için bir sorgu aracına dönerdi.
 */
check(/name=\{gecerli \? /.test(sayfa), "ad yalnız geçerli jetonda taşınıyor");
check(/family=\{gecerli \? /.test(sayfa), "aile adı yalnız geçerli jetonda taşınıyor");
check(/if \(!valid\)/.test(istemci), "geçersizde ayrı ekran");

/* --- TEK RET MESAJI ------------------------------------------------------ */
/*
 * "Bağlantı geçersiz" ile "böyle bir kayıt yok" ayırt edilseydi, uç rastgele
 * kimliklerle hangi ağaçların var olduğunu öğrenmek için bir sorgu aracına
 * dönerdi.
 */
for (const [ad, src] of [["yanıt", yanit], ["çıkış", cikis]] as const) {
  const mesajlar = [...src.matchAll(/error: "([^"]+)"/g)].map((m) => m[1]);
  const tekil = new Set(mesajlar.filter((m) => !/Geçersiz istek|Çok fazla deneme/.test(m)));
  check(tekil.size === 1, `${ad} ucunda tek ret mesajı (${[...tekil].join(" | ")})`);
}

/* --- Jeton doğrulanmadan kayıt AÇILMIYOR -------------------------------- */
check(
  (lookup.match(/matchesHash\(p\.proof, kisi\.contactTokenHash\)/g) ?? []).length === 2,
  "hem okuma hem yazma yolunda sır doğrulanıyor"
);
check(/verifyUnsubToken\(token\)/.test(lookup), "çıkış jetonu imzayla doğrulanıyor");

/* --- Oran sınırı --------------------------------------------------------- */
for (const [ad, src] of [["yanıt", yanit], ["çıkış", cikis]] as const)
  check(/rateLimitShared\(/.test(src), `${ad} ucu oran sınırlı`);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
