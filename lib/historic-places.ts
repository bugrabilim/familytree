/**
 * TARİHÎ ↔ MODERN YER ADLARI (madde 37).
 *
 * Bir soy ağacında doğum yeri, kaydın yazıldığı GÜNÜN adıyla duruyor:
 * dedenin nüfus kâğıdında "Elaziz" yazar, torunun bildiği ad "Elazığ"dır.
 * Aynı yer, iki ad. Harita bugünkü adı tanıyor, kayıtta duran ise eski ad —
 * ve bu yüzden ailenin geldiği köy haritada hiç görünmüyor.
 *
 * Bu dosya o boşluğu kapatıyor: eski adı bugünküne çeviriyor.
 *
 * ## Mevcut pinler KAYMAYACAK
 *
 * Bu maddenin tek gerçek riski buydu: `resolvePlace` ortak çözüm yolu ve
 * oraya yapılan her ekleme, bugün doğru yere oturan pinleri kaydırabilir.
 * Bu yüzden tarihî katman ASLA önce çalışmıyor — `lib/places.ts` modern
 * yolu tükettikten ve `null` döndükten SONRA devreye giriyor. Bugün bir
 * yere oturan hiçbir metin bu katmana hiç uğramıyor.
 *
 * ## Az ama doğru
 *
 * Yanlış bir eşleme sessizdir ve zararı somuttur: ailenin köyünü haritada
 * BAŞKA bir yere koyar, üstelik kimse fark etmez. Bu yüzden liste bilerek
 * eksik: yalnız yaygın olarak bilinen ve tek bir modern karşılığı olan
 * adlar var. Kuşkulu olan girilmedi.
 *
 * Sözlük `scripts/fetch-historic-names.mjs` ile Wikidata'dan (CC0)
 * genişletilebilir; buradaki çekirdek, betik hiç koşmasa bile çalışsın diye.
 *
 * ## Bilerek DIŞARIDA bırakılanlar
 *
 * · **Yaşayan yer adları** (Biga, Şebinkarahisar): tarihî ad değiller, bugün
 *   de kullanılan ilçe adları. Sözlüğe girselerdi pin, ilçeyi bırakıp il
 *   merkezine kayardı — düzeltme değil, bozma olurdu.
 * · **Birden çok yeri gösterenler** ("Karahisar" — Karahisar-ı Sahib mi,
 *   Şebinkarahisar mı, Karahisar-ı Develi mi?): tek karşılığı olmayan ad
 *   eşlenemez.
 * · **Merkezi tartışmalı idarî birimler** (Cezayir-i Bahr-i Sefid): merkezi
 *   dönemine göre değişmiş; tek bir modern ada bağlanamaz.
 * · **Modern karşılığı `GAZETTEER`de olmayanlar** (İznik, Nusaybin): eşleme
 *   yazılsa bile koordinat üretmez. Bunlar sözlüğe koordinat eklenince
 *   girer — ve o ekleme AYRI bir karar, çünkü sözlüğe yeni bir ad eklemek
 *   mevcut pinleri kaydırabilir (bkz. yukarıdaki not).
 *
 * ## Neden koordinat DEĞİL, ad eşliyoruz
 *
 * Tarihî ada doğrudan koordinat verseydik, aynı yerin koordinatı iki yerde
 * dururdu ve biri düzeltildiğinde öbürü sessizce eskirdi. Ad eşleyince tek
 * doğruluk kaynağı `GAZETTEER` olarak kalıyor: eşlemenin modern karşılığı
 * sözlükte yoksa sonuç yalnızca "bulunamadı" olur — yanlış bir yer değil.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

/**
 * ESKİ AD → MODERN AD.
 *
 * Değerler `lib/places.ts`teki `GAZETTEER` anahtarlarıyla aynı yazımda
 * olmalı; `tests/historic-places.test.mts` bunu denetliyor. Denetlenmeseydi
 * bir yazım hatası eşlemeyi sessizce ölü bırakırdı.
 */
export const HISTORIC_TO_MODERN: Readonly<Record<string, string>> = {
  /* — Yunanca / Latince / Batı dillerindeki adlar — */
  Konstantiniyye: "İstanbul",
  Kostantiniyye: "İstanbul",
  Constantinople: "İstanbul",
  Konstantinopolis: "İstanbul",
  Byzantion: "İstanbul",
  Dersaadet: "İstanbul",
  Asitane: "İstanbul",
  İslambol: "İstanbul",
  Stambul: "İstanbul",
  Smyrna: "İzmir",
  Angora: "Ankara",
  Ancyra: "Ankara",
  Ankyra: "Ankara",
  Adrianople: "Edirne",
  Hadrianopolis: "Edirne",
  Trebizond: "Trabzon",
  Trapezus: "Trabzon",
  Prusa: "Bursa",
  Iconium: "Konya",
  Ikonyon: "Konya",
  Caesarea: "Kayseri",
  Kaisareia: "Kayseri",
  Mazaka: "Kayseri",
  Sebasteia: "Sivas",
  Melitene: "Malatya",
  Amaseia: "Amasya",
  Amisos: "Samsun",
  Sinope: "Sinop",
  Kerasus: "Giresun",
  Kotyora: "Ordu",
  Theodosiopolis: "Erzurum",
  Karin: "Erzurum",
  Amida: "Diyarbakır",
  Amid: "Diyarbakır",
  Dorylaeum: "Eskişehir",
  Kotiaeion: "Kütahya",
  Attaleia: "Antalya",
  Tralleis: "Aydın",
  Halikarnassos: "Bodrum",
  Halicarnassus: "Bodrum",
  Antiokheia: "Antakya",
  Antioch: "Antakya",
  Edessa: "Şanlıurfa",
  Alexandretta: "İskenderun",
  Aleksandretta: "İskenderun",

  /* — Osmanlı dönemi ve erken Cumhuriyet adları (Türkiye) — */
  Diyarbekir: "Diyarbakır",
  Mamuretülaziz: "Elazığ",
  Mamüretülaziz: "Elazığ",
  Elaziz: "Elazığ",
  "Hısn-ı Mansur": "Adıyaman",
  "Hısnımansur": "Adıyaman",
  Çapakçur: "Bingöl",
  Çölemerik: "Hakkari",
  Karaköse: "Ağrı",
  Karakilise: "Ağrı",
  Kırkkilise: "Kırklareli",
  Karesi: "Balıkesir",
  Bozok: "Yozgat",
  Muşkara: "Nevşehir",
  Hamitabad: "Isparta",
  Hamidabad: "Isparta",
  "Karahisar-ı Sahib": "Afyonkarahisar",
  Afyon: "Afyonkarahisar",
  İluh: "Batman",
  Cebelibereket: "Osmaniye",
  Teke: "Antalya",
  "Kastamonu Vilayeti": "Kastamonu",
  Hüdavendigâr: "Bursa",
  Hüdavendigar: "Bursa",
  Karahisarışarki: "Giresun",
  Canik: "Samsun",
  Lazistan: "Rize",
  Çoruh: "Artvin",
  Menteşe: "Muğla",
  Saruhan: "Manisa",
  Ertuğrul: "Bilecik",

  /* — Balkanlar ve eski Osmanlı şehirleri (sözlükte olanlar) — */
  Philippopolis: "Filibe",
  Plovdiv: "Filibe",
  Thessaloniki: "Selanik",
  Bitola: "Manastır",
  Monastir: "Manastır",
};

/* ── Normalleştirme ───────────────────────────────────────────────────────── */

/**
 * `lib/places.ts`teki `normalize` ile AYNI kurallar.
 *
 * Kopyalanmasının sebebi bağımlılık yönü: `places` bu dosyayı çağırıyor,
 * tersi olsaydı döngü olurdu. Kuralların ayrışmaması için ikisi de
 * `tests/historic-places.test.mts` tarafından karşılaştırılıyor.
 */
export function normalizeHistoric(s: string): string {
  return s
    .trim()
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLocaleLowerCase("tr");
}

const INDEX: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [eski, yeni] of Object.entries(HISTORIC_TO_MODERN)) {
    out[normalizeHistoric(eski)] = yeni;
  }
  return out;
})();

/** Eski adın modern karşılığı. Bilinmiyorsa `null`. */
export function modernName(name: string): string | null {
  if (!name) return null;
  return INDEX[normalizeHistoric(name)] ?? null;
}

/** Modern adın bilinen eski adları (arama ve gösterim için). */
export function historicNamesOf(modern: string): string[] {
  const hedef = normalizeHistoric(modern);
  return Object.entries(HISTORIC_TO_MODERN)
    .filter(([, m]) => normalizeHistoric(m) === hedef)
    .map(([eski]) => eski);
}
