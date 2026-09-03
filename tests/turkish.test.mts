import { fold, foldKey } from "../lib/turkish.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/* --- fold: aksan katlama ------------------------------------------------- */
eq(fold("İSTANBUL"), "istanbul", "büyük İ");
eq(fold("Iğdır"), "igdir", "I ve ı ve ğ");
eq(fold("Şükrü Çeşme"), "sukru cesme", "ş, ç, ü");
eq(fold("Öğütlü"), "ogutlu", "ö, ğ, ü");
eq(fold("  Yılmaz  "), "yilmaz", "kırpılır");
// Noktalama KORUNUR.
eq(fold("Kara-Mehmet"), "kara-mehmet", "fold noktalamayı korur");

/* --- foldKey: karşılaştırma anahtarı ------------------------------------ */
eq(foldKey("Kara-Mehmet"), "kara mehmet", "noktalama boşluğa iner");
eq(foldKey("O'Brien"), "o brien", "kesme işareti de");
eq(foldKey("  Ali   Yılmaz  "), "ali yilmaz", "çoklu boşluk teke iner");
eq(foldKey("Hacıların Ocağı"), "hacilarin ocagi", "aksan + boşluk");

/* --- Asıl mesele: "aynı mı" tanımı TEK olmalı ---------------------------- */
{
  /*
   * Bu kural depoda üç kez ayrı yazılmıştı ve dördüncü yer (arama) hiç
   * kullanmıyordu. Sonuç: kopya bulucu "Yilmaz" ile "Yılmaz"ı aynı kişi
   * sayarken, arama kutusu "Yilmaz" yazana "Yılmaz"ı göstermiyordu. Aynı
   * üründe iki farklı "aynı mı" tanımı.
   */
  eq(foldKey("Yilmaz"), foldKey("Yılmaz"), "aksanlı/aksansız aynı anahtar");
  eq(foldKey("Ismail"), foldKey("İsmail"), "I/İ aynı anahtar");
  eq(foldKey("Cesme"), foldKey("Çeşme"), "ç/ş aynı anahtar");
}

/* --- Sınır durumları ----------------------------------------------------- */
eq(fold(""), "", "boş metin");
eq(foldKey(""), "", "boş anahtar");
eq(foldKey("!!!"), "", "yalnız noktalama boş anahtar");
eq(foldKey("1950"), "1950", "rakamlar korunur");
check(foldKey("çığ").length > 0, "tümü aksanlı metin kaybolmaz");

/* --- Eşdeğerlik: foldKey, fold üstüne kurulu ---------------------------- */
for (const s of ["Ağrı Dağı", "İzmir'in", "Kara-Mehmetgil", "ÇOK ŞIK"]) {
  eq(foldKey(s), fold(s).replace(/[^a-z0-9]+/g, " ").trim(), `tutarlı: ${s}`);
}

/* --- Latin-1 aksanlı sesliler: â/î/û ------------------------------------- */
/*
 * Bunlar Türkçe/Osmanlıca adlarda yaygın (Kâmil, Nâzım, Âdem, Alî Rızâ) ve
 * eskiden katlanmıyordu; `foldKey`in "harf-rakam dışı her şey boşluk" adımı
 * onları BOŞLUĞA çeviriyordu: "Kâmil" → "k mil". Sonuç: "Kamil" arayan
 * "Kâmil"i bulamıyor, kopya bulucu ikisini hiç karşılaştırmıyordu — tam da bu
 * dosyanın önlemek için yazıldığı hata.
 */
for (const [a, b] of [["Kamil", "Kâmil"], ["Nazim", "Nâzım"], ["Adem", "Âdem"],
                      ["Ali Riza", "Alî Rızâ"], ["Resat", "Reşât"]] as const) {
  check(foldKey(a) === foldKey(b), `aksanlı sesli katlanıyor: "${a}" ≡ "${b}" (${foldKey(a)} / ${foldKey(b)})`);
  check(!foldKey(b).includes("  ") && !foldKey(b).startsWith(" "),
    `"${b}" boşluğa bölünmüyor (${JSON.stringify(foldKey(b))})`);
}
/*
 * Ters yön: aksan boşluğa dönerken FARKLI adlar aynı anahtara düşebiliyordu
 * ("Alî Rızâ" → "ali riz"), yani yanlış birleştirme önerisi doğabilirdi.
 */
check(foldKey("Ali Riz") !== foldKey("Alî Rızâ"), "farklı adlar hâlâ farklı");
check(foldKey("Mehmet") !== foldKey("Ahmet"), "alakasız adlar karışmıyor");
// Türkçe I/İ kuralı bozulmadı.
check(fold("İSTANBUL") === "istanbul", "İ hâlâ i'ye iniyor");
check(fold("ISPARTA") === "isparta", "I hâlâ i'ye iniyor");
check(foldKey("Işık") === foldKey("Isik"), "ı/i eşitliği korunuyor");

/*
 * GERİLEME KİLİDİ: ayrı duran noktalama YUTULMUYOR.
 *
 * NFD katlaması ilk yazıldığında `\p{Diacritic}` kullanılmıştı ve o sınıf
 * yalnız birleşen imleri değil, kendi başına duran aksan işaretlerini de
 * kapsıyor: `^` `` ` `` `´` `¨` `·` `¸`. Sonuç, kesme işareti yerine ters
 * tırnak yazılmış adların BİTİŞMESİYDİ — "O`Brien" → "obrien" — oysa
 * noktalamayı sadeleştirmek `foldKey`in işi ve orada tek boşluğa iner.
 */
check(foldKey("O`Brien") === "o brien", `ters tırnak boşluğa iniyor (${JSON.stringify(foldKey("O`Brien"))})`);
check(foldKey("O'Brien") === "o brien", "kesme işareti boşluğa iniyor");
check(foldKey("O´Brien") === "o brien", "akut aksan işareti de boşluğa iniyor");
check(foldKey("a^b") === "a b", "şapka yutulmuyor");
check(foldKey("a¨b") === "a b", "ayrı duran çift nokta yutulmuyor");
// Ama BİRLEŞEN im hâlâ düşüyor — asıl iş bozulmadı.
check(foldKey("Ka\u0302mil") === "kamil", "birleşen şapka hâlâ düşüyor (NFD girdi)");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
