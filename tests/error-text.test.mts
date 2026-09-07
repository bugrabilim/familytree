import { isRawError, userMessage } from "../lib/error-text.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * HAM HATA METNİ KULLANICIYA GÖSTERİLMİYOR (denetim G2).
 *
 * İki yönlü bir kural ve İKİ YÖNÜ DE kilitlenmeli. Yalnız "ham metni gizle"
 * denetlenseydi, her şeyi genel bir cümleyle değiştiren bir uygulama testi
 * geçer ve eyleme dönük mesajları ("Bu ağaç siz bakarken değişti") yok
 * ederdi — kullanıcı için daha kötü bir sonuç.
 */

/* ── Ham hatalar SÜZÜLÜYOR ────────────────────────────────────────────────── */
const hamlar = [
  `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
  "Unexpected end of JSON input",
  "SyntaxError: Unexpected token o in JSON at position 1",
  "Failed to fetch",
  "NetworkError when attempting to fetch resource.",
  "Load failed",
  "TypeError: fetch failed",
  "AbortError: The operation was aborted.",
];
for (const h of hamlar) {
  check(isRawError(h), `ham tanınıyor: ${h.slice(0, 34)}`);
  check(userMessage(new Error(h), "Kaydedilemedi.") === "Kaydedilemedi.",
    `ham metin kullanıcıya GİTMİYOR: ${h.slice(0, 34)}`);
}

/* ── Bizim yazdığımız mesajlar OLDUĞU GİBİ geçiyor ───────────────────────── */
/*
 * Bu iddialar birinci yönün fazla geniş uygulanmasını yakalıyor. Hepsi
 * gerçek ürün metni ve hepsi kullanıcıya bir ŞEY YAPMASINI söylüyor;
 * genel bir cümleyle değiştirilmeleri, hatayı okunur kılmak adına
 * kullanılamaz kılmak olurdu.
 */
const bizimkiler = [
  "Bu ağaç siz bakarken değişti. Sayfayı yenileyip tekrar deneyin.",
  "Bu işlem için düzenleme yetkiniz yok.",
  "Öneri bulunamadı.",
  "Etiket zorunludur.",
  "Bu ağaçla eşleşmeniz yok.",
  "Değişiklik uygulandı ama öneri damgası yazılamadı.",
  "The tree changed while you were looking at it.",
];
for (const b of bizimkiler) {
  check(!isRawError(b), `ürün metni ham sayılmıyor: ${b.slice(0, 34)}`);
  check(userMessage(new Error(b), "Kaydedilemedi.") === b, `ürün metni korunuyor: ${b.slice(0, 34)}`);
}

/* ── Sınır durumları ──────────────────────────────────────────────────────── */
check(userMessage(new Error(""), "Yedek") === "Yedek", "boş mesaj yerine yedek");
check(userMessage(new Error("   "), "Yedek") === "Yedek", "yalnız boşluk da boş sayılıyor");
check(userMessage(undefined, "Yedek") === "Yedek", "hata nesnesi olmayan girdi");
check(userMessage(null, "Yedek") === "Yedek", "null girdi");
check(userMessage({ error: "x" }, "Yedek") === "Yedek", "nesne girdi");
check(userMessage("Ağ yok", "Yedek") === "Ağ yok", "düz dize mesaj korunuyor");
check(userMessage("Failed to fetch", "Yedek") === "Yedek", "düz dize ham hata da süzülüyor");
/*
 * Büyük/küçük harf duyarsız ve YERELDEN BAĞIMSIZ. `toLowerCase()` Türkçe
 * yerelde "I"yı "ı" yapıyor ve "JSON" → "jsoı" olurdu: eşleşme kaçar,
 * ham metin kullanıcıya giderdi. Aynı tuzak bu depoda `normalizeUsername`
 * ve `normalizeContact`ta da var.
 */
check(isRawError("UNEXPECTED TOKEN <"), "büyük harfli ham hata da tanınıyor");
check(isRawError("Is Not Valid JSON"), "karışık harfli ham hata da tanınıyor");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
