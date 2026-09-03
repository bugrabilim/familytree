import { ZODIAC_ORDER, type ZodiacSign } from "./zodiac.ts";

/**
 * YÜKSELEN BURÇ (madde 66, 2/2).
 *
 * Güneş burcu yalnız tarihi ister; yükselen doğum **anını** ve **yerini**
 * birlikte ister. Bu yüzden gerçek gökbilim: yerel yıldız zamanı, ekliptik
 * eğimi ve enlemden ufkun ekliptiği kestiği nokta.
 *
 * ## Doğrulama çıpaları
 *
 * Madde 66 "çıpa bulunmadan yazılmamalı" diyordu — Hicri takvimde olduğu
 * gibi, sessizce yanlış sonuç üreten bir hesap en kötüsü. Dört bağımsız
 * çıpa kullanıldı ve dördü de `tests/ascendant.test.mts`te duruyor:
 *
 * 1. **Yayımlanmış GMST (J2000.0).** 1 Ocak 2000, 12:00 UT'de Greenwich
 *    ortalama yıldız zamanı 18s 41d 50,5sn'dir. Formülün sabit terimi
 *    (280,46061837°) bu değere birebir oturmalı.
 * 2. **Yayımlanmış yıldız günü.** Yıldız günü güneş gününden 3d 56,6sn
 *    kısadır; formülün günlük ilerlemesi (360,98564736629°/gün) bunu
 *    vermeli.
 * 3. **Ekvatorda ZORUNLU dört değer.** φ=0'da formül cebirsel olarak
 *    ASC = LST + 90°'a iner: LST=0 → 0° Yengeç, 90° → 0° Terazi,
 *    180° → 0° Oğlak, 270° → 0° Koç. Bunlar veriye değil matematiğe bağlı,
 *    yani "beklediğim çıktıyı yazdım" olamaz.
 * 4. **Örtme ve tek yönlülük.** Sabit bir yerde bir yıldız günü boyunca
 *    yükselen on iki burcun HEPSİNDEN geçmeli ve geri gitmemeli.
 *
 * ## Saat dilimi sorunu — ve neden tek bir burç yazmıyoruz
 *
 * `birthTime` saat dilimi taşımıyor: kayıtta yazan yerel saat neyse odur.
 * Ama yükselen, saatin hangi dilime ait olduğuna DUYARLI. Türkiye için
 * ölçek küçük değil — 1 saatlik fark ≈ 15° yıldız zamanı ≈ yarım burç.
 * Türkiye 2016'ya kadar UTC+2 kullandı (yazın çoğu yıl +3), 2016 Eylül'den
 * beri sürekli UTC+3. Bir 1950 kaydına bugünkü +3'ü uygulamak sessiz bir
 * hata olurdu.
 *
 * Çözüm: makul dilim adaylarının HEPSİ için hesaplanır. Hepsi aynı burca
 * düşüyorsa burç yazılır; düşmüyorsa "kesin değil" denip adaylar gösterilir.
 * Yarım bilgiyi kesinmiş gibi sunmaktansa belirsizliği söylemek doğru.
 *
 * Saf ve bağımlılık-hafif — birim testi koşulabilsin.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Ekliptik eğimi, J2000.0 (derece). Yayımlanmış değer. */
export const OBLIQUITY_J2000 = 23.4392911;

/** Julian Day sayısını hesaplayan sabitler — GMST formülünün başlangıcı. */
export const J2000 = 2451545.0;

/**
 * Julian Day (UT). Gregoryen takvim varsayılır.
 *
 * `hourUT` kesirli saat (13.5 = 13:30). Formül Meeus, *Astronomical
 * Algorithms*, bölüm 7.
 */
export function julianDay(year: number, month: number, day: number, hourUT: number): number {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day + b - 1524.5 + hourUT / 24
  );
}

/**
 * Greenwich ortalama yıldız zamanı (derece, 0–360).
 *
 * Sabit terim yayımlanmış J2000 değerine, günlük katsayı da yayımlanmış
 * yıldız günü uzunluğuna karşılık gelir (çıpa 1 ve 2).
 */
export function gmstDeg(jd: number): number {
  const d = jd - J2000;
  const t = d / 36525;
  const g =
    280.46061837 +
    360.98564736629 * d +
    0.000387933 * t * t -
    (t * t * t) / 38710000;
  return ((g % 360) + 360) % 360;
}

/** Yerel yıldız zamanı (derece). Boylam DOĞU pozitif. */
export function lstDeg(jd: number, lngEast: number): number {
  return ((gmstDeg(jd) + lngEast) % 360 + 360) % 360;
}

/**
 * Yükselen noktanın ekliptik boylamı (derece, 0–360).
 *
 * ASC = atan2( cos θ , −( sin θ · cos ε + tan φ · sin ε ) )
 *
 * Kutup çevresinde (|φ| ≥ 90° − ε) ekliptiğin bir kısmı hiç doğmaz ve
 * `tan φ` patlar; oradaki "yükselen" tanımsızdır. Uydurmak yerine `null`.
 */
export function ascendantDeg(lst: number, latDeg: number, oblDeg = OBLIQUITY_J2000): number | null {
  if (Math.abs(latDeg) >= 90 - oblDeg) return null;
  const th = lst * DEG, ph = latDeg * DEG, ep = oblDeg * DEG;
  const y = Math.cos(th);
  const x = -(Math.sin(th) * Math.cos(ep) + Math.tan(ph) * Math.sin(ep));
  const a = Math.atan2(y, x) * RAD;
  return ((a % 360) + 360) % 360;
}

/** Ekliptik boylamından burç. 0° = 0° Koç. */
export function signOfDegree(deg: number): ZodiacSign {
  const d = ((deg % 360) + 360) % 360;
  return ZODIAC_ORDER[Math.floor(d / 30) % 12];
}

/** Burç içindeki derece (0–29,99…) — "12° Terazi" gibi göstermek için. */
export function degreeInSign(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  return d - Math.floor(d / 30) * 30;
}

/* ── Saat dilimi adayları ─────────────────────────────────────────────────── */

/**
 * Türkiye sınırlarını kabaca saran kutu. Kesin sınır değil — amaç "bu kayıt
 * Türkiye saatiyle mi tutulmuş olabilir" sorusuna yanıt vermek.
 */
function inTurkey(lat: number, lng: number): boolean {
  return lat >= 35.5 && lat <= 42.5 && lng >= 25.5 && lng <= 45;
}

/**
 * Kaydedilen saatin ait olabileceği UTC farkları.
 *
 * · Türkiye, 2017 ve sonrası → yalnız +3 (2016 Eylül'den beri sürekli).
 * · Türkiye, 2016 ve öncesi → +2 ve +3. Standart saat +2'ydi ama yaz saati
 *   çoğu yıl uygulandı; hangi tarihte yürürlükte olduğunu tarih tarih
 *   bilmiyoruz, o yüzden İKİSİ de aday.
 * · Başka yer → boylamdan türetilen en yakın tam saat. Tek aday: elimizde
 *   o ülkenin dilim tarihi yok ve uydurmuyoruz.
 */
export function candidateOffsets(lat: number, lng: number, year: number): number[] {
  if (inTurkey(lat, lng)) return year >= 2017 ? [3] : [2, 3];
  return [Math.round(lng / 15)];
}

/* ── Sonuç ────────────────────────────────────────────────────────────────── */

export interface AscendantCandidate {
  /** Varsayılan UTC farkı (saat). */
  offset: number;
  degree: number;
  sign: ZodiacSign;
  degreeInSign: number;
}

export interface AscendantResult {
  /** Bütün adaylar aynı burca düşüyor mu? */
  certain: boolean;
  /** Kesinse burç; değilse `null` — yarım bilgi kesinmiş gibi sunulmuyor. */
  sign: ZodiacSign | null;
  candidates: AscendantCandidate[];
}

/** "HH:MM" → kesirli saat. Geçersizse `null`. */
export function parseTime(time?: string): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]), dk = Number(m[2]);
  if (h > 23 || dk > 59) return null;
  return h + dk / 60;
}

/** "YYYY-MM-DD" → parçalar. Yıl-ay ya da yalnız yıl YETMEZ: gün şart. */
export function parseFullDate(stored?: string): { y: number; m: number; d: number } | null {
  if (!stored) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stored.trim());
  if (!m) return null;
  const y = Number(m[1]), ay = Number(m[2]), g = Number(m[3]);
  if (ay < 1 || ay > 12 || g < 1 || g > 31) return null;
  return { y, m: ay, d: g };
}

/**
 * Yükselen burç.
 *
 * Dördü de gerekir: TAM tarih, saat ve koordinat. Biri eksikse `null` —
 * "yaklaşık" bir yükselen diye bir şey yok; yıl-ay bilinen bir kayıt için
 * hesap yapmak, olmayan bir kesinlik uydurmak olurdu.
 */
export function ascendant(
  birthDate?: string,
  birthTime?: string,
  coords?: { lat: number; lng: number } | null
): AscendantResult | null {
  const t = parseTime(birthTime);
  const d = parseFullDate(birthDate);
  if (t === null || d === null || !coords) return null;
  const { lat, lng } = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const candidates: AscendantCandidate[] = [];
  for (const offset of candidateOffsets(lat, lng, d.y)) {
    // Yerel saat → UT. Gün taşması `julianDay`ın kesirli saatinde erir.
    const jd = julianDay(d.y, d.m, d.d, t - offset);
    const deg = ascendantDeg(lstDeg(jd, lng), lat);
    if (deg === null) return null; // kutup bölgesi — yükselen tanımsız
    candidates.push({ offset, degree: deg, sign: signOfDegree(deg), degreeInSign: degreeInSign(deg) });
  }
  if (candidates.length === 0) return null;

  const ilk = candidates[0].sign;
  const certain = candidates.every((c) => c.sign === ilk);
  return { certain, sign: certain ? ilk : null, candidates };
}
