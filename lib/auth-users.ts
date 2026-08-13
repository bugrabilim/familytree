import "server-only";
import { isSupabaseConfigured, supabaseAdmin, supabaseAuthClient } from "@/lib/supabase";

/**
 * Supabase Auth kullanıcı katmanı — Faz 3b.
 *
 * Amaç: mevcut founder hesaplarını, GİRİŞ AKIŞINA HİÇ DOKUNMADAN, arka planda
 * Supabase Auth'a taşımak. Bu dosyadaki hiçbir çağrı giriş başarısını
 * etkilemez; yalnız yönetici göç aracından (best-effort) çağrılır.
 *
 * Anahtar fikir — DÜZ-METİN ŞİFREYE GEREK YOK: hesabın mevcut bcrypt hash'i
 * `password_hash` alanıyla içe aktarılır (GoTrue bcrypt/scrypt/argon2
 * destekler), böylece kullanıcı sonradan aynı şifreyle Supabase üzerinden
 * giriş yapabilir. Auth kullanıcısının id'si, mümkünse accountId'ye eşitlenir
 * (accountId zaten bir UUID) → `auth.users.id === accounts.id === treeId`
 * (kayıpsız kimlik).
 */

/**
 * Sentetik iç e-posta alan adı. Bu adreslere ASLA e-posta gönderilmez
 * (kullanıcılar `email_confirm: true` ile onaylı oluşturulur); adres yalnız
 * GoTrue'nun zorunlu tuttuğu benzersiz anahtar içindir. Kullanıcı ileride
 * gerçek e-postasını bağlayınca (Faz 3e) bu adres onunla değiştirilir.
 * Gerektiğinde `AUTH_INTERNAL_EMAIL_DOMAIN` ile geçersiz kılınabilir.
 */
const INTERNAL_EMAIL_DOMAIN =
  process.env.AUTH_INTERNAL_EMAIL_DOMAIN?.trim() || "hesap.soyagaci.local";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Değer RFC-4122 biçiminde bir UUID mi? */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** accountId → sentetik iç e-posta (deterministik, benzersiz, küçük harf). */
export function authEmailForAccount(accountId: string): string {
  return `${accountId.toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
}

export type AuthImportResult = "created" | "exists" | "skipped" | { error: string };

/** Hata mesajı/kodu "zaten var" anlamına mı geliyor? (idempotent yeniden çalıştırma) */
function isAlreadyExists(error: { message?: string; code?: string; status?: number }): boolean {
  const msg = (error.message || "").toLowerCase();
  const code = (error.code || "").toLowerCase();
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    code === "phone_exists" ||
    msg.includes("already been registered") ||
    msg.includes("already registered") ||
    msg.includes("already exists") ||
    msg.includes("duplicate")
  );
}

/**
 * Mevcut bir founder hesabını Supabase Auth'a aktarır (idempotent).
 *
 * Hata FIRLATMAZ — sonucu yapı olarak döndürür; çağıran taraf (göç aracı)
 * özetler. Zaten varsa `"exists"` döner. Giriş akışını etkilemez.
 */
export async function importAccountToAuth(account: {
  id: string;
  familyName: string;
  passwordHash: string;
}): Promise<AuthImportResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase yapılandırılmamış" };
  if (!account.passwordHash) return "skipped"; // içe aktarılacak şifre yok

  const email = authEmailForAccount(account.id);
  const base = {
    email,
    password_hash: account.passwordHash,
    email_confirm: true as const,
    user_metadata: { accountId: account.id, familyName: account.familyName },
  };
  // accountId bir UUID ise auth kullanıcı id'sini ona eşitle (temiz 1:1 eşleme).
  const attrs = isUuid(account.id) ? { ...base, id: account.id } : base;

  try {
    const { error } = await supabaseAdmin().auth.admin.createUser(attrs);
    if (!error) return "created";
    if (isAlreadyExists(error)) return "exists";
    return { error: error.message };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Bu accountId için Supabase Auth kullanıcısı var mı? (best-effort, göç
 * önizlemesinde ilerlemeyi göstermek için). Belirsizse `null` döner.
 */
export async function authUserExists(accountId: string): Promise<boolean | null> {
  if (!isSupabaseConfigured() || !isUuid(accountId)) return null;
  try {
    const { data, error } = await supabaseAdmin().auth.admin.getUserById(accountId);
    if (error) return null;
    return !!data?.user;
  } catch {
    return null;
  }
}

/* ── Faz 3c — giriş doğrulamasını Supabase Auth'a çevir (bcrypt yedekli) ─────── */

/**
 * 3c bayrağı: giriş doğrulaması Supabase Auth'u DENESİN mi?
 *
 * Varsayılan KAPALI → davranış bugünküyle bire bir aynı (sıfır ek gecikme).
 * `SUPABASE_AUTH_LOGIN=1` yapıldığında (Email sağlayıcısı açık + hesaplar
 * içe aktarılmışken) giriş önce Supabase'i dener, başarısızsa bcrypt'e düşer.
 * İstediğin an değişkeni kaldırarak anında geri alınır.
 */
export function isSupabaseLoginEnabled(): boolean {
  const v = (process.env.SUPABASE_AUTH_LOGIN || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

const VERIFY_TIMEOUT_MS = 5000;

/**
 * Şifreyi Supabase Auth ile doğrular.
 *
 * SADECE `true` bir şey ifade eder: Supabase temiz bir oturum açtı → doğrulandı.
 * `false` TEK BAŞINA reddetme gerekçesi DEĞİLDİR — çağıran taraf mevcut bcrypt
 * yoluna düşmelidir (kullanıcı henüz içe aktarılmamış, Email sağlayıcısı kapalı,
 * ağ/zaman aşımı, vb. hepsi `false` döner). Hata fırlatmaz; oturum saklamaz.
 */
export async function supabaseVerifyPassword(email: string, password: string): Promise<boolean> {
  const client = supabaseAuthClient();
  if (!client) return false;
  try {
    const signIn = client.auth.signInWithPassword({ email, password });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), VERIFY_TIMEOUT_MS));
    const res = await Promise.race([signIn, timeout]);
    if (!res) return false; // zaman aşımı → bcrypt'e düş
    const { data, error } = res;
    if (error || !data?.session) return false;
    // Sunucuda oturum tutmuyoruz (persistSession:false) — yine de nazikçe kapat.
    try {
      await client.auth.signOut();
    } catch {
      /* önemsiz */
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Founder'ın Supabase Auth şifresini DÜZ-METİNLE günceller (parola sıfırlama
 * sonrası senkron). Böylece sıfırlanmış eski şifre Supabase üzerinden kabul
 * edilemez. Best-effort — hata fırlatır, çağıran best-effort sarar.
 */
export async function updateAccountAuthPassword(accountId: string, newPassword: string): Promise<void> {
  if (!isSupabaseConfigured() || !isUuid(accountId) || !newPassword) return;
  const { error } = await supabaseAdmin().auth.admin.updateUserById(accountId, { password: newPassword });
  if (error) throw new Error(error.message);
}
