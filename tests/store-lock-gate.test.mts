import { readFileSync, readdirSync } from "node:fs";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: kayıp yazma koruması her JSON deposunda (denetim A10).
 *
 * ## Neden TARAMA
 *
 * Koruma `lib/proposal-store.ts`te vardı ve yalnız orada. Öbür yedi depo
 * korumasızdı ve kimse fark etmemişti, çünkü hiçbir iddia "her depoda var
 * mı" diye sormuyordu. Bu dosya `lib/*-store.ts` deseninin tamamını geziyor:
 * yarın eklenen sekizinci depo da korumasız kalamıyor.
 */

const depolar = readdirSync(new URL("../lib/", import.meta.url))
  .filter((f) => f.endsWith("-store.ts"));
check(depolar.length >= 7, `depolar tarandı (${depolar.length})`);

for (const ad of depolar) {
  const src = kodu(read(`../lib/${ad}`));
  /*
   * Yazma çağrısı (`saveX(treeId, …)`) YALNIZ sarmalayıcının içinden
   * geçmeli. Doğrudan çağrı, o yolun korumasız olduğu anlamına gelir —
   * bir deponun bir mutatörünü dönüştürmeyi unutmak tam olarak böyle
   * görünürdü ve tek bir "bir yerde mutate var" iddiası bunu göremezdi.
   */
  const iSarmal = src.indexOf("function mutate<T>(");
  check(iSarmal > -1, `${ad}: sarmalayıcı tanımlı`);
  const sarmalSonu = src.indexOf("\n}", iSarmal);
  const disarida = [...src.matchAll(/await save[A-Za-z]*\(\s*treeId/g)].filter(
    (m) => m.index! < iSarmal || m.index! > sarmalSonu
  );
  /*
   * Sarmalayıcının KENDİ yazması meşru — yasak olan onun DIŞINDAKİ yazma.
   * İlk yazdığımda ayrım yoktu ve iddia, kuralı zaten uygulayan
   * `proposal-store.ts`i sahte kırmızıya düşürdü.
   */
  check(disarida.length === 0, `${ad}: sarmalayıcı dışında yazma yok (${disarida.length})`);

  /* Ve depo ORTAK katmanı kullanıyor — kendi kopyasını yazmıyor. */
  check(/mutateStore\(/.test(src), `${ad}: ortak koruma kullanılıyor`);
}

/* ══ Ortak katmanın kuralları ══════════════════════════════════════════ */
{
  const lib = kodu(read("../lib/store-mutate.ts"));
  /*
   * YAZMADAN HEMEN ÖNCE yeniden okuma: pencereyi kapatmıyor, DARALTIYOR.
   * Eskiden pencere bütün iş mantığı boyunca (okuma, hesaplama, doğrulama,
   * yazma) açıktı; şimdi son okumadan yazmaya kadar.
   */
  check(/const taze = await oku\(\);/.test(lib), "yazmadan önce yeniden okunuyor");
  check(/if \(taze\.updatedAt !== damga\) continue;/.test(lib), "damga değiştiyse baştan alınıyor");
  /* Yazma yoksa çakışma denetimi de yok — boş işlemi ağ trafiğine çevirmeyelim. */
  check(/if \(!r\.yaz\) return r\.sonuc;/.test(lib), "yazmayan işlem tek okumayla dönüyor");
  /*
   * Denemeler tükendiğinde SESSİZCE BAŞARILI DÖNÜLMÜYOR. Dönseydi tam
   * olarak önlemeye çalıştığımız arıza üretilirdi: kullanıcı yazdığını
   * sanır, yazılmamıştır.
   */
  check(/throw new Error\(/.test(lib), "denemeler tükenince fırlatıyor");
  const iSon = lib.lastIndexOf("throw new Error(");
  const iDongu = lib.indexOf("for (let i = 0");
  check(iSon > iDongu, "fırlatma döngünün DIŞINDA (yani gerçekten tükendiğinde)");
}

/* ══ ERİŞİM KAYDI da korumalı ═════════════════════════════════════════ */
/*
 * `lib/members.ts` `*-store.ts` desenine uymuyor (adı öyle değil) ama aynı
 * işi yapıyor ve içindekiler daha kritik: üyeler, davetler, PAYLAŞIM
 * BAĞLANTILARI ve eşleşmeler. Burada kaybolan bir satır yalnız veri değil
 * YETKİ kaybı — silinen bir üye satırı erişim kaybı, silinen bir paylaşım
 * bağlantısı dışarıya verilmiş bir adresin ölmesi demek.
 *
 * Desene uymadığı için yukarıdaki tarama onu görmüyordu; ayrıca soruluyor.
 */
{
  const m = kodu(read("../lib/members.ts"));
  check(/mutateStore\(/.test(m), "erişim kaydı ortak korumayı kullanıyor");
  const iSarmal = m.indexOf("function mutate<T>(");
  const sarmalSonu = m.indexOf("\n}", iSarmal);
  const disarida = [...m.matchAll(/await saveTreeAccess\(/g)].filter(
    (x) => x.index! < iSarmal || x.index! > sarmalSonu
  );
  check(disarida.length === 0, `sarmalayıcı dışında yazma yok (${disarida.length})`);
  /*
   * Damga ZORUNLU tipte dönüyor: `TreeAccess`te isteğe bağlı ama
   * `normalizeAccess` her okumada bir değer koyuyor. Tipin bunu söylemesi
   * şart — `undefined === undefined` her ESKİ ağacı "değişmemiş" gösterirdi,
   * yani koruma tam da en eski ağaçlarda çalışmazdı.
   */
  check(/Promise<TreeAccess & \{ updatedAt: string \}>/.test(m), "okuyucu damgayı zorunlu kılıyor");
  check(/data\.updatedAt = new Date\(\)\.toISOString\(\);/.test(m), "her yazma damgayı tazeliyor");
  const ta = kodu(read("../lib/tree-access.ts"));
  check(/updatedAt: typeof data\.updatedAt === "string"/.test(ta), "eski dosyaya başlangıç damgası veriliyor");

  /*
   * ZİYARET SAYACI kayıp güncellemenin ders kitabı örneği: oku, bir artır,
   * geri yaz. Aynı bağlantı bir gruba gönderildiğinde birkaç kişinin aynı
   * anda açması beklenen durum — ve aynı yazma erişim kaydının TAMAMINI geri
   * yazdığı için arada eklenen bir üye de siliniyordu.
   */
  const iZiyaret = m.indexOf("export async function recordShareVisit");
  const ziyaret = m.slice(iZiyaret, m.indexOf("\n}", m.indexOf("mirror: false }", iZiyaret)));
  check(/await mutate<void>\(treeId,/.test(ziyaret), "ziyaret sayacı korumalı");
  check(/mirror: false/.test(ziyaret), "sayaç yazması aynayı çağırmıyor (gereksiz yük)");
}

/* ══ A5: yarım kalan ayna güncel görünmüyor ════════════════════════════ */
/*
 * En tehlikeli yarım hâl: damga yazıldı, kişiler yazılamadı. O anda Postgres
 * YENİ damgayı ve ESKİ kişileri taşıyor, Blob ikisini de yeni. Okuma
 * yolunun iki sinyali de yanmıyor (damgalar eşit, sayı eşit) ve Postgres
 * kazanıyor: kullanıcının az önce yazdığı alanlar ESKİ hâliyle okunuyor,
 * sonra rota onu Blob'a geri yazıyor — düzenleme kalıcı olarak kayboluyor.
 */
{
  const blob = kodu(read("../lib/blob.ts"));
  const i = blob.indexOf('console.warn(`[cift-yazma] people→postgres');
  check(i > -1, "ayna hata dalı bulundu");
  const dal = blob.slice(i, i + 900);
  check(/dbSetTreeUpdatedAt\(userId, onceki\)/.test(dal), "yarım aynanın damgası GERİ ALINIYOR");
  check(/freshOldJson/.test(dal), "geri alınan değer ÖNCEKİ damga");
  /* Geri alma da düşerse sessiz geçilmiyor: veri kaybı penceresi açık kalıyor. */
  check(/console\.error\(/.test(dal), "geri alma başarısızlığı HATA seviyesinde");

  /* Ve damga alanı `null` kabul etmeli, yoksa geri alma hiç yazılamazdı. */
  const db = kodu(read("../lib/db.ts"));
  check(/dbSetTreeUpdatedAt\(treeId: string, iso: string \| null\)/.test(db),
    "damga yazıcısı null kabul ediyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
