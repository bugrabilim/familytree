import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * KURTARMA KODU — normalleştirme, ARANABİLİR indeks ve üretim.
 *
 * ## Neden bir indeks gerekti
 *
 * Kurtarma koduyla sıfırlama, kodun yanında bir de AĞAÇ ADI soruyordu. Bunun
 * ürün gerekçesi değil teknik gerekçesi vardı: `recoveryCodeHash` bcrypt ve
 * bcrypt her seferinde yeni tuz üretiyor, dolayısıyla `hash(kod)` ile satır
 * ARANAMIYOR — ancak "bu hesabın hash'i bu koda uyuyor mu" diye
 * KARŞILAŞTIRILABİLİYOR. Yani önce adla satır bulunuyor, sonra bcrypt
 * doğruluyordu. Şifresini unutmuş birinden ayrıca ağacının tam yazımını da
 * hatırlamasını istemek, kurtarma yolunun kendisini zorlaştırıyordu.
 *
 * Çözüm: kodun kendisinden TÜRETİLEN, deterministik bir arama indeksi
 * (`recoveryCodeIndex`) — normalleştirilmiş kodun SHA-256 özeti.
 *
 * ## İndeks neden TUZSUZ (ve bu neden sorun değil)
 *
 * Tuzlu olsaydı aranamazdı; aranabilmesi tek varlık sebebi. Tuzsuz özetin
 * klasik riski sözlük saldırısıdır: parolalar gibi düşük entropili sırlarda
 * özetten düz metne dönmek ucuzdur. Burada sır düşük entropili DEĞİL — 32
 * harfli alfabeden 16 karakter, yani 32^16 ≈ 2^80 olasılık; sözlüğü de
 * yoktur, çünkü kodu insan seçmiyor, biz üretiyoruz.
 *
 * ## İndeks tek başına DOĞRULAMA DEĞİLDİR
 *
 * İndeks yalnızca SATIRI BULUR. Asıl doğrulamayı bcrypt yapar ve bcrypt
 * kalır. Yalnız indekse güvenmek, tuzsuz tek turlu SHA-256'yı kimlik
 * doğrulama katmanı yapmak olurdu: depoyu (ya da bir yedeği) okuyabilen biri
 * için çevrimdışı deneme maliyeti bcrypt'te milisaniyeler, SHA-256'da
 * nanosaniyelerdir.
 *
 * Saf ve bağımlılık-hafif tutuluyor (`node:crypto` dışında içe aktarım yok) —
 * `node --experimental-strip-types` altında birim testi koşulabilsin diye.
 */

/**
 * Kodun alfabesi: 32 karakter. I, O, 0 ve 1 bilerek YOK — kod kâğıda yazılıp
 * elle geri okunuyor ve bu dördü birbirine karışıyor.
 */
export const KURTARMA_ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Kod uzunluğu (ayraçsız). 16 × log2(32) = 80 bit. */
export const KURTARMA_UZUNLUK = 16;

/** Görüntülemede kaçar karakterde bir tire konur. */
const GRUP = 4;

const ALFABE = new Set(KURTARMA_ALFABE);

/**
 * İndeksin ALAN AYRACI. Aynı SHA-256'yı başka bir amaçla da kullanırsak
 * (jeton özeti, önbellek anahtarı) iki alanın çıktısı birbirine karışmasın:
 * bir yerde hesaplanan özet başka bir yerde "geçerli indeks" gibi
 * davranamamalı.
 */
const ALAN = "soyagaci:kurtarma-kodu:v1:";

/**
 * Kullanıcının elle yazdığı kodu tek biçime indirir.
 *
 * Yalnız AYRAÇLARI (tire, boşluk, alt çizgi, nokta) atar ve büyük harfe
 * çevirir; tanımadığı karakteri SESSİZCE ATMAZ — atsaydı "AB!CD" ile "ABCD"
 * aynı koda dönerdi ve yanlış yazılmış bir kod farkında olmadan başka bir
 * hesabın koduna eşlenebilirdi. Tanınmayan karakter, kodu geçersiz yapar.
 *
 * TÜRKÇE TUZAĞI: `toUpperCase()`/`toLowerCase()` Türkçe yerelde "i" ↔ "I"
 * eşlemesini bozar ("i" → "İ", "I" → "ı"). Sunucunun yereli neyse ona bağlı
 * bir normalleştirme, aynı kodun iki farklı indeks üretmesi demekti; bu
 * yüzden yerel AÇIKÇA "en".
 */
export function normalizeRecoveryCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\s\-_.]+/gu, "").toLocaleUpperCase("en");
}

/** Normalleştirilmiş kod beklenen biçimde mi (uzunluk + alfabe)? */
export function isRecoveryCodeShaped(normalized: string): boolean {
  if (normalized.length !== KURTARMA_UZUNLUK) return false;
  for (const ch of normalized) if (!ALFABE.has(ch)) return false;
  return true;
}

/** Ayraçlı gösterim: XXXX-XXXX-XXXX-XXXX. */
export function formatRecoveryCode(normalized: string): string {
  const parcalar: string[] = [];
  for (let i = 0; i < normalized.length; i += GRUP) parcalar.push(normalized.slice(i, i + GRUP));
  return parcalar.join("-");
}

/**
 * Aranabilir indeks — normalleştirilmiş kodun SHA-256'sı (onaltılık).
 *
 * Biçimsiz kod için `null`: geçersiz girdiden bir indeks üretmek, depoda
 * asla eşleşmeyecek bir değerle arama yapmak ve "bulunamadı"yı "kod yanlış"
 * ile karıştırmak olurdu.
 */
export function recoveryCodeIndex(raw: unknown): string | null {
  const kod = normalizeRecoveryCode(raw);
  if (!isRecoveryCodeShaped(kod)) return null;
  return createHash("sha256").update(ALAN + kod).digest("hex");
}

/**
 * bcrypt ile denenecek DÜZ METİNLER, sırayla.
 *
 * Tek bir aday yetmiyor çünkü depodaki hash'in hangi yazımdan üretildiğini
 * bilmiyoruz: eski kayıtlar kodu AYRAÇLI hâliyle (XXXX-XXXX-…) hash'lemişti.
 * Kullanıcının yazdığı ham metin de (kırpılmış hâliyle) listede — kimseyi
 * normalleştirmenin gözden kaçırdığı bir yazım yüzünden dışarıda bırakmayalım.
 *
 * Yinelenenler ayıklanıyor: her aday bir bcrypt turu, yani sunucu işlemcisi.
 */
export function recoveryCodeCandidates(raw: unknown): string[] {
  const kod = normalizeRecoveryCode(raw);
  const ham = typeof raw === "string" ? raw.trim() : "";
  const adaylar = [formatRecoveryCode(kod), kod, ham].filter((s) => s.length > 0);
  return [...new Set(adaylar)];
}

/**
 * İki onaltılık özeti SABİT SÜREDE karşılaştırır.
 *
 * Erken dönen bir karşılaştırma, doğru öneki tahmin eden saldırgana zamanlama
 * üzerinden geri bildirim verir. Uzunluk farkı zaten gizlenemez, o yüzden
 * önce uzunluk denetimi (`timingSafeEqual` farklı uzunlukta fırlatır).
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * Yeni kurtarma kodu üretir (ayraçlı).
 *
 * `sec` yalnız TEST için dışarıdan verilebilir; varsayılanı `randomInt`, yani
 * kriptografik üreteç. Burada eskiden `Math.random()` vardı: bir KİMLİK
 * DOĞRULAMA sırrı, tohumu tahmin edilebilen bir üreteçten geliyordu.
 * `randomInt` ayrıca modülo yanlılığı da yapmıyor.
 */
export function generateRecoveryCode(sec: (max: number) => number = (max) => randomInt(max)): string {
  let kod = "";
  for (let i = 0; i < KURTARMA_UZUNLUK; i++) kod += KURTARMA_ALFABE[sec(KURTARMA_ALFABE.length)];
  return formatRecoveryCode(kod);
}

export interface UretilenKod {
  /** Kullanıcıya gösterilecek ayraçlı kod. */
  code: string;
  /** Depoya yazılacak arama indeksi. */
  index: string;
}

/**
 * KULLANILMAYAN bir kod üretir — çakışırsa yeniden dener.
 *
 * Rastgelelikle çakışma ihtimali 2^80'de bir mertebesinde, ama "çok düşük"
 * ile "imkânsız" aynı şey değil ve bu bir kimlik doğrulama sırrı: iki hesabın
 * aynı kodu taşıması, birinin öbürünün hesabını ele geçirmesi demek. İndeks
 * ayrıca ARAMA anahtarı; çakışan iki satırda "hangisi" sorusunun doğru cevabı
 * yok.
 *
 * Denemeler bitince HATA fırlatır, sessizce çakışan kodu döndürmez: burada
 * "olabilir" ile devam etmenin bedeli hesap devri.
 */
export function pickUniqueRecoveryCode(
  kullanilan: ReadonlySet<string>,
  opts: { denemeler?: number; sec?: (max: number) => number } = {}
): UretilenKod {
  const denemeler = opts.denemeler ?? 5;
  for (let i = 0; i < denemeler; i++) {
    const code = generateRecoveryCode(opts.sec);
    const index = recoveryCodeIndex(code);
    if (!index) continue; // üretilen kod her zaman biçimli; savunma amaçlı
    if (!kullanilan.has(index)) return { code, index };
  }
  throw new Error("Benzersiz kurtarma kodu üretilemedi.");
}

export type RecoveryLookupPlan =
  /** Kod okunamadı; uç TEK hata mesajıyla dönmeli. */
  | { kind: "reddet"; reason: "kod-yok" | "kod-bicimsiz" }
  /**
   * Arama yapılabilir. `index` ile satır bulunur; bulunamazsa ve `familyName`
   * doluysa ESKİ yol (ad ile bulma) denenir. `codes` bcrypt adayları.
   */
  | { kind: "ara"; index: string; codes: string[]; familyName: string | null };

/**
 * Sıfırlama isteği nasıl aranmalı?
 *
 * ## Ağaç adı neden hâlâ duruyor (ve neden İSTEĞE BAĞLI)
 *
 * İndeks yalnız yeni/yenilenmiş hesaplarda var. Var olan hesapların elinde
 * yalnız bcrypt hash'i var ve kodun düz hâli HİÇ KİMSEDE yok — dolayısıyla
 * indeks geriye dönük doldurulamaz. Ad alanını tümden kaldırmak, kurtarma
 * kodunu kâğıda yazmış eski kullanıcıları hesaplarından kilitlemek olurdu;
 * yani özelliğin var olma sebebinin tam tersi. Bu yüzden ad ZORUNLU olmaktan
 * çıkıyor ama KAYBOLMUYOR: kod tek başına yetmezse ikinci bir yol olarak
 * kalıyor.
 */
export function planRecoveryLookup(familyName: unknown, recoveryCode: unknown): RecoveryLookupPlan {
  const ham = typeof recoveryCode === "string" ? recoveryCode.trim() : "";
  if (!ham) return { kind: "reddet", reason: "kod-yok" };

  const index = recoveryCodeIndex(ham);
  if (!index) return { kind: "reddet", reason: "kod-bicimsiz" };

  const ad = typeof familyName === "string" ? familyName.trim() : "";
  return { kind: "ara", index, codes: recoveryCodeCandidates(ham), familyName: ad || null };
}
