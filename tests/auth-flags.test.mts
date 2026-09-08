import { isBcryptFallbackEnabled, isSupabaseLoginEnabled } from "../lib/auth-flags.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * Giriş yolu bayraklarının DOĞRULUK TABLOSU.
 *
 * İki değişken, dört durum ve dördünün de yanlış olması ayrı bir felaket:
 * ya kimse giremez ya da Auth'ta kapatılmış bir hesap girmeye devam eder.
 * Bu yüzden kaynağa bakan bir kapı testi değil, çalıştırılan bir tablo.
 *
 * Sınanan asıl kural: `SUPABASE_AUTH_LOGIN` kapalıyken bcrypt yedeği
 * ZORLA açık kalır. Yoksa tek bir değişkeni silmek (ya da yanlış yazmak)
 * bütün kurucuları kilitlerdi ve açması için gereken panele de yine giriş
 * gerekirdi.
 */

function kur(supabase: string | undefined, bcrypt: string | undefined) {
  if (supabase === undefined) delete process.env.SUPABASE_AUTH_LOGIN;
  else process.env.SUPABASE_AUTH_LOGIN = supabase;
  if (bcrypt === undefined) delete process.env.AUTH_BCRYPT_FALLBACK;
  else process.env.AUTH_BCRYPT_FALLBACK = bcrypt;
}

/* --- 1. Supabase girişi kapalı → bcrypt tek yol, KAPATILAMAZ ---------- */

for (const b of [undefined, "", "0", "off", "false", "hayır"]) {
  kur(undefined, b);
  check(isBcryptFallbackEnabled(), `Supabase girişi kapalıyken bcrypt açık (AUTH_BCRYPT_FALLBACK=${b ?? "yok"})`);
}
kur("0", "0");
check(isBcryptFallbackEnabled(), "SUPABASE_AUTH_LOGIN=0 da 'kapalı' sayılıyor → bcrypt açık");

/* --- 2. Supabase girişi açık → bcrypt varsayılan KAPALI --------------- */

for (const s of ["1", "true", "on", "yes", "TRUE", " 1 "]) {
  kur(s, undefined);
  check(isSupabaseLoginEnabled(), `SUPABASE_AUTH_LOGIN=${JSON.stringify(s)} açık sayılıyor`);
  check(!isBcryptFallbackEnabled(), `Supabase açıkken bcrypt varsayılan KAPALI (${JSON.stringify(s)})`);
}

/* --- 3. Acil durum anahtarı yedeği geri açıyor ------------------------ */

for (const b of ["1", "true", "on", "yes", "ON"]) {
  kur("1", b);
  check(isBcryptFallbackEnabled(), `AUTH_BCRYPT_FALLBACK=${JSON.stringify(b)} yedeği geri açıyor`);
}
for (const b of ["", "0", "off", "false", "belki", "2"]) {
  kur("1", b);
  check(!isBcryptFallbackEnabled(), `AUTH_BCRYPT_FALLBACK=${JSON.stringify(b)} yedeği AÇMIYOR (kazara açılma yok)`);
}

/* --- 4. Yalnız iki durumda kapalı: bilerek kapatıldığında ------------- */
/*
 * Tablonun tamamı. "Kapalı" hücresi TEK: Supabase açık + yedek istenmemiş.
 */
const tablo: Array<[string | undefined, string | undefined, boolean]> = [
  [undefined, undefined, true],
  [undefined, "1", true],
  ["1", undefined, false],
  ["1", "1", true],
];
for (const [s, b, beklenen] of tablo) {
  kur(s, b);
  check(isBcryptFallbackEnabled() === beklenen,
    `tablo: SUPABASE_AUTH_LOGIN=${s ?? "yok"} + AUTH_BCRYPT_FALLBACK=${b ?? "yok"} → ${beklenen ? "açık" : "kapalı"}`);
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
