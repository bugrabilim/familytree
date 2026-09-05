import { readFileSync } from "node:fs";
import { HISTORIC_TO_MODERN, historicNamesOf, modernName, normalizeHistoric } from "../lib/historic-places.ts";
import { GAZETTEER, resolvePlace } from "../lib/places.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * TARİHÎ YER ADLARI (madde 37).
 *
 * Buradaki en kritik iddia bir DAVRANIŞ değil, bir DEĞİŞMEZLİK: bugün bir
 * yere oturan hiçbir metnin pini kaymayacak. Maddenin tek gerçek riski
 * buydu — `resolvePlace` ortak çözüm yolu ve oraya yapılan her ekleme, doğru
 * duran pinleri sessizce kaydırabilir.
 */

/* ── Eşleme sözlüğünün kendisi sağlam mı ─────────────────────────────────── */
{
  const hedefler = Object.values(HISTORIC_TO_MODERN);
  check(hedefler.length > 50, `sözlükte kayda değer sayıda eşleme var (${hedefler.length})`);

  /*
   * HER hedef `GAZETTEER`de OLMALI. Olmasaydı eşleme sessizce ölü kalırdı:
   * kod çalışır, test geçer, ama o ad hiçbir zaman bir yere oturmaz. Tek bir
   * yazım hatası (ör. "Elazig") bu şekilde fark edilmeden yaşardı.
   */
  for (const [eski, yeni] of Object.entries(HISTORIC_TO_MODERN))
    check(yeni in GAZETTEER, `"${eski}" → "${yeni}" hedefi sözlükte var`);

  /* Kaynağı ZATEN sözlükte olan eşleme hiç çalışmaz (tam eşleşme önce döner). */
  for (const eski of Object.keys(HISTORIC_TO_MODERN))
    check(!(eski in GAZETTEER), `"${eski}" GAZETTEER'de değil (yoksa eşleme ölü olurdu)`);

  /* Kimlik eşlemesi anlamsız: kendisine eşlenen ad zaten çözülürdü. */
  for (const [eski, yeni] of Object.entries(HISTORIC_TO_MODERN))
    check(normalizeHistoric(eski) !== normalizeHistoric(yeni), `"${eski}" kendisine eşlenmiyor`);
}

/* ── Normalleştirme `lib/places.ts` ile AYNI olmalı ──────────────────────── */
/*
 * İki dosyada iki kopya var (bağımlılık yönü yüzünden). Ayrışırlarsa
 * "İstanbul" bir dosyada çözülüp öbüründe çözülmez ve bunu kimse fark etmez.
 */
{
  const src = readFileSync(new URL("../lib/places.ts", import.meta.url), "utf8");
  const i = src.indexOf("function normalize(s: string): string {");
  const govde = src.slice(i, src.indexOf("\n}", i));
  for (const parca of ['replace(/İ/g, "i")', 'replace(/I/g, "ı")', 'toLocaleLowerCase("tr")'])
    check(govde.includes(parca), `places.normalize aynı kuralı taşıyor: ${parca}`);
  check(normalizeHistoric("İSTANBUL") === "istanbul", "büyük İ doğru küçülüyor");
  check(normalizeHistoric("ISPARTA") === "ısparta", "büyük I noktasız ı oluyor");
  check(normalizeHistoric("  Smyrna  ") === "smyrna", "kırpılıyor");
}

/* ── Arama ───────────────────────────────────────────────────────────────── */
{
  check(modernName("Smyrna") === "İzmir", "Smyrna → İzmir");
  check(modernName("smyrna") === "İzmir", "küçük harfle de");
  check(modernName("SMYRNA") === "İzmir", "büyük harfle de");
  check(modernName("  Angora ") === "Ankara", "boşluklu");
  check(modernName("Elaziz") === "Elazığ", "Elaziz → Elazığ");
  check(modernName("Kırkkilise") === "Kırklareli", "Kırkkilise → Kırklareli");
  check(modernName("bilinmeyen-yer") === null, "bilinmeyen ad null");
  check(modernName("") === null, "boş metin null");
}
{
  const eskiler = historicNamesOf("İstanbul");
  check(eskiler.length >= 5, `İstanbul'un eski adları listeleniyor (${eskiler.length})`);
  check(eskiler.includes("Konstantiniyye"), "Konstantiniyye listede");
  check(historicNamesOf("istanbul").length === eskiler.length, "ters arama da harf kutusundan bağımsız");
  check(historicNamesOf("Yokşehir").length === 0, "bilinmeyen modern ad boş liste");
}

/* ── DEĞİŞMEZLİK: bugün çözülen hiçbir şey KAYMIYOR ─────────────────────── */
/*
 * Bu bölüm maddenin bütün riskini karşılıyor. Tarihî katman `resolvePlace`in
 * EN SONUNDA ve yalnız modern yol `null` döndükten sonra çalışıyor;
 * dolayısıyla bugün bir yere oturan hiçbir metin ona hiç uğramıyor.
 *
 * Aşağıda sözlükteki HER ad ve gerçek hayatta görülen çok parçalı biçimler
 * tek tek deneniyor: hepsi kendi koordinatına oturmalı.
 */
{
  let sapma = 0;
  for (const [ad, koord] of Object.entries(GAZETTEER)) {
    const r = resolvePlace(ad);
    if (!r || r.lat !== koord.lat || r.lng !== koord.lng) {
      sapma++;
      if (sapma <= 3) console.log(`  ↳ kayma: "${ad}"`);
    }
  }
  check(sapma === 0, `sözlükteki ${Object.keys(GAZETTEER).length} adın hiçbiri kaymadı`);
}
{
  /* e-Devlet biçimi ve virgüllü biçim — eskiden olduğu gibi. */
  const esit = (a: { lat: number; lng: number } | null, b: { lat: number; lng: number }) =>
    !!a && a.lat === b.lat && a.lng === b.lng;
  check(esit(resolvePlace("Ordu / Gürgentepe / Evlek"), GAZETTEER.Ordu), "il/ilçe/köy → il");
  check(esit(resolvePlace("İstanbul / Şişli"), GAZETTEER["Şişli"]), "eğik çizgide en ÖZEL parça");
  check(esit(resolvePlace("Köln, Almanya"), GAZETTEER["Köln"]), "virgülde en özel parça BAŞTA");
  check(resolvePlace("") === null, "boş metin null");
  check(resolvePlace("Hiçbiryer") === null, "tanınmayan ad null kalıyor");
}

/* ── YENİ davranış: eskiden null olan adlar artık oturuyor ──────────────── */
{
  const esit = (a: { lat: number; lng: number } | null, b: { lat: number; lng: number }) =>
    !!a && a.lat === b.lat && a.lng === b.lng;
  check(esit(resolvePlace("Smyrna"), GAZETTEER["İzmir"]), "tek parça tarihî ad çözülüyor");
  check(esit(resolvePlace("Konstantiniyye"), GAZETTEER["İstanbul"]), "Konstantiniyye → İstanbul");
  check(esit(resolvePlace("Elaziz"), GAZETTEER["Elazığ"]), "Elaziz → Elazığ");
  /* Çok parçalı metinde de, ama yine yalnız modern yol tükendiyse. */
  check(esit(resolvePlace("Mamüretülaziz / Harput"), GAZETTEER["Elazığ"]), "çok parçalı tarihî ad");
  check(esit(resolvePlace("Kırkkilise, Türkiye"), GAZETTEER["Kırklareli"]), "virgüllü tarihî ad");
}

/* --- SIRA: modern GEÇİŞ tarihî geçişten ÖNCE bitmeli -------------------- */
/*
 * Buradaki iddia bu maddenin bütün riskini taşıyor ve İLK HÂLİNDE YOKTU:
 * "hiçbir pin kaymadı" testi, tarihî katmanı başa almaya rağmen yeşil
 * kalıyordu. Sebep, testin yalnız TEK PARÇALI adları denemesiydi — hiçbir
 * tarihî ad sözlükte olmadığı için (yukarıda denetleniyor) tek parçada sıra
 * zaten sonucu değiştiremez.
 *
 * Sıranın gerçekten önemli olduğu yer ÇOK PARÇALI metin: aşağıdaki
 * "Karin / Trabzon"da modern geçiş Trabzon'u bulur, tarihî geçiş ise
 * Karin'i Erzurum'a çevirir. Modern geçiş önce bitmezse pin 300 km kayar.
 */
{
  const esit = (a: { lat: number; lng: number } | null, b: { lat: number; lng: number }) =>
    !!a && a.lat === b.lat && a.lng === b.lng;
  check(esit(resolvePlace("Karin / Trabzon"), GAZETTEER.Trabzon),
    "eğik çizgide MODERN parça kazanıyor (tarihî parça pini kaydırmıyor)");
  check(esit(resolvePlace("Selanik, Karin"), GAZETTEER.Selanik),
    "virgülde de modern parça kazanıyor");
  check(esit(resolvePlace("Smyrna / İzmit"), GAZETTEER["İzmit"]),
    "modern parça varken tarihî ad devreye girmiyor");
}

/* --- Normalleştirmenin İKİ kopyası aynı kalmalı -------------------------- */
/*
 * Kural gövdesi kaynak düzeyinde denetleniyor, çünkü DAVRANIŞLA ayırt
 * edilemiyor: tam ICU taşıyan bir Node'da `toLocaleLowerCase("tr")` zaten
 * "I"yı "ı" yapıyor, dolayısıyla açık `replace` satırı silinse bile testler
 * yeşil kalır. O satır ICU'suz ortamlar için savunma ve sessizce
 * kaybolmaması gerekiyor.
 */
{
  const src = readFileSync(new URL("../lib/historic-places.ts", import.meta.url), "utf8");
  const i = src.indexOf("export function normalizeHistoric(s: string): string {");
  const govde = src.slice(i, src.indexOf("\n}", i));
  for (const parca of ['replace(/İ/g, "i")', 'replace(/I/g, "ı")', 'toLocaleLowerCase("tr")'])
    check(govde.includes(parca), `normalizeHistoric aynı kuralı taşıyor: ${parca}`);
}

/* --- MODERN yol tarihî katmanı EZİYOR ----------------------------------- */
/*
 * Sıranın kanıtı: hem modern hem tarihî yolla çözülebilen bir metinde modern
 * karşılık kazanmalı. Tersi olsaydı, bugün doğru oturan pinler tarihî
 * eşlemenin gösterdiği yere kayardı — maddenin bütün riski buydu.
 */
{
  const r = resolvePlace("Antep");
  check(!!r && r.lat === GAZETTEER.Antep.lat && r.lng === GAZETTEER.Antep.lng,
    "sözlükte kendi girişi olan eski ad KENDİ koordinatını koruyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
