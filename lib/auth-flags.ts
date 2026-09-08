/**
 * Giriş yolu bayrakları — BAĞIMLILIKSIZ, bilerek.
 *
 * `lib/auth-users.ts` `server-only` ve Supabase istemcisine bağlı;
 * dolayısıyla oradaki hiçbir şey birim testi edilemiyor. Oysa buradaki iki
 * satırın doğruluğu "kimse giremiyor" ile "herkes girebiliyor" arasındaki
 * farkı belirliyor — kaynağa bakan bir kapı testiyle yetinilecek yer değil.
 * Ayrı dosya, doğruluk tablosunun gerçekten ÇALIŞTIRILARAK sınanması için
 * (`tests/auth-flags.test.mts`).
 */

/**
 * 3c bayrağı: giriş doğrulaması Supabase Auth'u DENESİN mi?
 *
 * Varsayılan KAPALI → davranış bugünküyle bire bir aynı (sıfır ek gecikme).
 * `SUPABASE_AUTH_LOGIN=1` yapıldığında (Email sağlayıcısı açık + hesaplar
 * içe aktarılmışken) giriş Supabase üzerinden doğrulanır. İstediğin an
 * değişkeni kaldırarak anında geri alınır — ve o an bcrypt yolu kendiliğinden
 * geri açılır (`isBcryptFallbackEnabled`), yani geri alma kimseyi dışarıda
 * bırakmıyor.
 */
export function isSupabaseLoginEnabled(): boolean {
  const v = (process.env.SUPABASE_AUTH_LOGIN || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Faz 4 — KURUCUNUN bcrypt yolu hâlâ denensin mi? Varsayılan HAYIR.
 *
 * Faz 3c'de giriş "önce Supabase, olmazsa bcrypt" idi. O yedek, göç sürerken
 * doğruydu: hesapların bir kısmı henüz Auth'ta yoktu. Şimdi tersi geçerli —
 * yedek durdukça Supabase Auth asıl kaynak DEĞİL, yalnız hızlı bir ön
 * kontrol olur: Auth'ta silinen, kilitlenen ya da şifresi değiştirilen bir
 * hesap `users.json`'daki eski hash'le girmeye devam eder. "Auth'a geçtik"
 * demek, ancak Auth HAYIR dediğinde giriş de hayır diyorsa doğrudur.
 *
 * ## Kilitlenme İMKÂNSIZ — bayrak tek başına karar vermiyor
 *
 * `SUPABASE_AUTH_LOGIN` kapalıyken bcrypt TEK yoldur; o durumda bu işlev
 * bayrağa hiç bakmadan `true` döner. Aksi hâlde tek bir değişkeni silmek
 * (ya da yanlış yazmak) bütün kurucuları dışarıda bırakırdı — geri dönüşü
 * yine aynı paneli gerektiren, kendi kendini kilitleyen bir tuzak.
 *
 * ## Acil durum anahtarı
 *
 * `AUTH_BCRYPT_FALLBACK=1` yedeği geri açar. Supabase Auth kesintisinde
 * girişin tamamen durmaması için var; kalıcı bir ayar değil. Yedek
 * açıldığında da güvenli: `users.json`'daki hash sıfırlamalarda
 * güncelleniyor (Faz 4/1a), dolayısıyla eski bir şifre orada kalmıyor.
 */
export function isBcryptFallbackEnabled(): boolean {
  if (!isSupabaseLoginEnabled()) return true;
  const v = (process.env.AUTH_BCRYPT_FALLBACK || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

