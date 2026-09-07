import { readFileSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: OKUNAMAYAN dosya, BOŞ dosya DEĞİLDİR.
 *
 * Bu depodaki bütün yan depolar aynı iki aşamalı okumayı kullanıyor ve
 * hepsinde aynı hata vardı: indirme başarısız olduğunda BOŞ kayıt dönüyor,
 * çağıran da onun üstüne yazıyordu. Sonuç, tek bir geçici hatanın o ağacın
 * BÜTÜN tariflerini / mektuplarını / vefat ilanlarını / etkinliklerini
 * silmesi — üstelik sessizce: uç 200 dönüyor, kullanıcı listeyi boş görüyor
 * ve yeniden yazmaya başlıyor.
 *
 * Bu içerik ailenin kendi yazdığı şey; yedeği çoğu zaman yok.
 *
 * Kural: dosya GERÇEKTEN yoksa (`!blob`) boş; "var ama okuyamadım" HATA.
 * Gürültülü bir arıza, sessiz bir veri kaybından her zaman iyidir.
 */

const DEPOLAR = [
  "recipe-store",
  "letter-store",
  "obituary-store",
  "gathering-store",
  "bond-store",
  "story-store",
  "proposal-store",
  /* Meclis defteri (madde 59): okunamayan defterin üstüne yazmak, kapanmış
     bir meclis kararını yok etmek demek — kayıp burada geri getirilemez. */
  "council-store",
] as const;

for (const ad of DEPOLAR) {
  const src = kodu(read(`../lib/${ad}.ts`));

  /* Dosya yoksa boş — bu doğru ve KALMALI. */
  check(/if \(!blob\) return (empty\(\)|null)/.test(src), `${ad}: dosya YOKSA boş dönüyor`);

  /*
   * Ama okuma hatasında boş DÖNMEMELİ. Desen dar: `catch` bloğunun içinde
   * boş kayıt döndüren bir yol kalmamalı.
   */
  check(!/catch[^{]*\{\s*return empty\(\);/.test(src), `${ad}: catch içinde boş dönüş YOK`);
  check(!/if \(!res\.ok\) return empty\(\);/.test(src), `${ad}: HTTP hatasında boş dönüş YOK`);

  /*
   * OLUMLU İDDİA — ve bunu yazma sebebim kendi hatam.
   *
   * İlk hâlinde bu kapı yalnız YANLIŞ deseni yokluyordu. `if (!res.ok)`
   * koşulunu yanlışlıkla silip yerine çıplak bir `throw` bıraktığımda —
   * yani alım yolunu HER ZAMAN hata verir hâle getirdiğimde — kapı yeşil
   * kaldı, `tsc` ve `lint` de sustu. Yanlışın yokluğu, doğrunun varlığı
   * demek değil.
   */
  check(/if \(!res\.ok\) throw new Error\(/.test(src),
    `${ad}: HTTP hatası KOŞULA bağlı fırlatılıyor`);
  check(/if \(!res\.ok\)[\s\S]{0,200}?return normalize/.test(src),
    `${ad}: başarılı yanıt hâlâ ayrıştırılıyor (throw her yolu kapatmıyor)`);
  check(/throw/.test(src), `${ad}: okuma hatası yükseliyor`);
}

/* --- Kapsam ÖLÜ kalmasın ------------------------------------------------- */
/*
 * Yeni bir yan depo eklendiğinde bu listeye girmezse kural ona uygulanmaz ve
 * aynı hata sessizce geri gelir. Liste, `lib/*-store.ts` dosyalarının
 * TAMAMINI kapsamalı.
 */
{
  const { readdirSync } = await import("node:fs");
  const dizin = new URL("../lib/", import.meta.url).pathname;
  const gercek = readdirSync(dizin)
    .filter((f) => f.endsWith("-store.ts"))
    .map((f) => f.replace(/\.ts$/, ""));
  for (const d of gercek)
    check((DEPOLAR as readonly string[]).includes(d), `"${d}" bu kapının kapsamında`);
  check(gercek.length === DEPOLAR.length, `depo sayısı eşleşiyor (${gercek.length}/${DEPOLAR.length})`);
}

/* --- ÇEKİRDEK DEPOLAR — kapının asıl kapsaması gerekenler ---------------- */
/*
 * BU BÖLÜM, KAPININ KENDİ KUSURUNDAN DOĞDU.
 *
 * Yukarıdaki liste `lib/*-store.ts` DOSYA ADI kalıbıyla tanımlanıyordu ve
 * "kapsam ölü kalmasın" denetimi de yalnız o kalıptaki dosyaları sayıyordu.
 * Yani kapı eksiksiz GÖRÜNÜYORDU, oysa uygulamanın en pahalı üç deposu
 * kalıba girmediği için hiç denetlenmiyordu:
 *
 *   · `lib/users.ts`    — bütün hesapların kimliği (`users.json`)
 *   · `lib/members.ts`  — üyeler, davetler, paylaşım bağlantıları, eşleştirmeler
 *   · `lib/blob.ts`     — ağacın kendisi (`family-data-*`)
 *
 * Üçünde de hatanın orijinal hâli duruyordu: geçici bir okuma hatasında boş
 * dönmek ve `oku → değiştir → yaz` akışında o boşluğu diske basmak. Bir
 * denetimin "kapsamım tam" demesi, kapsamı DOSYA ADINDAN türetiyorsa hiçbir
 * şey ifade etmiyor — bu yüzden buradaki liste ELLE yazılı.
 */
{
  const cekirdek = [
    ["users", "lib/users.ts", "getUsersData", "hesap kaydı okunamadı"],
    ["members", "lib/members.ts", "getTreeAccess", "ağaç erişim kaydı okunamadı"],
    ["blob", "lib/blob.ts", "readFromBlob", "aile verisi okunamadı"],
  ] as const;

  for (const [ad, yol, islev, mesaj] of cekirdek) {
    const src = kodu(read(`../${yol}`));
    const i = src.indexOf(`function ${islev}`);
    const g = i > -1 ? src.slice(i, src.indexOf("\n}", i)) : "";
    check(i > -1, `${ad}: ${islev} bulundu`);

    /* Dosya GERÇEKTEN yoksa boş — yeni hesap/ilk kurulum için doğru olan bu. */
    check(/blobs\.length === 0\) return/.test(g), `${ad}: dosya YOKSA boş dönüyor`);

    /* "Var ama okuyamadım" HATA. Boş dönüş bu dalda olmamalı. */
    check(/statusCode !== 200\)/.test(g), `${ad}: yanıt kodu denetleniyor`);
    check(new RegExp(`statusCode !== 200\\)[\\s\\S]{0,120}?throw new Error\\(`).test(g),
      `${ad}: okunamayan dosyada HATA yükseliyor`);
    check(g.includes(mesaj), `${ad}: hata mesajı hangi deponun okunamadığını söylüyor`);

    /*
     * OLUMLU İDDİA — yukarıdaki bölümdeki aynı ders: yanlışın yokluğu,
     * doğrunun varlığı demek değil. `throw` her yolu kapatıyor olabilir;
     * başarılı yanıtın hâlâ ayrıştırıldığını ayrıca sınıyoruz.
     */
    check(/return (normalizeAccess|await new Response|data;|JSON\.parse)/.test(g),
      `${ad}: başarılı yanıt hâlâ okunuyor`);
  }

  /*
   * Ağaç okumasının SON ÇARESİ de boş dönmemeli. `getFamilyData` içindeki
   * `catch { return emptyData(); }` yukarıdaki kuralı tek satırda iptal
   * ediyordu: Postgres de Blob da okunamadığında kullanıcı ağacını boş
   * görüyor ve kaydettiğinde o boşluk diske iniyordu.
   */
  {
    const blob = kodu(read("../lib/blob.ts"));
    const i = blob.indexOf("export async function getFamilyData");
    const g = blob.slice(i, blob.indexOf("\n}", i));
    check(i > -1, "getFamilyData bulundu");
    check(/return await readFromBlob\(userId\);/.test(g), "son çare Blob'u okuyor");
    check(!/catch\s*\{\s*return emptyData\(\);/.test(g), "son çarede boş ağaç dönüşü YOK");
  }

  /*
   * Bozuk JSON önbelleğe AYRIŞTIRMADAN ÖNCE yazılmamalı: yazılırsa sonraki
   * dört saniye boyunca aynı ağaç aynı bozuk metinden okunmaya çalışılır ve
   * istek istek 500 ile boş arasında gidip gelir.
   */
  {
    const blob = kodu(read("../lib/blob.ts"));
    const i = blob.indexOf("async function readFromBlob");
    const g = blob.slice(i, blob.indexOf("\n}", i));
    const iParse = g.indexOf("JSON.parse(text)");
    const iCache = g.indexOf("cache.set(userId");
    check(iParse > -1 && iCache > iParse, "önbellek AYRIŞTIRMADAN SONRA yazılıyor");
  }
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
