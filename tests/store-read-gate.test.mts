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
  "inbox-store",
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
  if (ad !== "inbox-store") {
    check(/if \(!res\.ok\) throw new Error\(/.test(src),
      `${ad}: HTTP hatası KOŞULA bağlı fırlatılıyor`);
    check(/if \(!res\.ok\)[\s\S]{0,200}?return normalize/.test(src),
      `${ad}: başarılı yanıt hâlâ ayrıştırılıyor (throw her yolu kapatmıyor)`);
  }
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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
