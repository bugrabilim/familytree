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

/*
 * İKİ MUAFİYET KALDIRILDI — gerekçeleri yanlıştı.
 *
 * `family/cover` için yazılan gerekçe şuydu: "Kapak URL'si kişileri hiç
 * değiştirmiyor." Bu, NİYET için doğru ama YAZMA için yanlıştı: rota
 * `getFamilyData` ile ağacın tamamını okuyup üstünde tek alanı değiştirip
 * `saveFamilyData`ya olduğu gibi veriyor. Yani okuma ile yazma arasında biri
 * kişi eklemişse, o iş kapak değişikliğiyle birlikte siliniyordu. Kilit
 * değişen alanın büyüklüğüne göre değil, YAZILAN alanın büyüklüğüne göre
 * gerekiyor.
 *
 * `family/demo` için gerekçe "zaten mevcut veriyi değiştir demek ve arayüz
 * onay alıyor" idi. Kullanıcının onayladığı şey EKRANDA GÖRDÜĞÜ ağacın
 * üzerine yazmaktı; o sırada başka birinin eklediği kişiler onayın kapsamında
 * değil. Üstelik bu, depodaki en yıkıcı yazma — ağacın tamamını sabit bir
 * listeyle eziyor. Tek kişilik bir düzenleme korunurken bu işlemin
 * korunmaması ters bir öncelikti (aynı ters öncelik `bulk-delete` ve
 * `merge-all`da da vardı ve orada da düzeltilmişti).
 *
 * Bir muafiyet listesinin asıl riski bu: gerekçe bir kez yazılıyor, sonra
 * kimse okumuyor ve liste "kilitsiz olması NORMAL" diye okunmaya başlıyor.
 */
const MUAF: Record<string, string> = {
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
/*
 * UÇ LİSTESİ ARTIK ÖLÇÜLÜYOR, elle yazılmıyor: `versionMismatch` çağıran her
 * rota bu listeye kendiliğinden giriyor. Elle liste, düzeltilen hatanın
 * kaynağıydı — `/api/family/person` listede yoktu, dolayısıyla o uca sürümsüz
 * yazan üç bileşen yıllarca görünmedi.
 */
function kilitliUclar(dizin: string, onek: string): Array<{ uc: string; yontemler: string[] }> {
  const out: Array<{ uc: string; yontemler: string[] }> = [];
  for (const g of readdirSync(dizin, { withFileTypes: true })) {
    const yol = `${dizin}/${g.name}`;
    if (g.isDirectory()) out.push(...kilitliUclar(yol, `${onek}/${g.name}`));
    else if (g.name === "route.ts") {
      const src = readFileSync(yol, "utf8");
      if (!src.includes("versionMismatch(")) continue;
      /*
       * YÖNTEM DUYARLI. Bir rotanın PATCH'i kilitliyken POST'u kilitsiz
       * olabiliyor (`/api/family/stories`: POST talep açıyor, kilit yalnız
       * PATCH'te). Yöntemi ayırmayan bir kapı, kilitsiz yöntemlere yapılan
       * doğru çağrıları hatalı sayardı.
       */
      const yontemler: string[] = [];
      const parcalar = src.split(/export async function /).slice(1);
      for (const p of parcalar) {
        const ad = p.slice(0, p.indexOf("("));
        if (p.includes("versionMismatch(")) yontemler.push(ad);
      }
      if (yontemler.length) out.push({ uc: onek, yontemler });
    }
  }
  return out;
}
const KILITLI = kilitliUclar(kok, "/api");
const YAZAN_UCLAR = KILITLI.map((k) => k.uc);
check(YAZAN_UCLAR.length >= 15, `kilitli uçlar ölçüldü (${YAZAN_UCLAR.length})`);
check(YAZAN_UCLAR.includes("/api/family/person"), "kişi ucu listede (eski elle listede YOKTU)");

/*
 * DENETİM ÇAĞRI DÜZEYİNDE, dosya düzeyinde değil.
 *
 * Eski kapı "dosyada `mutationHeaders` geçiyor mu" diye soruyordu ve
 * `TableView` tam da bu yüzden yeşil geçiyordu: toplu silmede başlığı
 * gönderiyor, hücre düzenlemesinde göndermiyordu. Aynı dosyada aynı kural
 * bir çağrıda var, öbüründe yok — ve kilit `versionMismatch` başlık yokken
 * hiç denetim yapmadığı için sessizce ÖLÜYDÜ.
 */
/**
 * Uç adresinden ÇAĞRI deseni. Eşleşme TAM olmalı: ön-ek eşleşmesi
 * `/api/family/proposals`ı `/api/family/proposals/withdraw` çağrısına da
 * uyduruyordu — kilitli olmayan bir uç, kilitli sanılıp yanlış alarm
 * üretiyordu. Dinamik parça (`[id]`) şablon dizgesi olarak çağrılıyor.
 */
function cagriDeseni(uc: string): RegExp {
  const govde = uc
    .split("/")
    .map((p) => (p.startsWith("[") ? "\\$\\{[^}]*\\}" : p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  // Adresin BİTTİĞİ yer: tırnak/backtick ya da sorgu dizgesi.
  return new RegExp("fetch\\(\\s*[`\"']" + govde + "(?:[`\"']|\\?)");
}

for (const dosya of readdirSync(bilesenler)) {
  if (!dosya.endsWith(".tsx")) continue;
  const src = readFileSync(`${bilesenler}/${dosya}`, "utf8");
  for (const { uc, yontemler } of KILITLI) {
    const desen = cagriDeseni(uc);
    let i = -1;
    while ((i = src.indexOf("fetch(", i + 1)) !== -1) {
      const pencere = src.slice(i, i + 460);
      if (!desen.test(pencere.slice(0, 140))) continue;
      const yontem = pencere.match(/method:\s*"([A-Z]+)"/)?.[1] ?? "GET";
      if (!yontemler.includes(yontem)) continue; // o yöntem kilitli değil
      /*
       * Üç kabul edilebilir biçim:
       *  · `mutationHeaders()` — AĞACIN damgası (çoğu yüzey);
       *  · elle kurulan `x-base-version` — kendi deposunun damgası (meclis
       *    defteri; ağaç damgası olsaydı her kişi düzenlemesi defteri
       *    kilitlerdi, gerekçe rotada yazılı);
       *  · çağrı yerinde `kilit-yok:` işareti — o yöntemin KİLİTLİ OLMAYAN
       *    dalına giden çağrı (ör. bir bayrağı kapatmak).
       *
       * Üçüncüsü bilerek test dosyasında bir liste DEĞİL: liste zamanla
       * çürür ve neden orada olduğunu kimse bilmez. Gerekçe çağrının yanında
       * durursa, o çağrıyı değiştiren kişi gerekçeyi de görür.
       */
      const tasiyor =
        /headers:\s*mutationHeaders\(/.test(pencere) ||
        /"x-base-version"/.test(pencere) ||
        /kilit-yok:/.test(pencere);
      check(tasiyor, `${dosya}: ${uc} (${yontem}) sürüm başlığını göndermiyor (çağrı düzeyi)`);
    }
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
