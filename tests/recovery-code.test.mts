import {
  KURTARMA_ALFABE,
  KURTARMA_UZUNLUK,
  formatRecoveryCode,
  generateRecoveryCode,
  isRecoveryCodeShaped,
  normalizeRecoveryCode,
  pickUniqueRecoveryCode,
  planRecoveryLookup,
  recoveryCodeCandidates,
  recoveryCodeIndex,
  timingSafeEqualHex,
} from "../lib/recovery-code.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

const KOD = "ABCD-EFGH-JKLM-NPQR";
const DUZ = "ABCDEFGHJKLMNPQR";

/* ── Normalleştirme ─────────────────────────────────────────────────────── */

check(normalizeRecoveryCode(KOD) === DUZ, "tireler atılıyor");
check(normalizeRecoveryCode(`  ${KOD}  `) === DUZ, "baştaki/sondaki boşluk atılıyor");
check(normalizeRecoveryCode("abcd efgh jklm npqr") === DUZ, "boşluklu küçük harf de aynı koda iniyor");
check(normalizeRecoveryCode("abcd_efgh.jklm-npqr") === DUZ, "alt çizgi ve nokta da ayraç sayılıyor");
check(normalizeRecoveryCode("ABCD\tEFGH\nJKLM NPQR") === DUZ, "sekme/satır sonu ayraç sayılıyor");
check(normalizeRecoveryCode("") === "", "boş dize boş kalıyor");
for (const kotu of [null, undefined, 42, {}, []]) {
  check(normalizeRecoveryCode(kotu) === "", `dize olmayan girdi boşa iniyor: ${JSON.stringify(kotu)}`);
}
/*
 * Tanınmayan karakter SESSİZCE ATILMAMALI. Atılsaydı "ABCD-EFGH-JKLM-NPQ!R"
 * ile geçerli kod aynı indekse düşerdi; yanlış yazılmış bir kod, farkında
 * olmadan başka bir hesabın koduna eşlenebilirdi.
 */
check(normalizeRecoveryCode("ABCD-EFGH-JKLM-NPQ!R") === "ABCDEFGHJKLMNPQ!R", "yabancı karakter atılmıyor");
check(!isRecoveryCodeShaped(normalizeRecoveryCode("ABCD-EFGH-JKLM-NPQ!R")), "yabancı karakterli kod biçimsiz");

/* ── TÜRKÇE "I" TUZAĞI ──────────────────────────────────────────────────── */
{
  /*
   * `toUpperCase()` Türkçe yerelde "i"yi "İ" yapar. Sunucunun yereline bağlı
   * bir normalleştirme, aynı kodun iki farklı indeks üretmesi demekti.
   */
  const n = normalizeRecoveryCode("ijk-lmno");
  check(n === "IJKLMNO", `küçük i büyük I oluyor (İ değil): ${n}`);
  check(!n.includes("İ"), "noktalı İ üretilmiyor");
  check(normalizeRecoveryCode("I") === "I", "büyük I olduğu gibi kalıyor (ı olmuyor)");
  check(!normalizeRecoveryCode("I").includes("ı"), "noktasız ı üretilmiyor");
  // Alfabede I/O/0/1 yok — elle okunurken karıştıkları için.
  for (const ch of ["I", "O", "0", "1"]) check(!KURTARMA_ALFABE.includes(ch), `alfabede ${ch} yok`);
}

/* ── Biçim denetimi ─────────────────────────────────────────────────────── */

check(isRecoveryCodeShaped(DUZ), "16 karakterli alfabe kodu biçimli");
check(!isRecoveryCodeShaped(DUZ.slice(0, 15)), "kısa kod biçimsiz");
check(!isRecoveryCodeShaped(DUZ + "A"), "uzun kod biçimsiz");
check(!isRecoveryCodeShaped(""), "boş kod biçimsiz");
check(!isRecoveryCodeShaped("ABCDEFGHJKLMNPQI"), "alfabe dışı harf (I) biçimsiz");
check(KURTARMA_ALFABE.length === 32 && KURTARMA_UZUNLUK === 16, "32^16 ≈ 80 bit");

/* ── Gösterim ───────────────────────────────────────────────────────────── */

check(formatRecoveryCode(DUZ) === KOD, "dörtlü gruplara ayrılıyor");
check(normalizeRecoveryCode(formatRecoveryCode(DUZ)) === DUZ, "biçimle-normalleştir turu kayıpsız");

/* ── İndeks ─────────────────────────────────────────────────────────────── */

{
  const i1 = recoveryCodeIndex(KOD);
  const i2 = recoveryCodeIndex("abcd efgh jklm npqr");
  const i3 = recoveryCodeIndex(DUZ);
  check(typeof i1 === "string" && i1!.length === 64, "indeks 64 karakterlik onaltılık");
  check(i1 === i2 && i1 === i3, "aynı kodun her yazımı AYNI indeksi veriyor");
  check(recoveryCodeIndex("ABCD-EFGH-JKLM-NPQS") !== i1, "farklı kod farklı indeks");
  check(recoveryCodeIndex(i1!) === null, "indeksin kendisi kod değil (biçimsiz)");
  for (const kotu of ["", "   ", "ABC", null, undefined, 5, DUZ + "A", "ABCDEFGHJKLMNPQI"]) {
    check(recoveryCodeIndex(kotu) === null, `biçimsiz girdi indekssiz: ${JSON.stringify(kotu)}`);
  }
  // Determinizm: aynı süreçte iki çağrı aynı sonucu vermeli (tuz YOK).
  check(recoveryCodeIndex(KOD) === recoveryCodeIndex(KOD), "indeks deterministik (tuzsuz)");
  // Ham kod indeksin içinde görünmemeli.
  check(!i1!.includes(DUZ.toLowerCase()) && !i1!.includes(DUZ), "indeks kodu düz metin taşımıyor");
}

/* ── bcrypt adayları ────────────────────────────────────────────────────── */

{
  const a = recoveryCodeCandidates("abcd efgh jklm npqr");
  check(a[0] === KOD, "ilk aday AYRAÇLI hâl (eski kayıtlar böyle hash'lenmişti)");
  check(a.includes(DUZ), "ayraçsız hâl de aday");
  check(a.includes("abcd efgh jklm npqr"), "kullanıcının yazdığı ham hâl de aday");
  check(new Set(a).size === a.length, "yinelenen aday yok (her aday bir bcrypt turu)");
  check(recoveryCodeCandidates(KOD).length === 2, "zaten ayraçlı kodda iki aday yetiyor");
  check(recoveryCodeCandidates("").length === 0, "boş girdi için aday yok");
  check(recoveryCodeCandidates(null).length === 0, "dize olmayan girdi için aday yok");
}

/* ── Sabit süreli karşılaştırma ─────────────────────────────────────────── */

check(timingSafeEqualHex("abc123", "abc123"), "aynı dizeler eşit");
check(!timingSafeEqualHex("abc123", "abc124"), "farklı dizeler eşit değil");
check(!timingSafeEqualHex("abc", "abcd"), "farklı uzunluk eşit değil (fırlatmıyor)");
check(!timingSafeEqualHex("", ""), "boş dize eşleşme SAYILMIYOR (indekssiz hesap eşleşmemeli)");
check(!timingSafeEqualHex(undefined as unknown as string, "abc"), "dize olmayan girdi eşleşmiyor");

/* ── Üretim ─────────────────────────────────────────────────────────────── */

{
  const kod = generateRecoveryCode();
  check(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(kod), `üretilen kod ayraçlı biçimde: ${kod}`);
  check(isRecoveryCodeShaped(normalizeRecoveryCode(kod)), "üretilen kod biçim denetiminden geçiyor");
  const kumeler = new Set(Array.from({ length: 200 }, () => generateRecoveryCode()));
  check(kumeler.size === 200, "200 üretimde yineleme yok");
  // Deterministik üreteçle: hep 0 seçilirse alfabenin ilk harfi çıkar.
  check(generateRecoveryCode(() => 0) === "AAAA-AAAA-AAAA-AAAA", "üreteç dışarıdan verilebiliyor");
  // Üreteç ALFABE SINIRI içinde sorulmalı (modülo yanlılığı olmasın).
  let enBuyukIstek = 0;
  generateRecoveryCode((max) => { enBuyukIstek = Math.max(enBuyukIstek, max); return 0; });
  check(enBuyukIstek === KURTARMA_ALFABE.length, "rastgelelik alfabe uzunluğunda isteniyor");
}

/* ── Benzersizlik ───────────────────────────────────────────────────────── */

{
  // Çakışmasız: ilk üretilen kod dönüyor.
  const bos = new Set<string>();
  const ilk = pickUniqueRecoveryCode(bos, { sec: () => 0 });
  check(ilk.code === "AAAA-AAAA-AAAA-AAAA", "boş kümede ilk kod dönüyor");
  check(ilk.index === recoveryCodeIndex(ilk.code), "dönen indeks kodun indeksi");

  /*
   * ÇAKIŞMA: ilk üretim kullanılıyorsa yeniden üretilmeli. Üreteç ilk turda
   * "A", sonraki turlarda "B" seçiyor.
   */
  let tur = 0;
  const kullanilan = new Set([recoveryCodeIndex("AAAA-AAAA-AAAA-AAAA")!]);
  const ikinci = pickUniqueRecoveryCode(kullanilan, {
    sec: () => (tur++ < KURTARMA_UZUNLUK ? 0 : 1),
  });
  check(ikinci.code === "BBBB-BBBB-BBBB-BBBB", `çakışan kod yeniden üretiliyor: ${ikinci.code}`);
  check(!kullanilan.has(ikinci.index), "dönen indeks kullanılanlarda değil");

  /*
   * DENEMELER BİTERSE HATA. Sessizce çakışan kodu döndürmek, iki hesaba aynı
   * kurtarma kodunu vermek — yani birinin öbürünün hesabını ele geçirmesi —
   * demekti.
   */
  let firladi = false;
  try {
    pickUniqueRecoveryCode(new Set([recoveryCodeIndex("AAAA-AAAA-AAAA-AAAA")!]), {
      sec: () => 0,
      denemeler: 3,
    });
  } catch {
    firladi = true;
  }
  check(firladi, "denemeler bitince hata fırlatılıyor (sessizce çakışan kod dönmüyor)");
}

/* ── Arama planı ────────────────────────────────────────────────────────── */

{
  const p = planRecoveryLookup("", KOD);
  check(p.kind === "ara", "ağaç adı OLMADAN da arama planlanıyor");
  if (p.kind === "ara") {
    check(p.index === recoveryCodeIndex(KOD), "plan indeksi kodun indeksi");
    check(p.familyName === null, "boş ad null'a iniyor");
    check(p.codes[0] === KOD, "plan bcrypt adaylarını taşıyor");
  }

  const q = planRecoveryLookup("  Yılmaz  ", "abcd efgh jklm npqr");
  check(q.kind === "ara" && q.familyName === "Yılmaz", "ad kırpılarak korunuyor (eski hesap yolu)");

  const r = planRecoveryLookup(undefined, undefined);
  check(r.kind === "reddet" && r.reason === "kod-yok", "kodsuz istek reddediliyor");
  check(planRecoveryLookup("Yılmaz", "   ").kind === "reddet", "boşluktan ibaret kod reddediliyor");

  const s = planRecoveryLookup("Yılmaz", "ABC");
  check(s.kind === "reddet" && s.reason === "kod-bicimsiz", "biçimsiz kod reddediliyor");
  /*
   * ÖNEMLİ: ad DOĞRU olsa bile biçimsiz kod reddediliyor. Aksi hâlde ad,
   * kodun yerini tutan bir arama anahtarına dönerdi.
   */
  check(planRecoveryLookup("Yılmaz", "").kind === "reddet", "ad tek başına arama başlatmıyor");
  check(planRecoveryLookup(42, KOD).kind === "ara", "dize olmayan ad görmezden geliniyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
