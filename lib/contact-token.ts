import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AĞAÇTAKİ KİŞİYE GİDEN BAĞLANTILARIN JETONLARI (madde 47/48 uzantısı).
 *
 * ## Neden jetonun içinde "hangi ağaç, hangi kişi" yazıyor
 *
 * Hesap adresleri tek bir blobda (`users.json`) duruyor, o yüzden orada çıplak
 * bir jetonla satır TARANABİLİYOR. Kişiler öyle değil: her ağaç ayrı bir
 * blobda (`family-data-<treeId>.json`) ve kaç ağaç olduğu bilinmiyor. Çıplak
 * bir jeton, bütün ağaçları tek tek açıp taramak demek olurdu — bir posta
 * bağlantısına tıklanması, deponun tamamının okunmasını tetiklerdi.
 *
 * Bu yüzden jeton bir ADRES + bir SIR taşıyor. Adres gizli değil ve olması da
 * gerekmiyor: bağlantıyı alan kişi zaten o kayıtla ilgili olan kişi. Gizlilik
 * sırdan geliyor.
 *
 * ## İki jeton, iki farklı ömür — bilerek
 *
 * **Onay jetonu tek kullanımlık.** Rastgele üretiliyor, ÖZETİ kayda yazılıyor,
 * yanıt gelince düşüyor. Postada duran bir bağlantı sonsuza dek onay/ret
 * değiştirebilseydi, o postayı gören herkes o kişi adına karar verebilirdi:
 * iletilmiş bir posta, ortak kullanılan bir telefon, bir ekran görüntüsü.
 *
 * **Abonelikten çıkma jetonu kalıcı ve saklanmıyor.** HMAC ile türetiliyor.
 * İki sebep: (1) çıkış bağlantısı HER postada olmalı ve onay jetonu yanıt
 * gelince düştüğü için ondan türetilemez; (2) onay vermiş biri fikrini yıllar
 * sonra değiştirebilir ve bunun için hesap açması beklenemez — hesabı yok.
 * Tek kullanımlık bir çıkış bağlantısı, çıkışı bir kereye indirmek olurdu.
 *
 * Saf ve bağımlılıksız (yalnız `node:crypto`) — birim testi koşulabilsin.
 */

/* ── Adres bölümü ─────────────────────────────────────────────────────────── */

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

export interface Locator {
  treeId: string;
  personId: string;
}

/** Jetondan çözülen bölümler. Biçim bozuksa `null`. */
export interface ParsedToken extends Locator {
  /** Jetonun sır bölümü — onayda rastgele, çıkışta HMAC. */
  proof: string;
}

/**
 * `<ağaç>.<kişi>.<sır>` — üç bölüm, nokta ayraçlı.
 *
 * Kimlikler base64url'e çevriliyor çünkü ayraç olarak nokta seçildi ve bir
 * kimlikte nokta geçerse bölümleme kayardı. `split` yerine bölüm SAYISI
 * denetleniyor: fazladan nokta taşıyan bir jeton sessizce kabul edilmemeli.
 */
export function packToken(loc: Locator, proof: string): string {
  return `${b64(loc.treeId)}.${b64(loc.personId)}.${proof}`;
}

export function parseToken(token: unknown): ParsedToken | null {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [a, k, proof] = parts;
  if (!a || !k || !proof) return null;
  try {
    const treeId = unb64(a);
    const personId = unb64(k);
    if (!treeId || !personId) return null;
    /*
     * Base64url ÇİFT YÖNLÜ denetleniyor: `Buffer.from` geçersiz karakterleri
     * sessizce atıyor, yani "aaa!" ile "aaa" aynı sonuca çözülüyor. Geri
     * kodlayıp karşılaştırmadan, tek bir kimlik için sonsuz sayıda geçerli
     * yazım kabul edilmiş olurdu.
     */
    if (b64(treeId) !== a || b64(personId) !== k) return null;
    return { treeId, personId, proof };
  } catch {
    return null;
  }
}

/* ── Onay jetonu — tek kullanımlık ────────────────────────────────────────── */

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Yeni onay jetonu: bağlantıya girecek HAM jeton + kayda yazılacak ÖZET. */
export function makeAskToken(loc: Locator): { token: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { token: packToken(loc, secret), hash: sha256(secret) };
}

/**
 * Sır, kayıttaki özete uyuyor mu? Sabit zamanlı.
 *
 * Uzunluk eşitliği ÖNCE denetleniyor: `timingSafeEqual` farklı uzunlukta
 * atıyor ve atan bir karşılaştırma, "yanlış" ile "biçimsiz"i ayırt eden bir
 * zamanlama sızıntısına dönüşür.
 */
export function matchesHash(secret: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(sha256(secret), "utf8");
  const b = Buffer.from(storedHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ── Abonelikten çıkma jetonu — kalıcı, saklanmayan ───────────────────────── */

/**
 * Sunucu sırrı. `AUTH_SECRET` yoksa `null` DÖNÜYOR ve çağıranlar çıkış
 * bağlantısını hiç üretmiyor — rastgele bir sırra düşmek, yeniden başlatmada
 * bütün çıkış bağlantılarını geçersiz kılardı ve kimse nedenini anlamazdı.
 */
function unsubKey(): string | null {
  return process.env.AUTH_SECRET?.trim() || null;
}

/** Çıkış jetonu üretilebilir mi? (Yapılandırma denetimi, çağırandan önce.) */
export function isUnsubConfigured(): boolean {
  return unsubKey() !== null;
}

const unsubMac = (key: string, loc: Locator) =>
  createHmac("sha256", key).update(`unsub:${loc.treeId}:${loc.personId}`).digest("base64url");

export function makeUnsubToken(loc: Locator): string | null {
  const key = unsubKey();
  if (!key) return null;
  return packToken(loc, unsubMac(key, loc));
}

/**
 * Çıkış jetonunu doğrular ve kime ait olduğunu döndürür.
 *
 * HMAC, jetondaki ADRESİN ÜSTÜNDEN hesaplanıyor: adres değiştirilirse imza
 * tutmaz. Aksi hâlde kendi çıkış bağlantısını alan biri, ağaç/kişi kimliğini
 * değiştirip BAŞKASINI abonelikten çıkarabilirdi.
 */
export function verifyUnsubToken(token: unknown): Locator | null {
  const key = unsubKey();
  if (!key) return null;
  const p = parseToken(token);
  if (!p) return null;
  const beklenen = Buffer.from(unsubMac(key, p), "utf8");
  const gelen = Buffer.from(p.proof, "utf8");
  if (beklenen.length !== gelen.length) return null;
  if (!timingSafeEqual(beklenen, gelen)) return null;
  return { treeId: p.treeId, personId: p.personId };
}
