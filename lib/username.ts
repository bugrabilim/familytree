/**
 * ÜYE KULLANICI ADI — kimliği şifreden ayırmak (madde 36).
 *
 * ## Düzeltilen şey
 *
 * Giriş formu ağaç adı + şifre istiyordu ve üye seçtirmiyordu; bu yüzden
 * "kim giriyor" sorusu ŞİFREYE göre yanıtlanıyordu: `findMemberByPassword`
 * ağacın bütün üyelerini gezip bcrypt karşılaştırması yapıyor, ilk eşleşen
 * kazanıyordu. Bunun üç sonucu vardı:
 *
 * 1. İki üye aynı şifreyi seçerse biri ötekinin KİMLİĞİYLE VE ROLÜYLE
 *    oturum açardı. Kapı katılma anına kondu — "bu şifre bu ağaçta
 *    kullanılıyor" — ama o mesajın kendisi bir sızıntı: başka birinin
 *    şifresini doğrulamış oluyorsunuz.
 * 2. Üye şifresini değiştiremiyordu; her değişiklik aynı çakışma riskini
 *    taşıyordu ve kontrol edecek yer yoktu.
 * 3. Her üye girişi, ağaçtaki üye sayısı kadar bcrypt karşılaştırması
 *    demekti — bcrypt bilerek yavaş, yani maliyet üye sayısıyla büyüyordu.
 *
 * Kullanıcı adı üçünü birden çözüyor: kimlik ADLA çözülüyor, şifre yalnız
 * O ÜYENİN özetiyle karşılaştırılıyor.
 *
 * ## Neden ASCII
 *
 * Türkçe harfler kullanıcı adında belirsizlik üretiyor: "İ"nin küçüğü
 * yerele göre "i" ya da "i̇" oluyor ve iki farklı yazım aynı ada
 * çözülebiliyor — kimlik çözen bir alanda bu, yanlış kişiyi bulmak demek.
 * Görünen ad (`displayName`) zaten serbest; burada aranan şey benzersiz ve
 * TEK BİÇİMLİ bir anahtar.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

/** İzinli karakterler: küçük harf, rakam, nokta, alt çizgi, tire. */
const GECERLI = /^[a-z0-9._-]+$/;

/**
 * Karşılaştırma biçimi: kırpılmış ve küçük harfe indirilmiş.
 *
 * Depoya HEP bu hâli yazılıyor. Ham hâliyle saklanıp karşılaştırmada
 * indirilseydi, iki temsil olurdu ve biri unutulduğunda "Ayse" ile "ayse"
 * ayrı iki üye olarak yan yana durabilirdi.
 *
 * `toLowerCase` yerel duyarsız çağrılıyor (`toLocaleLowerCase` DEĞİL):
 * Türkçe yerelinde "I" → "ı" oluyor ve sunucunun yereli, kullanıcının
 * adının nereye çözüleceğini belirlerdi.
 */
export function normalizeUsername(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

export type UsernameFail = "kisa" | "uzun" | "gecersiz" | "basi-harf-degil";

/**
 * Kullanıcı adı geçerli mi? Girdi ÖNCE normalleştirilmiş sayılıyor.
 *
 * Baş harf koşulu var: yalnız rakam ya da noktalama ile başlayan adlar
 * ("123", "_x", ".") bir kimlikten çok bir kimlik NUMARASI gibi görünüyor
 * ve ileride sayısal kimliklerle karışabilir.
 */
export function checkUsername(u: string): { ok: true } | { ok: false; fail: UsernameFail } {
  if (u.length < USERNAME_MIN) return { ok: false, fail: "kisa" };
  if (u.length > USERNAME_MAX) return { ok: false, fail: "uzun" };
  if (!GECERLI.test(u)) return { ok: false, fail: "gecersiz" };
  if (!/^[a-z]/.test(u)) return { ok: false, fail: "basi-harf-degil" };
  return { ok: true };
}

/** Bu ağaçta bu ad alınmış mı? Karşılaştırma normalleştirilmiş hâl üstünden. */
export function usernameTaken(
  members: ReadonlyArray<{ username?: string }>,
  u: string
): boolean {
  const hedef = normalizeUsername(u);
  if (!hedef) return false;
  return members.some((m) => normalizeUsername(m.username) === hedef);
}

/**
 * Görünen addan bir kullanıcı adı ÖNERİSİ.
 *
 * Katılma formunda alanı boş bırakmamak için: "Ayşe Yılmaz" → "ayseyilmaz".
 * Öneri yalnız başlangıç değeri; kullanıcı değiştirebiliyor ve geçerlilik
 * yine `checkUsername`den geçiyor.
 */
const TR_HARF: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", i̇: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
};

export function suggestUsername(displayName: string): string {
  const sade = [...(displayName ?? "")]
    .map((ch) => TR_HARF[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const kirpik = sade.slice(0, USERNAME_MAX);
  // Baş harf koşulunu öneri de sağlamalı; yoksa form doğrudan hatayla açılır.
  return /^[a-z]/.test(kirpik) ? kirpik : "";
}
