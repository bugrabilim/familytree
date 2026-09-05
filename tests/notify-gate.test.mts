import { readFileSync } from "node:fs";
import { isPublicPath } from "../lib/public-routes.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: bildirim onayları (madde 47/48).
 *
 * Burada kilitlenen şey bir hesap değil bir SÖZ: kullanıcı yalnız açıkça
 * onayladığı türde posta alır. İhlali sessiz ve geri alınamaz — istenmeyen
 * posta gönderildikten sonra geri alınamaz, ve yas gününü hatırlatan bir
 * postayı istememiş birine göndermek özür dilemekle telafi edilmez.
 */

const cron = readFileSync(new URL("../app/api/cron/reminders/route.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/account/notify/route.ts", import.meta.url), "utf8");
const users = readFileSync(new URL("../lib/users.ts", import.meta.url), "utf8");
const ayar = readFileSync(new URL("../components/NotifySection.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/SettingsDialog.tsx", import.meta.url), "utf8");

/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cK = kodu(cron), aK = kodu(api), uK = kodu(users);

/* --- ONAYLAR AYRI -------------------------------------------------------- */
/*
 * Doğum günü hatırlatması, vefat anması ve aylık bülten aynı şey değil: biri
 * kutlama, öbürü yas, üçüncüsü özet. Tek bayrağa bağlanırsa kullanıcı
 * birini isteyip öbürünü reddedemez.
 */
for (const alan of ["notifyReminders", "notifyMemorials", "notifyNewsletter"]) {
  check(cK.includes(alan), `cron ${alan} onayına bakıyor`);
  check(aK.includes(alan), `API ${alan} okuyup yazıyor`);
  check(ayar.includes(alan), `ayar ekranında ${alan} var`);
}

/* --- ADRES YOKSA HİÇBİR ŞEY GÖNDERİLMEZ ---------------------------------- */
check(/const gunluk = !!u\.notifyEmail &&/.test(cK), "günlük gönderim adres şartına bağlı");
check(/const bultenGunu = !!u\.notifyEmail &&/.test(cK), "bülten adres şartına bağlı");
check(/if \(!gunluk && !bultenGunu\) continue;/.test(cK), "ikisi de yoksa hesap atlanıyor");

/* --- İÇERİK ONAYA GÖRE KURULUYOR ----------------------------------------- */
/*
 * Onayı olmayan tür, listeye HİÇ girmemeli. "Gönder ama içini boş bırak"
 * yeterli değil: hatırlatmayı açan ama anmayı açmayan biri, anma satırı
 * taşıyan bir posta almamalı.
 */
check(/u\.notifyReminders \? todaysReminders\(/.test(cK), "hatırlatmalar yalnız onayla üretiliyor");
check(/u\.notifyMemorials \? todaysMemorialNotices\(/.test(cK), "anmalar yalnız onayla üretiliyor");
check(/if \(items\.length === 0 && anmalar\.length === 0\) continue;/.test(cK),
  "gönderilecek satır yoksa posta atılmıyor");

/* --- BOŞ BÜLTEN GÖNDERİLMEZ ---------------------------------------------- */
check(/if \(shouldSend\(b\)\)/.test(cK), "boş bülten gönderilmiyor (tek kapı: shouldSend)");

/* --- YENİ CRON AÇILMADI --------------------------------------------------- */
/*
 * Vercel Hobby'de cron sayısı sınırlı ve ikisi de dolu. Bülten yeni bir iş
 * olarak eklenemezdi; günlük işin İÇİNDE ayın ilk günü koşuyor.
 */
{
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
    crons?: Array<{ path: string }>;
  };
  check((vercel.crons ?? []).length === 2, `cron sayısı iki (${(vercel.crons ?? []).length})`);
  check(!(vercel.crons ?? []).some((c) => /newsletter|bulten|memorial/i.test(c.path)),
    "bülten/anma için ayrı cron açılmadı");
  check(/const ayinIlkGunu = today\.getDate\(\) === 1;/.test(cK), "bülten ayın ilk günü koşuyor");
}

/* --- ADRES SİLİNİNCE ONAYLAR DA DÜŞER ------------------------------------ */
/*
 * Bayraklar açık kalsaydı, kullanıcı sonradan yeni bir adres yazdığında hiç
 * onaylamadığı postaları almaya başlardı — onayı adrese değil kişiye ait
 * saymak olurdu.
 */
check(/if \(!user\.notifyEmail\) \{/.test(uK), "adres boşsa özel dal var");
{
  const i = uK.indexOf("if (!user.notifyEmail) {");
  const blok = uK.slice(i, i + 400);
  for (const alan of ["notifyReminders", "notifyMemorials", "notifyNewsletter"])
    check(new RegExp(`user\\.${alan} = undefined;`).test(blok), `adres silininde ${alan} düşüyor`);
}

/* --- YETKİ --------------------------------------------------------------- */
check(/if \(!ctx\.isFounder\)/.test(aK), "yalnız hesap sahibi");
check(/canDo\(ctx\.isGuest, "email"\)/.test(aK), "misafir kapısı yerinde");
check(!isPublicPath("/api/account/notify"), "bildirim ayarı ucu oturumsuz açık DEĞİL");

/* --- ARAYÜZ GERÇEKTEN BAĞLI ---------------------------------------------- */
/*
 * Uç aylardır vardı ama onu çağıran bir ekran YOKTU: kimse abone olamıyordu,
 * günlük iş her gece koşup kimseye posta göndermiyordu. Özellik teknik olarak
 * "bitmiş", pratikte erişilemezdi.
 */
check(/fetch\("\/api\/account\/notify"/.test(ayar), "ayar bileşeni ucu çağırıyor");
check(/<NotifySection \/>/.test(dialog), "bileşen Ayarlar penceresinde render ediliyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
