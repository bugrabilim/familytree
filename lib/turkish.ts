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
    /*
     * Latin-1 aksanlı sesliler (â, î, û…) burada düşer.
     *
     * Bunlar Türkçe/Osmanlıca adlarda yaygın — Kâmil, Nâzım, Âdem, Alî Rızâ —
     * ve tam da bu dosyanın var olma nedeni onlardı. Ama aşağıdaki liste
     * yalnız altı Türkçe harfi kapsıyordu; â/î/û katlanmadan geçiyor, sonra
     * `foldKey`in "harf-rakam dışı her şey boşluk olsun" adımında BOŞLUĞA
     * dönüyordu: "Kâmil" → "k mil". Yani "Kamil" arayan "Kâmil"i bulamıyor,
     * kopya bulucu ikisini hiç karşılaştırmıyor, üstelik "Alî Rızâ" ile
     * "Ali Riz" aynı anahtara düşüyordu.
     *
     * NFD ile ayrıştırıp birleşen imleri atmak doğru sırayla çalışır:
     * küçük harfe çevirme ZATEN yapıldı (Türkçe "I"/"İ" kuralı korunsun
     * diye), ı'nın aksanı yok (temel harf) ve altındaki açık kurallarla
     * i'ye iniyor; ş/ğ/ü/ö/ç'yi ise NFD çözüyor, kurallar da yedekliyor.
     */
    .normalize("NFD")
    /*
     * BİRLEŞEN im (`\p{Mn}`), "aksanlı görünen her şey" (`\p{Diacritic}`)
     * DEĞİL. İkincisi ayrı duran noktalama işaretlerini de kapsıyor: `^`,
     * `` ` ``, `´`, `¨`, `·`, `¸`. Onları burada silmek kesme işaretine
     * benzeyen karakterleri yutuyordu — "O`Brien" → "obrien" — oysa
     * noktalamanın sadeleşmesi `foldKey`in işi ve orada tek BOŞLUĞA iniyor.
     * NFD'den sonra düşmesi gereken şey yalnız birleşen imlerdir.
     */
    .replace(/\p{Mn}/gu, "")
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
