import {
  gregorianToJdn, jdnToGregorian,
  hijriToJdn, jdnToHijri,
  isHijriLeapYear, hijriMonthLength, hijriYearLength,
  toHijri, fromHijri, formatHijri, hijriMonthName,
  hijriAnniversariesInGregorianYear, hijriYearsBetween,
  HIJRI_MONTHS_TR, HIJRI_MONTHS_EN,
} from "../lib/hijri.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++;
  else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}

/* --- Çıpalar ------------------------------------------------------------ */

// 1 Muharrem 1 AH = 16 Temmuz 622 (Jülyen) = JGS 1948440
eq(hijriToJdn(1, 1, 1), 1948440, "hicri devir başlangıcı");

// Doğrulama çıpası: 1 Muharrem 1445 = 19 Temmuz 2023 (tablosal ve ilan aynı)
eq(fromHijri({ year: 1445, month: 1, day: 1 }), "2023-07-19", "1 Muharrem 1445");
eq(toHijri("2023-07-19"), { year: 1445, month: 1, day: 1 }, "19 Temmuz 2023 → hicri");

// Miladi JGS bilinen değer: 19 Temmuz 2023 = 2460145
eq(gregorianToJdn(2023, 7, 19), 2460145, "miladi JGS");

/* --- Gidiş-dönüş -------------------------------------------------------- */

let rtG = 0;
for (let jdn = 2400000; jdn < 2400000 + 4000; jdn += 7) {
  const g = jdnToGregorian(jdn);
  if (gregorianToJdn(g.year, g.month, g.day) === jdn) rtG++;
}
check(rtG === Math.ceil(4000 / 7), `miladi JGS gidiş-dönüş (${rtG} tur)`);

let rtH = 0, total = 0;
for (let hy = 1300; hy <= 1500; hy += 3) {
  for (let hm = 1; hm <= 12; hm++) {
    for (const hd of [1, 15, hijriMonthLength(hy, hm)]) {
      total++;
      const back = jdnToHijri(hijriToJdn(hy, hm, hd));
      if (back.year === hy && back.month === hm && back.day === hd) rtH++;
      else console.log(`  ✗ tur: ${hy}-${hm}-${hd} → ${JSON.stringify(back)}`);
    }
  }
}
check(rtH === total, `hicri gidiş-dönüş (${rtH}/${total})`);

// Miladi → hicri → miladi
let rtX = 0, xTotal = 0;
for (let jdn = 2450000; jdn < 2450000 + 3000; jdn += 11) {
  xTotal++;
  const h = jdnToHijri(jdn);
  if (hijriToJdn(h.year, h.month, h.day) === jdn) rtX++;
}
check(rtX === xTotal, `miladi↔hicri çapraz tur (${rtX}/${xTotal})`);

/* --- Takvim yapısı ------------------------------------------------------ */

// 30 yıllık çevrimde tam 11 artık yıl
let leaps = 0;
for (let y = 1; y <= 30; y++) if (isHijriLeapYear(y)) leaps++;
eq(leaps, 11, "30 yıllık çevrimde artık yıl sayısı");

// Ay uzunlukları: tek aylar 30, çift aylar 29 (Zilhicce artık yılda 30)
eq(hijriMonthLength(1445, 1), 30, "Muharrem 30 gün");
eq(hijriMonthLength(1445, 2), 29, "Safer 29 gün");
eq(hijriMonthLength(1445, 11), 30, "Zilkade 30 gün");
check(
  hijriMonthLength(1445, 12) === (isHijriLeapYear(1445) ? 30 : 29),
  "Zilhicce artık yıla bağlı"
);

// Ayların toplamı = yıl uzunluğu, ve yıl uzunluğu JGS farkıyla tutarlı
let structOk = 0;
for (let y = 1440; y <= 1470; y++) {
  let sum = 0;
  for (let m = 1; m <= 12; m++) sum += hijriMonthLength(y, m);
  const byJdn = hijriToJdn(y + 1, 1, 1) - hijriToJdn(y, 1, 1);
  if (sum === hijriYearLength(y) && byJdn === sum) structOk++;
  else console.log(`  ✗ ${y}: ay toplamı ${sum}, yıl ${hijriYearLength(y)}, JGS farkı ${byJdn}`);
}
eq(structOk, 31, "yıl/ay uzunluğu tutarlılığı");

/* --- Depolama biçimi ---------------------------------------------------- */

eq(toHijri("2023"), null, "kısmi tarih (yıl) → null");
eq(toHijri("2023-07"), null, "kısmi tarih (yıl-ay) → null");
eq(toHijri(undefined), null, "tanımsız → null");
eq(toHijri("abc"), null, "geçersiz metin → null");
eq(toHijri("2023-13-01"), null, "geçersiz ay → null");

/* --- Biçimlendirme ve i18n --------------------------------------------- */

eq(HIJRI_MONTHS_TR.length, 12, "TR ay adı sayısı");
eq(HIJRI_MONTHS_EN.length, 12, "EN ay adı sayısı");
eq(hijriMonthName(9, "tr"), "Ramazan", "9. ay TR");
eq(hijriMonthName(9, "en"), "Ramadan", "9. ay EN");
eq(hijriMonthName(13, "tr"), "", "geçersiz ay → boş");
eq(formatHijri({ year: 1445, month: 7, day: 12 }, "tr"), "12 Recep 1445", "TR biçim");
eq(formatHijri({ year: 1445, month: 7, day: 12 }, "en"), "12 Rajab 1445 AH", "EN biçim");

/* --- Yıl dönümü --------------------------------------------------------- */

// Dönen her tarih, kaynakla AYNI hicri ay/güne denk gelmeli
const src = "1990-03-15";
const srcH = toHijri(src)!;
let annOk = 0, annTotal = 0;
const twiceYears: number[] = [];
for (let gy = 2000; gy <= 2100; gy++) {
  const list = hijriAnniversariesInGregorianYear(src, gy);
  if (list.length === 2) twiceYears.push(gy);
  for (const iso of list) {
    annTotal++;
    const h = toHijri(iso)!;
    const expDay = Math.min(srcH.day, hijriMonthLength(h.year, srcH.month));
    if (h.month === srcH.month && h.day === expDay) annOk++;
    else console.log(`  ✗ ${gy}: ${iso} → ${JSON.stringify(h)}, bekl ay ${srcH.month} gün ${expDay}`);
  }
}
check(annTotal > 0 && annOk === annTotal, `yıl dönümü ay/gün tutarlı (${annOk}/${annTotal})`);

// Hicri yıl ~354 gün olduğundan bir Miladi yıla İKİ kez düşebilmeli
check(twiceYears.length > 0, `bir miladi yılda iki kez düşen yıl dönümü (${twiceYears.length} örnek)`);

// 101 miladi yılda ~104 hicri yıl dönümü olmalı (354/365 oranı)
check(annTotal >= 102 && annTotal <= 106, `101 yılda ${annTotal} yıl dönümü (~104 beklenir)`);

eq(hijriAnniversariesInGregorianYear("1990", 2024), [], "kısmi tarihte yıl dönümü yok");

// Gün 30 → 29 çeken ayda kırpılır
const d30 = fromHijri({ year: 1440, month: 1, day: 30 });
let clamped = 0;
for (let gy = 2019; gy <= 2060; gy++) {
  for (const iso of hijriAnniversariesInGregorianYear(d30, gy)) {
    const h = toHijri(iso)!;
    if (h.day === Math.min(30, hijriMonthLength(h.year, 1))) clamped++;
    else { fail++; console.log(`✗ kırpma: ${iso} → gün ${h.day}`); }
  }
}
check(clamped > 0, `30. gün kırpması (${clamped} kontrol)`);

/* --- Geçen hicri yıl ---------------------------------------------------- */

eq(hijriYearsBetween("2023-07-19", "2024-07-19"), 1, "1 miladi yıl ≈ 1 hicri yıl");
check((hijriYearsBetween("1990-01-01", "2023-01-01") ?? 0) > 33, "33 miladi yıl > 33 hicri yıl");
eq(hijriYearsBetween("2023", "2024-01-01"), null, "kısmi tarihte null");
eq(hijriYearsBetween("2024-07-19", "2024-07-18"), -1, "geriye doğru negatif");

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
