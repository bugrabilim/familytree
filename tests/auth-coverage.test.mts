import { readFileSync, readdirSync, statSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI KAPSAMASI: her API rotasının her YÖNTEMİ bir yetki denetiminden geçer.
 *
 * ## Neden yöntem başına
 *
 * Bu depoda tam olarak bu hata oldu: `/api/account/email`de misafir kapısı
 * GET'te vardı ama POST'ta YOKTU — yani asıl iş yapan yöntemde kısıt hiç
 * uygulanmıyordu. O günün kapı testi dosyada denetimin geçtiğini görüp
 * yeterli saymıştı. Dosya düzeyinde bakan bir kapı, kapının yarısının açık
 * olduğunu göremez.
 *
 * ## Neden bu test var (madde 35'in ön şartı)
 *
 * "Katkı verici" rolü eklemek `ORDER = ["viewer","editor","admin"]` dizisine
 * bir kademe sokmak demek — yani HER yetki kapısını yeniden değerlendirmek.
 * O değerlendirmenin bir dayanağı olmalı: hangi kapılar var, hepsi kapsanmış
 * mı? Bu test o envanteri makinede tutuyor.
 *
 * Elle test maddeleri (eski 55/56) listeden çıkarıldığı için bu kapsama
 * daha da önemli hâle geldi. Yerlerini TUTMUYOR — kapı testi "denetim doğru
 * katmanda mı" der, "davet edilen kişi girebiliyor mu" demez — ama en
 * azından hiçbir yüzeyin denetimsiz kalmadığını söyler.
 */

const KOK = new URL("../app/api", import.meta.url).pathname;

/**
 * OTURUM taşıyan denetimler — arkasında kimliği bilinen bir hesap var.
 */
const OTURUM_KORUMALARI = [
  "resolveActiveTree(",   // oturum + aktif ağaç (web ve mobil ortak)
  "auth()",               // NextAuth oturumu
  "isAdminAccount(",      // site işletmecisi
  "CRON_SECRET",          // zamanlanmış iş sırrı (sunucudan sunucuya)
  "verifyWebhook(",       // gelen webhook imzası (sağlayıcıdan)
  "verifyMobileToken(",   // mobil JWT — imzalı ve hesaba bağlı
];

/**
 * JETON taşıyan denetimler — kimlik YOK, yalnız "bu bağlantı bende".
 *
 * Ayrı tutulmaları şart: jeton bir kimlik değil, bir anahtar. Bağlantıyı
 * kimin elinde tuttuğu bilinemez (iletilmiş posta, ortak telefon, ekran
 * görüntüsü) ve "kim yaptı" sorulamaz. Böyle bir yüzeyde savunma ancak
 * SAYIDA olabilir — bu yüzden aşağıda oran sınırı ZORUNLU.
 */
const JETON_KORUMALARI = [
  "findValidInvite(",
  "findRequestByToken(",
  "submitContribution(",
  "readAskToken(",
  "answerWithToken(",
  "unsubscribeWithToken(",
  "findByToken(",
  "addRsvp(",
];

const KORUMALAR = [...OTURUM_KORUMALARI, ...JETON_KORUMALARI];

/**
 * OTURUMSUZ olmak ZORUNDA olanlar ve NEDENİ.
 *
 * Boş bir muafiyet listesi değil: yeni bir oturumsuz uç eklendiğinde test,
 * ya bir denetim ya da buraya gerekçe yazılmasını zorlar. Ayrıca her biri
 * ORAN SINIRI taşımak zorunda (aşağıda denetleniyor) — kimlik yoksa savunma
 * ancak sayı sınırında olabilir.
 */
const OTURUMSUZ: Readonly<Record<string, string>> = {
  "auth/[...nextauth]": "NextAuth'un kendi işleyicisi; oturumu O kuruyor.",
  register: "Hesap açma; tanımı gereği oturumdan önce.",
  "reset-password": "Şifresini unutmuş kullanıcının oturumu YOKTUR.",
  "reset-password/email": "Aynı gerekçe; kurtarma postası isteme.",
  "reset-password/token": "Bağlantı postadan geliyor, başka cihazda açılabilir.",
  "account/email/verify": "Doğrulama bağlantısı postadan; kimlik jetonda.",
  "mobile/login": "Mobil jetonu almanın yolu; öncesinde oturum olamaz.",
  "mobile/register": "Mobil kayıt; aynı gerekçe.",
  "v1/public/tree": "Herkese açık okuma API'si (madde 34); yayımlanan ağaç.",
  health: "Sağlık ucu; ayrıca kendi içinde oturumu okuyor.",
};

/** Oran sınırı beklenmeyen oturumsuz uçlar ve nedeni. */
const ORANSIZ: Readonly<Record<string, string>> = {
  "auth/[...nextauth]": "NextAuth kendi akışını yönetiyor; sarmalanmıyor.",
  health: "Yalnız okuma, yan etkisiz, veri döndürmüyor.",
};

function rotalar(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const ad of readdirSync(dir)) {
    const tam = `${dir}/${ad}`;
    if (statSync(tam).isDirectory()) out.push(...rotalar(tam, base ? `${base}/${ad}` : ad));
    else if (ad === "route.ts") out.push(base);
  }
  return out;
}

/** Yorumları ayıkla: denetimi ANLATAN yorum, denetimin kendisi değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const METOTLAR = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Dosyadaki yerel yardımcıların adları — gövdesi bir korumaya değiyorsa o ad
 * da koruma sayılıyor.
 *
 * Bu şart: depodaki rotaların çoğu denetimi `guard()` gibi tek bir yerel
 * işleve topluyor. Yalnız doğrudan çağrıları saymak, o dosyaları haksız yere
 * "denetimsiz" gösterir ve test gürültüye boğulup işe yaramaz hâle gelirdi.
 */
function korumaAdlari(src: string, aranan: readonly string[]): string[] {
  const adlar: string[] = [];
  const re = /(?:async\s+)?function\s+(\w+)\s*\([\s\S]*?\n\}/g;
  for (const m of src.matchAll(re)) {
    const [govde, ad] = [m[0], m[1]];
    if (METOTLAR.includes(ad as (typeof METOTLAR)[number])) continue;
    if (aranan.some((k) => govde.includes(k))) adlar.push(ad);
  }
  return adlar;
}

const hepsi = rotalar(KOK);
check(hepsi.length >= 60, `rotalar tarandı (${hepsi.length})`);

let denetlenenYontem = 0;
for (const r of hepsi) {
  const src = kodu(readFileSync(`${KOK}/${r}/route.ts`, "utf8"));
  const yerel = korumaAdlari(src, KORUMALAR);
  const yerelOturum = korumaAdlari(src, OTURUM_KORUMALARI);
  const taninan = [...KORUMALAR, ...yerel.map((a) => `${a}(`)];

  const bulunanlar = METOTLAR.filter((m) => src.includes(`export async function ${m}(`));

  if (r in OTURUMSUZ) {
    /*
     * Oturumsuz uçta savunma SAYIDA olmak zorunda: kimlik yoksa "kim
     * yaptı" sorulamaz, geriye yalnız "ne kadar sık" kalır.
     */
    if (!(r in ORANSIZ))
      check(src.includes("rateLimitShared("), `${r}: oturumsuz ama oran sınırlı`);
    continue;
  }

  check(bulunanlar.length > 0, `${r}: en az bir HTTP yöntemi var`);

  for (const m of bulunanlar) {
    const i = src.indexOf(`export async function ${m}(`);
    // Gövde: bu yöntemden bir SONRAKİ dışa aktarıma kadar.
    const sonraki = METOTLAR.map((x) => src.indexOf(`export async function ${x}(`, i + 10))
      .filter((x) => x > -1);
    const govde = src.slice(i, sonraki.length ? Math.min(...sonraki) : undefined);
    denetlenenYontem++;
    check(
      taninan.some((k) => govde.includes(k)),
      `${r} → ${m}: yetki denetimi YOK (yöntem gövdesinde)`
    );

    /*
     * YALNIZ JETONLA korunan yöntem, oturumsuz bir yüzeydir ve oran sınırı
     * taşımak ZORUNDA — arkasında kimlik yok, "kim yaptı" sorulamaz,
     * geriye yalnız "ne kadar sık" kalır.
     *
     * Bu iddia `tree/join`i yakaladı: davetle katılma ucu jetonla korunuyor
     * ama sınırsızdı. Jeton 192 bit olduğu için tahmin edilemez, ama uç
     * "bu şifre bu ağaçta kullanılıyor" diye 409 dönüyor — yani geçerli bir
     * davetiyesi olan biri, sınırsız deneme ile öbür üyelerin şifrelerini
     * yoklayabiliyordu.
     */
    const oturumlu = [...OTURUM_KORUMALARI, ...yerelOturum.map((a) => `${a}(`)]
      .some((k) => govde.includes(k));
    if (!oturumlu)
      check(src.includes("rateLimitShared("), `${r} → ${m}: yalnız jetonla korunuyor, oran sınırı ŞART`);
  }
}

/*
 * TABAN — yürüyücünün SESSİZCE hiçbir şey bulmamasına karşı.
 *
 * Dosya deseni ya da ayrıştırma bozulursa bu dosyadaki bütün iddialar
 * "denetlenecek bir şey yok" diye kendiliğinden yeşile döner; asıl tehlike
 * o. Sayı, gelen kutusu kaldırılınca 93'ten 88'e indi (webhook + yönetici
 * kutusunun beş yöntemi). Taban gerçek sayının biraz altında tutuluyor:
 * birkaç rotanın kazara silinmesi hâlâ takılsın, ama her rota eklendiğinde
 * burayı güncellemek gerekmesin.
 */
check(denetlenenYontem >= 85, `denetlenen yöntem sayısı (${denetlenenYontem})`);

/* --- Muafiyet listeleri ÖLÜ kalmasın ------------------------------------ */
for (const r of Object.keys(OTURUMSUZ))
  check(hepsi.includes(r), `oturumsuz listesindeki "${r}" hâlâ var olan bir rota`);
for (const r of Object.keys(ORANSIZ))
  check(r in OTURUMSUZ, `oransız listesindeki "${r}" oturumsuz listesinde de olmalı`);
for (const [r, neden] of Object.entries(OTURUMSUZ))
  check(neden.trim().length > 15, `"${r}" için gerekçe yazılmış`);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
