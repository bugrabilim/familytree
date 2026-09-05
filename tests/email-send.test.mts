import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: gönderim, özel başlık yüzünden KAYBOLMAZ.
 *
 * Yanıtlarda `In-Reply-To`/`References` gönderiliyor ki yanıt alıcının posta
 * istemcisinde özgün iletinin altına düşsün. Ama bazı sağlayıcılar bu
 * "ayrılmış" başlıkların özel başlık alanından ayarlanmasını reddediyor ve o
 * durumda İSTEĞİN TAMAMI hata döner — yani zincirleme uğruna yanıtın kendisi
 * hiç gitmez.
 *
 * `lib/email.ts` ağ çağrısı yaptığı için birim testi koşulamıyor; kural
 * kaynak düzeyinde kilitleniyor.
 */
const email = kodu(read("../lib/email.ts"));

/* --- İki aşamalı gönderim var -------------------------------------------- */
check(/async function denemeGonder\(/.test(email), "tek deneme ayrı bir işlevde");
check(/basliklarla: boolean/.test(email), "deneme başlıklı/başlıksız çalışabiliyor");
check(/const ilk = await denemeGonder\(input, apiKey, from, true\)/.test(email),
  "ilk deneme başlıklarla");
check(/denemeGonder\(input, apiKey, from, false\)/.test(email), "ikinci deneme BAŞLIKSIZ");

/* --- Yeniden deneme YALNIZ HTTP reddinde --------------------------------- */
/*
 * Fırlatılan hatada (ağ kopması, zaman aşımı) isteğin gidip gitmediği
 * BİLİNEMEZ. Körlemesine tekrar denemek, alıcıya aynı postayı iki kez
 * göndermek olabilirdi — ve bir yas ilanının iki kez gitmesi, hiç
 * gitmemesinden daha kötüdür.
 */
check(/httpRed\?: boolean/.test(email), "HTTP reddi ayrı bir bayrakla taşınıyor");
check(/httpRed: true/.test(email), "yalnız `!res.ok` dalında işaretleniyor");
{
  /* Bayrak, fırlatılan hata dalında KONMAMALI. */
  const i = email.indexOf("} catch (e) {");
  const catchBlok = email.slice(i, i + 200);
  check(!/httpRed/.test(catchBlok), "fırlatılan hatada httpRed konmuyor");
}
check(/if \(ozelBaslikVar && ilk\.httpRed\)/.test(email),
  "yeniden deneme hem özel başlık hem HTTP reddi şartına bağlı");

/* --- En fazla İKİ deneme ------------------------------------------------- */
/*
 * Döngü yok, ikinci denemenin sonucu doğrudan dönüyor: üçüncü bir deneme
 * yolu kalmamalı, yoksa reddedilen bir gönderim sonsuza dek tekrarlanırdı.
 */
check((email.match(/await denemeGonder\(/g) ?? []).length === 2, "en fazla iki deneme");
check(!/while|for \(/.test(email.slice(email.indexOf("export async function sendEmail"))),
  "sendEmail içinde döngü yok");

/* --- Başlıksız çağrıda boşuna ikinci deneme yapılmıyor ------------------- */
check(/const ozelBaslikVar = !!input\.headers/.test(email),
  "özel başlık yoksa ikinci deneme hiç düşünülmüyor");

/* --- Yapılandırma eksikse AĞA HİÇ ÇIKILMIYOR ----------------------------- */
{
  const i = email.indexOf("export async function sendEmail");
  const govde = email.slice(i);
  const iYok = govde.indexOf('reason: "not-configured"');
  const iDeneme = govde.indexOf("await denemeGonder(");
  check(iYok > -1 && iDeneme > iYok, "anahtar denetimi denemeden önce");
}

/* --- Sessiz düşme yok ---------------------------------------------------- */
/*
 * İki deneme de başarısızsa çağıran BUNU BİLMELİ; "gönderildi" dönmek,
 * kullanıcıya gitmemiş bir yanıtı gitmiş göstermek olurdu.
 */
check(/return \{ sent: false, reason: "error", error: ikinci\.error \}/.test(email),
  "ikinci deneme de başarısızsa hata dönüyor");
check(/console\.warn\(`\[eposta\] özel başlıklı gönderim reddedildi/.test(email),
  "başlıksız denemeye düşüş günlüğe yazılıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
