import {
  ascendant,
  ascendantDeg,
  candidateOffsets,
  degreeInSign,
  gmstDeg,
  J2000,
  julianDay,
  OBLIQUITY_J2000,
  parseFullDate,
  parseTime,
  signOfDegree,
} from "../lib/ascendant.ts";
import { maskPerson } from "../lib/privacy.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const yakin = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/* ═══ ÇIPA 1 — Yayımlanmış GMST (J2000.0) ═════════════════════════════════
 *
 * 1 Ocak 2000, 12:00 UT'de Greenwich ortalama yıldız zamanı 18s 41d 50,5sn.
 * Bu bir referans değeri; hesabı ona oturtmak, formülü kendi beklentimle
 * değil dışarıdan bilinen bir olguyla sınamak demek.
 */
{
  const jd = julianDay(2000, 1, 1, 12);
  check(yakin(jd, J2000, 1e-6), `J2000 Julian günü doğru (${jd})`);

  const g = gmstDeg(jd);
  const saat = g / 15;
  const s = Math.floor(saat);
  const d = Math.floor((saat - s) * 60);
  const sn = ((saat - s) * 60 - d) * 60;
  check(s === 18 && d === 41, `GMST(J2000) = 18s 41d (geldi ${s}s ${d}d)`);
  check(yakin(sn, 50.5, 0.6), `GMST(J2000) saniyesi ≈ 50,5 (geldi ${sn.toFixed(2)})`);
}

/* ═══ ÇIPA 2 — Yayımlanmış yıldız günü ════════════════════════════════════
 *
 * Yıldız günü güneş gününden 3 dakika 56,6 saniye kısadır. Formülün bir
 * güneş gününde 360°'den ne kadar fazla ilerlediği bunu vermeli.
 */
{
  const g0 = gmstDeg(J2000);
  const g1 = gmstDeg(J2000 + 1);
  const fazlaDerece = ((g1 - g0) % 360 + 360) % 360;
  const fazlaSaniye = (fazlaDerece / 360) * 24 * 3600;
  check(yakin(fazlaSaniye, 236.56, 0.5), `yıldız günü farkı ≈ 3d 56,6sn (geldi ${fazlaSaniye.toFixed(2)}sn)`);

  // Bir yıldız gününde GMST tam 360° ilerler (yani başa döner). 359,999…°
  // ile 0° aynı nokta olduğu için karşılaştırma SARMA-DUYARLI olmalı.
  const yildizGunu = 86164.0905 / 86400;
  const sapma = ((gmstDeg(J2000 + yildizGunu) - g0) % 360 + 360) % 360;
  check(Math.min(sapma, 360 - sapma) < 0.001,
    `bir yıldız günü sonra GMST başa dönüyor (sapma ${Math.min(sapma, 360 - sapma).toExponential(1)}°)`);
}

/* ═══ ÇIPA 3 — Ekvatorda ZORUNLU dört değer ═══════════════════════════════
 *
 * φ=0'da tan φ = 0 olur ve formül ASC = atan2(cos θ, −cos ε · sin θ)'ya
 * iner. Bu dört ana noktada eğim terimi düşer (sin θ ya da cos θ sıfır
 * olduğu için) ve sonuç TAM olarak θ+90'dır. Değerler veriye değil
 * MATEMATİĞE bağlı; "beklediğim çıktıyı yazdım" olamaz.
 *
 * Ara noktalarda eğim hâlâ devrede — orası aşağıdaki RA çıpasının işi.
 */
{
  const beklenen: Array<[number, number, string]> = [
    [0, 90, "yengec"],
    [90, 180, "terazi"],
    [180, 270, "oglak"],
    [270, 0, "koc"],
  ];
  for (const [lst, deg, burc] of beklenen) {
    const a = ascendantDeg(lst, 0)!;
    check(yakin(((a - deg) % 360 + 360) % 360, 0, 1e-9) || yakin(((deg - a) % 360 + 360) % 360, 0, 1e-9),
      `ekvator, LST=${lst}° → ${deg}° (geldi ${a.toFixed(6)})`);
    check(signOfDegree(a) === burc, `ekvator, LST=${lst}° → 0° ${burc}`);
  }
  /*
   * BAĞIMSIZ ÇIPA: ekvatorda yükselenin SAĞ AÇIKLIĞI (RA) tam olarak
   * LST + 90°'dir — ufuk orada kutuplardan geçen bir büyük çember olduğu
   * için doğu noktası göksel ekvatoru LST+90'da keser.
   *
   * Bu, ekliptik boylamına DEĞİL başka bir koordinat dönüşümüne dayanıyor:
   * çıkan λ'yı bağımsız bir formülle (tan RA = tan λ · cos ε) RA'ya çevirip
   * bilinen değerle karşılaştırıyoruz. Yani formül kendi kendini değil,
   * ondan türetilmeyen bir olguyu doğruluyor.
   *
   * (İlk yazdığımda "ekvatorda ASC = LST + 90" demiştim; o EKLİPTİK boylamı
   * için yanlış — eğim orada da devrede ve yalnız dört ana noktada denk
   * geliyor. Doğrusu RA üzerinden olanı.)
   */
  {
    const ep = OBLIQUITY_J2000 * (Math.PI / 180);
    for (const lst of [7, 33, 121, 200, 305, 359]) {
      const lam = ascendantDeg(lst, 0)! * (Math.PI / 180);
      const ra = ((Math.atan2(Math.sin(lam) * Math.cos(ep), Math.cos(lam)) * (180 / Math.PI)) % 360 + 360) % 360;
      check(yakin(ra, (lst + 90) % 360, 1e-6), `ekvatorda RA(ASC) = LST+90 (LST=${lst}, geldi ${ra.toFixed(6)})`);
    }
  }
}

/* ═══ ÇIPA 3b — Enlemin ZORUNLU etkisi ════════════════════════════════════
 *
 * Yukarıdaki çıpaların hepsi ekvatorda (φ=0) duruyor ve orada `tan φ = 0`
 * olduğu için enlem terimi zaten düşüyor. Yani o çıpalar, enlemi hiç
 * kullanmayan bir hesabı da onaylardı — mutasyonla görüldü, 117/117 geçti.
 *
 * θ=0'da formül kapalı bir biçime iniyor:
 *
 *     tan(ASC − 90°) = tan φ · sin ε
 *
 * Bu kimlik hem enlemi hem eğimi zorunlu kılıyor: biri düşerse eşitlik
 * bozulur. Sağ taraf hesaptan bağımsız olarak elde yazılıyor.
 */
{
  const ep = OBLIQUITY_J2000 * (Math.PI / 180);
  for (const lat of [-60, -34, -10, 0, 20, 41.01, 55]) {
    const asc = ascendantDeg(0, lat)!;
    const sol = Math.tan((asc - 90) * (Math.PI / 180));
    const sag = Math.tan(lat * (Math.PI / 180)) * Math.sin(ep);
    check(yakin(sol, sag, 1e-9), `θ=0, φ=${lat}: tan(ASC−90) = tan φ · sin ε (${sol.toFixed(6)} ≟ ${sag.toFixed(6)})`);
  }
  // Enlem gerçekten SONUCU değiştiriyor — aynı anda farklı yerde farklı yükselen.
  check(Math.abs(ascendantDeg(0, 41.01)! - ascendantDeg(0, 0)!) > 15,
    "İstanbul enleminde yükselen ekvatordakinden belirgin farklı");
  check(ascendantDeg(0, 41.01)! !== ascendantDeg(0, -41.01)!,
    "kuzey ve güney yarımküre farklı sonuç veriyor");
}

/* ═══ ÇIPA 4 — Örtme ve tek yönlülük ══════════════════════════════════════
 *
 * Sabit bir yerde bir yıldız günü boyunca yükselen on iki burcun HEPSİNDEN
 * geçmeli ve geri gitmemeli. Yanlış bir çeyrek düzeltmesi ya da işaret
 * hatası bu iki koşuldan birini kırar.
 */
for (const lat of [0, 20, 39, -34, 60]) {
  const burclar = new Set<string>();
  let onceki = ascendantDeg(0, lat)!;
  let geriGitti = false;
  for (let i = 1; i <= 1440; i++) {
    const a = ascendantDeg((i * 360) / 1440, lat)!;
    burclar.add(signOfDegree(a));
    // Artış 0–360 sarmasını hesaba katarak: fark her zaman ileri olmalı.
    const fark = ((a - onceki) % 360 + 360) % 360;
    if (fark > 180) geriGitti = true;
    onceki = a;
  }
  check(burclar.size === 12, `φ=${lat}: bir yıldız gününde 12 burcun hepsi (${burclar.size})`);
  check(!geriGitti, `φ=${lat}: yükselen geri gitmiyor`);
}

/* ── Kutup bölgesi: uydurmuyoruz ─────────────────────────────────────────── */
{
  const sinir = 90 - OBLIQUITY_J2000;
  check(ascendantDeg(0, sinir + 0.1) === null, "kutup çemberi ötesinde yükselen tanımsız");
  check(ascendantDeg(0, -(sinir + 0.1)) === null, "güneyde de tanımsız");
  check(ascendantDeg(0, sinir - 1) !== null, "sınırın berisinde hesaplanıyor");
}

/* ── Burç ve derece ──────────────────────────────────────────────────────── */
check(signOfDegree(0) === "koc", "0° = Koç");
check(signOfDegree(29.99) === "koc", "29,99° hâlâ Koç");
check(signOfDegree(30) === "boga", "30° = Boğa");
check(signOfDegree(359.9) === "balik", "359,9° = Balık");
check(signOfDegree(-1) === "balik", "negatif derece sarıyor");
check(yakin(degreeInSign(42.5), 12.5, 1e-9), "burç içi derece");
check(yakin(degreeInSign(360), 0, 1e-9), "360° başa dönüyor");

/* ── Girdi ayrıştırma: eksik veriyle hesap YOK ───────────────────────────── */
check(parseTime("03:45") === 3.75, "saat okunuyor");
check(parseTime("00:00") === 0, "gece yarısı 0");
check(parseTime("23:59") !== null, "23:59 geçerli");
for (const kotu of ["24:00", "12:60", "sabah", "3", "", undefined]) {
  check(parseTime(kotu) === null, `geçersiz saat reddediliyor: ${JSON.stringify(kotu)}`);
}
check(parseFullDate("1950-04-23")?.d === 23, "tam tarih okunuyor");
for (const eksik of ["1950", "1950-04", "50-04-23", "", undefined]) {
  check(parseFullDate(eksik) === null, `eksik tarih reddediliyor: ${JSON.stringify(eksik)}`);
}

/* ── Saat dilimi adayları ────────────────────────────────────────────────── */
{
  const ist = { lat: 41.01, lng: 28.98 };
  check(candidateOffsets(ist.lat, ist.lng, 2020).join() === "3", "Türkiye 2017+ → yalnız +3");
  check(candidateOffsets(ist.lat, ist.lng, 1950).join() === "2,3", "Türkiye 2016 öncesi → +2 ve +3");
  check(candidateOffsets(ist.lat, ist.lng, 2016).join() === "2,3", "2016 sınır yılında iki aday");
  // Türkiye dışı: boylamdan tek aday.
  check(candidateOffsets(48.85, 2.35, 1950).join() === "0", "Paris → +0 (boylamdan)");
  check(candidateOffsets(40.71, -74.0, 1950).join() === "-5", "New York → −5 (boylamdan)");
}

/* ── Uçtan uca: kesinlik iddiası dürüst mü ───────────────────────────────── */
{
  const ist = { lat: 41.01, lng: 28.98 };
  // 2020: tek aday → sonuç her zaman kesin.
  const a = ascendant("2020-06-15", "09:30", ist)!;
  check(a !== null && a.candidates.length === 1, "2017 sonrası tek aday");
  check(a.certain && a.sign !== null, "tek adayda sonuç kesin");
}
{
  const ist = { lat: 41.01, lng: 28.98 };
  /*
   * 1950: iki aday. Bir saat ≈ 15° yıldız zamanı ≈ yarım burç, yani bazı
   * saatlerde iki aday aynı burca düşer (kesin), bazılarında düşmez.
   * ÖNEMLİ OLAN: düşmediğinde `sign` null kalıyor — yarım bilgi kesinmiş
   * gibi sunulmuyor.
   */
  let kesin = 0, belirsiz = 0;
  for (let s = 0; s < 24; s++) {
    const r = ascendant("1950-04-23", `${String(s).padStart(2, "0")}:00`, ist)!;
    check(r.candidates.length === 2, `${s}:00 → iki aday`);
    if (r.certain) { kesin++; check(r.sign !== null, `${s}:00 kesinse burç var`); }
    else { belirsiz++; check(r.sign === null, `${s}:00 kesin değilse burç YAZILMIYOR`); }
  }
  check(kesin > 0 && belirsiz > 0, `iki durum da gerçekleşiyor (kesin ${kesin}, belirsiz ${belirsiz})`);
}
{
  // Eksik veriyle hiç hesap yok.
  const ist = { lat: 41.01, lng: 28.98 };
  check(ascendant("1950-04-23", "09:30", null) === null, "koordinat yoksa yükselen yok");
  check(ascendant("1950-04-23", undefined, ist) === null, "saat yoksa yükselen yok");
  check(ascendant("1950", "09:30", ist) === null, "yalnız yıl biliniyorsa yükselen yok");
  check(ascendant("1950-04", "09:30", ist) === null, "yıl-ay yetmiyor");
  check(ascendant("1950-04-23", "09:30", { lat: 89, lng: 0 }) === null, "kutupta yükselen yok");
}
{
  /*
   * Saatteki fark sonucu GERÇEKTEN değiştirmeli — yoksa hesap saati hiç
   * kullanmıyor demektir ve her şey sessizce yanlış olurdu.
   */
  const ist = { lat: 41.01, lng: 28.98 };
  const sabah = ascendant("1950-04-23", "06:00", ist)!;
  const aksam = ascendant("1950-04-23", "18:00", ist)!;
  check(Math.abs(sabah.candidates[0].degree - aksam.candidates[0].degree) > 90,
    "12 saat fark yükseleni belirgin biçimde kaydırıyor");

  // Yer de değiştirmeli.
  const ayniAnFarkliYer = ascendant("1950-04-23", "06:00", { lat: -33.9, lng: 151.2 })!;
  check(ayniAnFarkliYer.candidates[0].degree !== sabah.candidates[0].degree, "konum sonucu değiştiriyor");
}

/* ── Gizlilik: maskeli kişide yükselen hesaplanmıyor ─────────────────────── */
/*
 * Yükselen, doğum tarihinin YANINDA saatini ve yerini de ele veriyor —
 * yani burçtan daha çok şey söylüyor. `maskPerson` beyaz liste olduğu için
 * üç alanın üçü de taşınmıyor; bu test o güvenceyi kilitliyor, çünkü beyaz
 * listeye ileride bir alan eklenirse sessizce sızabilirdi.
 */
{
  const gizli = maskPerson({
    id: "1", firstName: "Ali", lastName: "Yılmaz", gender: "male",
    parentIds: [], spouseIds: [],
    birthDate: "1950-04-23", birthTime: "09:30", birthCoords: { lat: 41.01, lng: 28.98 },
  } as Person);
  check(gizli.birthTime === undefined, "maskeli kişide doğum saati yok");
  check(gizli.birthCoords === undefined, "maskeli kişide doğum koordinatı yok");
  check(ascendant(gizli.birthDate, gizli.birthTime, gizli.birthCoords) === null,
    "maskeli kişide yükselen hesaplanmıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
