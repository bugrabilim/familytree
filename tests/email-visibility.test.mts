import { readFileSync } from "node:fs";
import { emailEnvPresence } from "../lib/email.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * GİDEN POSTA KANALI GÖRÜNÜR OLMALI.
 *
 * Bu deponun tekrar eden arıza türü "fark edilmeyen bozulma" ve posta katmanı
 * tam olarak öyle kurulu: `RESEND_API_KEY` ya da `EMAIL_FROM` düştüğünde
 * `sendEmail` sessizce no-op döner, günlük iş `skipped:"email-not-configured"`
 * deyip 200 döner, hiçbir uç hata vermez. Dışarıdan bakınca uygulama sağlıklı
 * görünür ama hatırlatma, davet ve şifre sıfırlama postalarının hiçbiri
 * gitmez. `EMAIL_REPLY_TO` bir kat daha sinsi: gönderim çalışır, yalnız
 * ailenin verdiği yanıt hiçbir yere ulaşmaz.
 *
 * `CRON_SECRET` için bu sessizlik zaten `/api/health`te kırılmıştı; posta
 * kanalı orada YOKTU ve lansman listesindeki üç satır (`RESEND_API_KEY`,
 * `EMAIL_FROM`, `EMAIL_REPLY_TO`) ancak Vercel panelinden GÖZLE
 * doğrulanabiliyordu — yani hesap sahibi el olarak kullanılıyordu.
 */

/* ══ 1. `emailEnvPresence()` — çalıştırılan tablo ═══════════════════════ */

const YEDEK = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
};
function kur(v: Partial<Record<keyof typeof YEDEK, string | undefined>>) {
  for (const ad of Object.keys(YEDEK) as (keyof typeof YEDEK)[]) {
    const yeni = v[ad];
    if (yeni === undefined) delete process.env[ad];
    else process.env[ad] = yeni;
  }
}

kur({});
{
  const p = emailEnvPresence();
  check(p.RESEND_API_KEY === false && p.EMAIL_FROM === false && p.EMAIL_REPLY_TO === false,
    "hiçbiri tanımlı değilken üçü de false");
}

kur({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Soylus <bilgi@example.com>", EMAIL_REPLY_TO: "yanit@example.com" });
{
  const p = emailEnvPresence();
  check(p.RESEND_API_KEY && p.EMAIL_FROM && p.EMAIL_REPLY_TO, "üçü tanımlıyken üçü de true");
}

/*
 * DEĞER SIZDIRMIYOR. Uç sırları taşıyan bir yanıt üretiyor ve sözleşmesi
 * "yalnız var/yok". `RESEND_API_KEY`i olduğu gibi yazmak, sağlık yanıtını
 * okuyabilen herkese (izleme aracının günlükleri dahil) anahtarı vermek olur.
 */
{
  const p = emailEnvPresence();
  check(Object.values(p).every((v) => typeof v === "boolean"), "yanıt yalnız boolean taşıyor (değer değil)");
  check(!JSON.stringify(p).includes("re_x"), "anahtarın kendisi yanıta girmiyor");
}

/*
 * TRIM KURALI TEK YERDE. `replyAddress()` yalnız boşluktan oluşan değeri
 * "yok" sayıyor; buranın ikinci bir kopyası olsaydı ikisi ayrışırdı — bu
 * depoda beş ayrı hatanın kök nedeni tam olarak kuralın kopyalanmasıydı.
 */
kur({ EMAIL_REPLY_TO: "   " });
check(emailEnvPresence().EMAIL_REPLY_TO === false, "yalnız boşluktan oluşan yanıt adresi YOK sayılıyor");

kur(YEDEK);

/* ══ 2. KAPI: sağlık yanıtı kanalı gerçekten gösteriyor ═══════════════════ */

const health = kodu(read("../app/api/health/route.ts"));

check(/\.\.\.emailEnvPresence\(\)/.test(health), "posta değişkenlerinin varlığı env bloğunda");
check(/email: \{/.test(health), "services altında ayrı bir posta girdisi var");
check(/replyReachable/.test(health), "yanıt adresinin ulaşılabilirliği ayrıca bildiriliyor");

/*
 * `healthy` HESABI DEĞİŞMEMELİ. Kanal bilerek opsiyonel: anahtar yokken
 * uygulamanın geri kalanı çalışıyor. Posta `healthy`ye girseydi, e-postası
 * hiç kurulmamış her dağıtım (yerel geliştirme dahil) 503 dönerdi ve uca
 * bağlı izleme aracı sürekli öterdi — bir kez boşuna ötüp ciddiye alınmayı
 * bırakan bir alarm, hiç alarm olmamasıyla aynı şey.
 *
 * İDDİA SATIRIN KENDİSİNE BAKIYOR, desene değil: "email geçmiyor" biçiminde
 * gevşek bir iddia `... && (!emailAcik || postaOk)` mutasyonunu kaçırırdı.
 */
check(/const healthy = blob\.ok && cloudinary\.ok && \(!aynaGerekli \|\| supabase\.ok\);/.test(health),
  "healthy hesabı yalnız Blob + Cloudinary + (yapılandırılmışsa) ayna");
check(/counted: false/.test(health), "posta girdisi 'sayılmıyor' diye işaretli");

/*
 * PING YOK — bilerek. Resend anahtarları izin kapsamlı: yalnız gönderim
 * yetkisi verilmiş bir anahtar `GET /domains` çağrısında 401/403 döner, yani
 * gönderim gayet çalışırken sağlık kırmızıya düşerdi. Gerçekten
 * gönderebildiğimizi kanıtlamanın tek yolu posta ATMAK; bir sağlık ucunun
 * her çağrıldığında posta atması kabul edilemez.
 */
check(!/pingEmail|api\.resend\.com/.test(health), "sağlık ucu posta sağlayıcısına ağ çağrısı yapmıyor");

/* ══ 3. Lansman listesi bu yolu gösteriyor mu ════════════════════════════ */
/*
 * Liste "Vercel panelinden bak" derken uç bunu zaten söylüyorsa, hesap sahibi
 * gereksiz yere el olarak kullanılır. Belge ile uç arasındaki bağ burada
 * kilitleniyor.
 */
const liste = read("../docs/LANSMAN-CHECKLIST.md");
{
  const i = liste.indexOf("E-posta (gönderim):");
  const blok = liste.slice(i, i + 900);
  check(i > 0 && /\/api\/health/.test(blok), "lansman listesi posta değişkenlerini /api/health ile doğruluyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
