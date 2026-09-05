import { readFileSync } from "node:fs";
import { historicHint, searchPlaces } from "../lib/place-search.ts";
import { GAZETTEER } from "../lib/places.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const adlar = (q: string, n = 8) => searchPlaces(q, n).map((h) => h.name);

/**
 * YERLEŞİM ARAMA (madde 38).
 *
 * Öneri listesinin en kötü hâli, YANLIŞ olanı kolaylaştırmasıdır: kullanıcı
 * yazarken listenin başındakine bakıyor ve rastgele bir sıra, doğru adı alta
 * atıp yanlışı öne çıkarabilir. Sıralama iddiaları bu yüzden burada.
 */

/* ── Temel arama ─────────────────────────────────────────────────────────── */
{
  check(adlar("izmir").includes("İzmir"), "modern ad bulunuyor");
  check(adlar("İZMİR").includes("İzmir"), "büyük harf fark etmiyor");
  check(adlar("  izmir  ").includes("İzmir"), "kırpılıyor");
  check(searchPlaces("").length === 0, "boş sorgu sonuç vermiyor");
  check(searchPlaces("a").length === 0, "tek harf sonuç vermiyor (gürültü)");
  check(searchPlaces("zzzzq").length === 0, "eşleşmeyen sorgu boş");
}

/* ── TARİHÎ ad da bulunuyor — maddenin sebebi ───────────────────────────── */
{
  const r = searchPlaces("smyrna");
  check(r.length > 0, "tarihî ad sonuç veriyor");
  check(r[0].name === "İzmir", "tarihî ad MODERN karşılığını döndürüyor");
  check(r[0].matchedAs === "Smyrna", "hangi eski addan eşleştiği taşınıyor");
  check(r[0].coords.lat === GAZETTEER["İzmir"].lat, "koordinat modern addan");

  check(adlar("konstantiniyye")[0] === "İstanbul", "Konstantiniyye → İstanbul");
  check(adlar("elaziz")[0] === "Elazığ", "Elaziz → Elazığ");
  check(adlar("kırkkilise")[0] === "Kırklareli", "Kırkkilise → Kırklareli");
}

/* --- Aynı yer İKİ KEZ listelenmiyor -------------------------------------- */
/*
 * "İstanbul" hem modern adla hem de birçok eski adının hedefi olarak
 * eşleşebilir. İki satır göstermek, kullanıcıya aynı yeri iki farklı şeymiş
 * gibi sunmak olurdu.
 */
{
  const r = searchPlaces("istanbul", 20);
  check(r.filter((h) => h.name === "İstanbul").length === 1, "İstanbul tek satır");
  const hepsi = searchPlaces("a", 50);
  check(new Set(hepsi.map((h) => h.name)).size === hepsi.length, "sonuçlarda yineleme yok");
}

/* --- Eşitlikte MODERN eşleşme kazanıyor --------------------------------- */
/*
 * "İzmir" yazan kullanıcıya sonucun "Smyrna → İzmir" diye görünmesi doğru
 * ama kafa karıştırıcı olurdu: kendi yazdığı adı bir "eski ad" gibi görürdü.
 */
{
  const r = searchPlaces("izmir");
  const izmir = r.find((h) => h.name === "İzmir")!;
  check(izmir.matchedAs === undefined, "modern adla eşleşince eski ad etiketi YOK");
  check((izmir.historic ?? []).includes("Smyrna"), "öbür eski adlar yine de taşınıyor");

  /*
   * ASIL SINAMA: hem modern ad hem bir eski ad AYNI güçte eşleştiğinde ne
   * olur? "an" öneki hem "Ankara"ya hem "Angora"ya uyuyor ve ikisi de aynı
   * yeri gösteriyor. Modern olan kazanmalı.
   *
   * "izmir" sorgusu bunu SINAMIYORDU: "Smyrna" o sorguyla hiç eşleşmediği
   * için ortada yarış yoktu ve iddia boşuna geçiyordu. Mutasyon testi bunu
   * gösterdi — eşitlik koşulu silindiğinde hiçbir test düşmemişti.
   */
  const an = searchPlaces("an", 30).find((h) => h.name === "Ankara")!;
  check(!!an, "eşit güçte yarışan yer listede");
  check(an.matchedAs === undefined, "eşitlikte MODERN ad kazanıyor (Angora değil)");
  check((an.historic ?? []).includes("Angora"), "eski ad yine de gösterimde");
}

/* ── SIRALAMA ────────────────────────────────────────────────────────────── */
{
  /* Tam eşleşme önekten, önek içerikten önce. */
  const r = adlar("ordu", 20);
  check(r[0] === "Ordu", "tam eşleşme başta");

  const van = adlar("van", 20);
  check(van[0] === "Van", "kısa tam eşleşme, içeren adlardan önce");

  /* Önek, içerik eşleşmesini geçiyor. */
  const kar = searchPlaces("kar", 20);
  const iKarabuk = kar.findIndex((h) => h.name === "Karabük");
  const iAnkara = kar.findIndex((h) => h.name === "Ankara");
  check(iKarabuk > -1, "önek eşleşmesi listede");
  check(iAnkara === -1 || iKarabuk < iAnkara, "önek eşleşmesi içerik eşleşmesinden önce");
}
{
  /* Eşit güçte kısa ad önce: daha genel olan daha olası. */
  const r = adlar("ada", 20);
  const iAdana = r.indexOf("Adana");
  const iAdapazari = r.indexOf("Adapazarı");
  check(iAdana > -1 && iAdapazari > -1, "iki aday da listede");
  check(iAdana < iAdapazari, "kısa ad önce");
}

/* --- Sınır sayısı gerçekten uygulanıyor --------------------------------- */
{
  check(searchPlaces("a", 3).length <= 3, "limit uygulanıyor");
  check(searchPlaces("a", 1).length <= 1, "limit 1 çalışıyor");
}

/* --- Her sonuç GERÇEK bir koordinat taşıyor ----------------------------- */
/*
 * `coords` `GAZETTEER`den okunuyor; bir eşleme hedefi sözlükte olmasaydı
 * burada `undefined` dönerdi ve arayüz sessizce bozuk bir kayıt gösterirdi.
 */
{
  let bos = 0;
  for (const q of ["a", "i", "ka", "sm", "kon", "el"])
    for (const h of searchPlaces(q, 50))
      if (!h.coords || typeof h.coords.lat !== "number") bos++;
  check(bos === 0, "her sonucun koordinatı var");
}

/* ── İpucu: TAM eşleşme, önek değil ─────────────────────────────────────── */
/*
 * "Elaz" yazarken "Elaziz → Elazığ" demek, kullanıcı o adı henüz yazmamışken
 * onun adına varsayımda bulunmak olurdu.
 */
{
  const h = historicHint("Elaziz");
  check(h?.typed === "Elaziz" && h?.modern === "Elazığ", "tam yazımda ipucu çıkıyor");
  check(historicHint("elaziz")?.modern === "Elazığ", "harf kutusu fark etmiyor");
  check(historicHint("  Smyrna ")?.modern === "İzmir", "boşluk kırpılıyor");
  check(historicHint("Elaz") === null, "YARIM yazımda ipucu YOK");
  check(historicHint("Elazığ") === null, "modern ad yazılınca ipucu yok");
  check(historicHint("") === null, "boş metin null");
  check(historicHint("Ordu") === null, "tarihî olmayan ad null");
}

/* ── KAPI: öneri katmanı yazılanı DEĞİŞTİRMİYOR ─────────────────────────── */
/*
 * Dedenin nüfus kâğıdında "Elaziz" yazıyorsa kayıtta da öyle kalabilmeli.
 * Ailenin belgesinde duran adı bugünkü adla değiştirmek, kaydı "temizlemek"
 * adına tarihî bilgiyi silmek olurdu — ve geri alınamaz.
 */
{
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const kodu = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const form = kodu(read("../components/PersonForm.tsx"));
  const girdi = kodu(read("../components/PlaceInput.tsx"));

  /* Kaydedilen değer HÂLÂ kullanıcının yazdığı metin. */
  check(/birthPlace: form\.birthPlace\.trim\(\)/.test(form), "doğum yeri yazıldığı gibi kaydediliyor");
  check(!/searchPlaces|modernName|historicHint/.test(form),
    "form kaydederken adı ÇEVİRMİYOR (öneri yalnız girdi bileşeninde)");

  /* Öneriye tıklamak dışında hiçbir yerde değer değiştirilmiyor. */
  const tiklama = (girdi.match(/onChange\(/g) ?? []).length;
  check(tiklama === 2, `değer yalnız iki yerde değişiyor: yazarken ve öneriye tıklayınca (${tiklama})`);

  check(/<PlaceInput/.test(form), "girdi bileşeni forma bağlı");
  check((form.match(/<PlaceInput/g) ?? []).length === 2, "hem doğum hem defin yerinde");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
