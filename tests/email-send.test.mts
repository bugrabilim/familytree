import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: giden posta katmanı.
 *
 * `lib/email.ts` ağ çağrısı yapıyor, o yüzden birim testi koşulamıyor; kural
 * kaynak düzeyinde kilitleniyor. Burada kilitlenen üç şeyin üçü de sessizce
 * bozulabilir ve üçünün bedeli de görünmez:
 *
 *  1. Gönderen adresini ÇAĞIRAN belirleyemez.
 *  2. Yeniden deneme YOK — aynı posta iki kez gitmemeli.
 *  3. Başarısızlık sessizce yutulmamalı.
 */
const email = kodu(read("../lib/email.ts"));

/* --- 1. Gönderen ortam değişkeninden, çağırandan DEĞİL ------------------- */
/*
 * `from` çağırandan alınabilseydi, bu katmanı kullanan herhangi bir uç
 * "doğrulanmış alan adımızdan istediğim kişi adına posta at" aracına
 * dönerdi — kimlik avı için hazır altyapı.
 */
/*
 * İDDİALAR SIKI TUTULUYOR — gevşek olanı bir mutasyon geçti.
 *
 * İlk hâlinde "`from,` geçiyor mu" ve "`from: input.` YOK mu" diye
 * bakılıyordu. `from: (input as {from?:string}).from ?? from,` mutasyonu
 * İKİSİNİ DE geçti: `?? from,` ilk deseni karşılıyor, tür dönüşümü de
 * ikincisini atlatıyor. Aynı tuzağa depoda daha önce de düşüldü
 * (`(body as Record<string, unknown>).x`). Çare: deseni değil SATIRIN
 * KENDİSİNİ aramak.
 */
check(/const from = process\.env\.EMAIL_FROM;/.test(email),
  "gönderen YALNIZ EMAIL_FROM'dan okunuyor (satır orada bitiyor)");
{
  const i = email.indexOf("JSON.stringify({");
  const govde = email.slice(i, i + 400);
  check(/\n\s+from,\n/.test(govde), "gövdeye o değişken kısayolla yazılıyor");
  /*
   * Gövdede HİÇ `from:` olmamalı. Kısayol (`from,`) kullanıldığı sürece
   * bu doğru; hesaplanmış her gönderen — kaynağı ne olursa olsun —
   * `from:` yazmak zorunda ve buraya takılır.
   */
  check(!/from:/.test(govde), "istek gövdesinde hesaplanmış bir gönderen alanı yok");
}
check(!/fromName/.test(email), "görünen adı çağıranın belirlediği alan da yok");

/* --- 2. TEK deneme ------------------------------------------------------- */
/*
 * Bir süre iki aşamalı gönderim vardı (özel başlıkla dene, reddedilirse
 * başlıksız tekrarla); o ihtiyaç gelen kutusuyla birlikte kalktı. Körlemesine
 * yeniden denemek TEHLİKELİ: fırlatılan bir hatada isteğin gidip gitmediği
 * bilinemez ve tekrar denemek alıcıya aynı postayı iki kez göndermek olabilir.
 */
check((email.match(/await fetch\(/g) ?? []).length === 1, "tek bir ağ çağrısı var");
{
  const govde = email.slice(email.indexOf("export async function sendEmail"));
  check(!/while|for \(/.test(govde), "sendEmail içinde döngü yok");
  check(!/denemeGonder/.test(govde), "ikinci deneme yolu kalmadı");
}

/* --- 3. Yapılandırma eksikse AĞA HİÇ ÇIKILMIYOR -------------------------- */
{
  const govde = email.slice(email.indexOf("export async function sendEmail"));
  const iYok = govde.indexOf('reason: "not-configured"');
  const iCagri = govde.indexOf("await fetch(");
  check(iYok > -1 && iCagri > iYok, "anahtar denetimi ağ çağrısından önce");
}

/* --- 4. Sessiz düşme yok ------------------------------------------------- */
/*
 * "Gönderildi" dönmek, kullanıcıya gitmemiş bir postayı gitmiş göstermek
 * olurdu — hatırlatma, davet, şifre sıfırlama: hepsi karşı tarafın beklediği
 * postalar.
 */
check(/if \(!res\.ok\)/.test(email), "HTTP reddi ayrıca denetleniyor");
{
  const i = email.indexOf("if (!res.ok)");
  const blok = email.slice(i, i + 300);
  check(/sent: false/.test(blok), "reddedilen istek başarı sayılmıyor");
  check(/res\.status/.test(blok), "hata metninde HTTP durumu taşınıyor");
}
check(/catch \(e\)[\s\S]{0,120}sent: false/.test(email), "fırlatılan hata da başarısızlık");
check(/return \{ sent: true, id: data\?\.id \}/.test(email), "yalnız başarılı yanıtta sent:true");

/* --- 5. Yanıt adresi: çağıran belirtmezse ortam değişkeninden ------------ */
/*
 * Bu alan olmadan yanıtlar `EMAIL_FROM` adresine gidiyordu ve o adresin bir
 * POSTA KUTUSU olmak zorunda değil — yani aile üyesinin hatırlatmaya verdiği
 * yanıt sessizce kayboluyordu.
 */
check(/input\.replyTo\?\.trim\(\) \|\| replyAddress\(\)/.test(email),
  "yanıt adresi çağırandan, yoksa EMAIL_REPLY_TO'dan");
check(/return r \? \{ reply_to: r \} : \{\}/.test(email), "ikisi de yoksa alan hiç gönderilmiyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
