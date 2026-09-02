/**
 * Türkçe metin katlaması — TEK KAYNAK.
 *
 * Aynı kural depoda üç kez ayrı ayrı yazılmıştı (`duplicates`, `surnames`,
 * `recipes`) ve bir dördüncü yer — ARAMA — onu hiç kullanmıyordu. Sonuç:
 * "Yilmaz" yazan kullanıcı "Yılmaz"ı bulamıyordu, ama aynı kullanıcı kopya
 * bulucuda ikisinin aynı kişi olduğunu görüyordu. Aynı ürünün iki farklı
 * "aynı mı" tanımı vardı.
 *
 * Neden `toLocaleLowerCase("tr")` yetmiyor: küçük harfe çevirmek "I"yı "ı"
 * yapar ama "ı" ile "i"yi EŞİTLEMEZ. Türkçe klavyesi olmayan (ya da hızlı
 * yazan) biri aksansız yazar; arama onu bulmalı.
 *
 * Bağımlılıksız — birim testi koşulabilsin.
 */

/** Aksan katlaması + Türkçe küçük harf. Noktalama KORUNUR. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

/**
 * Karşılaştırma/gruplama anahtarı: `fold` + harf-rakam dışı her şey tek
 * boşluğa iner.
 *
 * "Kara-Mehmet" ile "Kara Mehmet"i aynı saymak için. Aramada da bu kullanılır
 * ve İKİ TARAFA birden uygulandığı için simetriktir: kullanıcının yazdığı
 * noktalama da aynı şekilde sadeleşir, dolayısıyla eşleşme kaybolmaz.
 */
export function foldKey(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, " ").trim();
}
