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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
