import { readdirSync, readFileSync, statSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: iyimser kilit (`x-base-version`) her YAZAN rotada.
 *
 * ## Neden kaynak düzeyinde
 *
 * Rotalar birim testi koşulamıyor; kilitlenen şey de bir davranış değil, bir
 * KAPSAM: "aile verisini yazan her rota, yazmadan önce sürümü denetler."
 * Kapsam iddiaları listelenerek değil, TARANARAK korunur — yoksa yarın
 * eklenen rota listeye girmediği için sessizce korumasız kalır.
 *
 * ## Muafiyetler açıkça sayılıyor
 *
 * "Unutulmuş" ile "bilerek muaf" ayrımı ancak gerekçe yazılırsa kalıcı olur.
 * Aşağıdaki liste, muafiyeti gerekçesiyle birlikte tutuyor; yeni bir rota
 * eklendiğinde ya kilidi koyacaksınız ya da buraya bir cümle yazacaksınız.
 */

const MUAF: Record<string, string> = {
  "family/cover":
    "Kapak URL'si kişileri hiç değiştirmiyor; sürüm çakışması diye reddetmek, " +
    "ilgisiz bir düzenleme yüzünden kapak değiştirmeyi engellemek olurdu.",
  "family/demo":
    "Demo yükleme zaten 'mevcut veriyi değiştir' demek ve arayüz onay alıyor; " +
    "hedefi olan şey üzerine yazmak.",
  "family/starter":
    "İskelet YALNIZ ağaç boşken çalışıyor (kendi denetimi var); dolu ağaçta " +
    "hiç yazmıyor, dolayısıyla ezecek bir şey yok.",
  /*
   * Zamanlanmış iş: bir İSTEK yok, dolayısıyla `x-base-version` başlığı da
   * yok — `versionMismatch` burada uygulanamaz. Yerine aynı işi yapan bir
   * korumaya bağlandı: yazmadan hemen önce ağaç YENİDEN okunuyor ve üstüne
   * yalnız bu işin ürettiği alanlar konuyor. Tehlike gerçekti: iş dakikalarca
   * posta gönderiyor ve başta okunan kopyayı olduğu gibi geri yazsaydı, o
   * sırada ağacına kişi ekleyen kullanıcının işi sessizce silinirdi.
   *
   * Aşağıda ayrıca o korumanın VARLIĞI denetleniyor — muafiyet, korumasızlık
   * anlamına gelmesin.
   */
  "cron/reminders":
    "Zamanlanmış iş; isteği ve sürüm başlığı yok. Yazmadan önce yeniden " +
    "okuyup yalnız kendi alanlarını uyguluyor.",
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

const kok = new URL("../app/api", import.meta.url).pathname;
const yazanlar: string[] = [];
for (const r of rotalar(kok)) {
  const src = readFileSync(`${kok}/${r}/route.ts`, "utf8");
  if (/\bsaveFamilyData\s*\(/.test(src)) yazanlar.push(r);
}

check(yazanlar.length >= 12, `yazan rotalar tarandı (${yazanlar.length})`);

for (const r of yazanlar) {
  const src = readFileSync(`${kok}/${r}/route.ts`, "utf8");
  const kilitli = /if \(versionMismatch\(/.test(src);
  if (MUAF[r]) {
    check(!kilitli, `${r}: muaf ve kilitsiz (${MUAF[r].slice(0, 40)}…)`);
    continue;
  }
  check(kilitli, `${r}: iyimser kilit YOK`);
  // Kilit YAZMADAN ÖNCE olmalı — sonrasında hiçbir işe yaramaz.
  if (kilitli) {
    const iKilit = src.indexOf("if (versionMismatch(");
    const iYaz = src.search(/await saveFamilyData\s*\(/);
    check(iKilit < iYaz, `${r}: kilit yazmadan ÖNCE`);
  }
}

// Muafiyet listesi ölü kalmasın: adı geçen her rota gerçekten var olmalı.
for (const r of Object.keys(MUAF))
  check(yazanlar.includes(r), `muafiyet listesindeki "${r}" hâlâ yazan bir rota`);

/*
 * İstemci tarafı: başlığı göndermeyen çağıran için kilit sessizce kapalı.
 * Bu yüzden doğrudan `fetch` eden bileşenler `mutationHeaders` kullanmalı.
 */
const bilesenler = new URL("../components", import.meta.url).pathname;
const YAZAN_UCLAR = [
  "/api/family/import", "/api/family/clear", "/api/family/history/restore",
  "/api/tree/graft", "/api/tree/merge-tree",
];
for (const dosya of readdirSync(bilesenler)) {
  if (!dosya.endsWith(".tsx")) continue;
  const src = readFileSync(`${bilesenler}/${dosya}`, "utf8");
  for (const uc of YAZAN_UCLAR) {
    if (!src.includes(`"${uc}"`)) continue;
    check(src.includes("mutationHeaders"),
      `${dosya}: ${uc} çağırıyor ama sürüm başlığını göndermiyor`);
  }
}

/* --- Muaf zamanlanmış iş kendi korumasını taşıyor ----------------------- */
{
  const cron = readFileSync(`${kok}/cron/reminders/route.ts`, "utf8");
  /*
   * Ölçüt "bir yerde okuyor" DEĞİL, "POSTALARDAN SONRA okuyor". Yalnız
   * `saveFamilyData`dan önce bir okuma aramak yetmiyordu: döngünün başındaki
   * ilk okuma da o koşulu sağlıyor ve yeniden-okuma silinse bile kapı yeşil
   * kalıyordu. Korumanın bütün değeri, okumanın dakikalarca süren gönderim
   * döngüsünden SONRA olmasında.
   */
  const iSon = cron.lastIndexOf("await sendEmail(");
  const iOku = cron.lastIndexOf("await getFamilyData(");
  const iYaz = cron.lastIndexOf("await saveFamilyData(");
  check(iSon > -1 && iOku > iSon, "cron/reminders: postalardan SONRA yeniden okuyor");
  check(iYaz > iOku, "cron/reminders: yazma o taze okumadan sonra");
  check(/taze\.people\[j\] = \{/.test(cron), "cron/reminders: taze kopyanın üstüne yazıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
