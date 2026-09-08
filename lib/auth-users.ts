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

/* ── Giriş yolu bayrakları — `lib/auth-flags.ts`te (test edilebilsinler diye).
 *    Mevcut çağıranlar bozulmasın diye buradan yeniden dışa veriliyor. ──── */
export { isBcryptFallbackEnabled, isSupabaseLoginEnabled } from "@/lib/auth-flags";

const VERIFY_TIMEOUT_MS = 5000;

/**
 * Şifreyi Supabase Auth ile doğrular.
 *
 * SADECE `true` bir şey ifade eder: Supabase temiz bir oturum açtı → doğrulandı.
 * `false` TEK BAŞINA reddetme gerekçesi DEĞİLDİR — çağıran taraf mevcut bcrypt
 * yoluna düşmelidir (kullanıcı henüz içe aktarılmamış, Email sağlayıcısı kapalı,
 * ağ/zaman aşımı, vb. hepsi `false` döner). Hata fırlatmaz; oturum saklamaz.
 */
export async function supabaseVerifyPassword(
  email: string,
  password: string,
  /**
   * Beklenen `auth.users.id` — verildiğinde oturumun GERÇEKTEN bu hesaba ait
   * olduğu doğrulanır.
   *
   * Adres artık hesaba göre çözülüyor (kurucu gerçek e-postasını
   * bağlayabiliyor, `confirmAccountAuthEmail`), yani "şu adresle girilebildi"
   * ile "şu HESABA girildi" aynı şey değil. Denetim olmasaydı, bir hesabın
   * kaydındaki adres başka bir hesabın Auth adresiyle çakıştığında o
   * hesabın oturumu açılabilirdi — `users.json` doğrulanmamış adreste
   * tekilliği zorlamıyor (`app/api/account/email/route.ts`).
   */
  expectedUserId?: string
): Promise<boolean> {
  const client = supabaseAuthClient();
  if (!client) return false;
  try {
    const signIn = client.auth.signInWithPassword({ email, password });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), VERIFY_TIMEOUT_MS));
    const res = await Promise.race([signIn, timeout]);
    if (!res) return false; // zaman aşımı
    const { data, error } = res;
    if (error || !data?.session) return false;
    if (expectedUserId && data.user?.id !== expectedUserId) {
      try {
        await client.auth.signOut();
      } catch {
        /* önemsiz */
      }
      return false;
    }
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

/** `syncAccountAuthPassword` sonucu — hangi yoldan yazıldığını söyler. */
export type AuthPasswordSync = "guncellendi" | "onarildi" | "atlandi";

/**
 * Şifre sıfırlamayı Supabase Auth'a YAZAR ve yazdığını KANITLAR (Faz 4/1a).
 *
 * ## Neden eski best-effort senkron yetmiyordu
 *
 * Kaldırılan `updateAccountAuthPassword` best-effort çağrılıyordu ve gerekçesi
 * hep aynıydı: "bcrypt zaten
 * güncellendi". Yani senkronun ağı bcrypt'ti. Bcrypt yedeği kalkınca o ağ
 * yok — ama asıl mesele, ağın BUGÜN de delik olması:
 *
 * `SUPABASE_AUTH_LOGIN` açıkken giriş ÖNCE Supabase'i deniyor. Senkron
 * sessizce düşerse Auth'ta ESKİ şifre kalır ve o eski şifreyle giriş
 * yapılmaya devam edilir — sıfırlama kullanıcıya "başarılı" dendiği hâlde
 * saldırganı dışarı atmamış olur. Sıfırlamanın tek anlamı buydu.
 *
 * Bu yüzden çağıran taraf artık şunu yapıyor: ÖNCE burası, SONRA yerel
 * yazma. Burası fırlatırsa yerelde hiçbir şey değişmemiş olur — kullanıcı
 * eski şifresiyle kalır ve yeniden dener. Yarım bir sıfırlama yerine hiç
 * yapılmamış bir sıfırlama; ikisi arasında seçim yapılıyorsa doğrusu bu.
 *
 * ## Onarım yolu
 *
 * Auth kullanıcısı hiç oluşmamış olabilir: kayıt sırasındaki içe aktarma
 * best-effort ve sessizce düşebiliyor (`createUser`). O hesabın sıfırlaması
 * "kullanıcı yok" diye kalıcı olarak reddedilseydi, bir kere düşmüş bir
 * içe aktarma hesabı sonsuza dek sıfırlanamaz yapardı. Bulunamazsa YENİ
 * hash'le oluşturuyoruz → `"onarildi"`.
 *
 * "Zaten var" yanıtı ONARIM SAYILMAZ ve fırlatır: id ile güncelleme
 * düştüğü hâlde e-posta çakışıyorsa, kayıt BAŞKA bir id altında demektir ve
 * o kaydın şifresini yazdığımızı kanıtlayamayız. Kanıtlayamadığımız şeye
 * "senkron oldu" diyemeyiz.
 *
 * Supabase yapılandırılmamışsa ya da kimlik UUID değilse (demo) `"atlandi"`
 * döner — o kurulumlarda Auth kullanıcısı hiç yaratılmıyor, olmayan bir
 * kaydı bekleyip sıfırlamayı engellemek kendi kendine kesinti olurdu.
 */
export async function syncAccountAuthPassword(
  account: { id: string; familyName: string; passwordHash: string },
  newPassword: string
): Promise<AuthPasswordSync> {
  if (!isSupabaseConfigured() || !isUuid(account.id)) return "atlandi";
  if (!newPassword) throw new Error("Yeni şifre boş");

  const { error } = await supabaseAdmin().auth.admin.updateUserById(account.id, {
    password: newPassword,
  });
  if (!error) return "guncellendi";

  const msg = (error.message || "").toLowerCase();
  const yok = msg.includes("not found") || error.status === 404;
  if (!yok) throw new Error(error.message);

  const r = await importAccountToAuth(account);
  if (r === "created") return "onarildi";
  if (r === "exists") {
    throw new Error(
      "Auth kaydı bu kimlikle bulunamadı ama e-posta başka bir kayıtta kullanılıyor — şifre yazıldığı kanıtlanamıyor"
    );
  }
  throw new Error(typeof r === "string" ? `Auth kaydı oluşturulamadı (${r})` : r.error);
}

/**
 * Hesabı SENTETİK iç adresine döndürür (kullanıcı bağladığı e-postayı
 * kaldırdığında).
 *
 * ## Neden "adresi yaz" işlevi kaldırıldı
 *
 * Eskiden bu işlev herhangi bir adresi yazabiliyordu ve bağlama akışı, adres
 * daha BİZDE DOĞRULANMADAN onu Auth'a yazıyordu — `email_confirm` bilerek
 * verilmeden, yani Auth'ta doğrulanmamış olarak. Gerekçe sağlamdı
 * (doğrulanmamış adres kurtarma yolu değildir), ama bedeli görülmemişti:
 *
 * Doğrulanmamış adres, Auth'ta o hesabın GİRİŞ adresi hâline geliyordu.
 * Proje e-posta onayını zorunlu tuttuğunda böyle bir kullanıcı giriş
 * yapamaz; bcrypt yedeği kalkınca (Faz 4/1b) bu doğrudan KİLİTLENME
 * demektir — üstelik kullanıcının hiçbir hata yapmadığı bir akışta,
 * doğrulama postası eline geçmezse kalıcı olarak.
 *
 * Çözüm, kuralı esnetmek değil, yazmayı ERTELEMEK: bağlama artık Auth'a hiç
 * dokunmuyor. Adres Auth'a yalnız BİZDE doğrulandıktan sonra ve
 * `email_confirm: true` ile yazılıyor (`confirmAccountAuthEmail`). Böylece
 * "doğrulanmamış adresi doğrulanmış gösterme" kuralı da korunuyor, çünkü
 * doğrulanmamış adres Auth'a hiç girmiyor.
 *
 * ## Neden burada `email_confirm: true` VAR
 *
 * Sentetik adres bizim ürettiğimiz, posta kutusu olmayan bir anahtar
 * (`importAccountToAuth` da onu onaylı oluşturuyor). Onaysız yazsaydık
 * e-postasını KALDIRAN kullanıcı kendini dışarı kilitleyebilirdi — kaldırma
 * işleminin böyle bir yetkisi yok.
 */
export async function resetAccountAuthEmail(accountId: string): Promise<void> {
  if (!isSupabaseConfigured() || !isUuid(accountId)) return;
  const { error } = await supabaseAdmin().auth.admin.updateUserById(accountId, {
    email: authEmailForAccount(accountId),
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
}

/**
 * Doğrulama bizde tamamlandığında Supabase tarafını da doğrulanmış işaretler.
 *
 * Ayrı bir işlev olması şart: "adresi yaz" ile "adresi doğrulanmış say" iki
 * farklı yetki. Tek çağrıda birleştirilseydi her yazma sessizce bir doğrulama
 * olurdu.
 */
export async function confirmAccountAuthEmail(accountId: string, email: string): Promise<void> {
  if (!isSupabaseConfigured() || !isUuid(accountId) || !email.trim()) return;
  const { error } = await supabaseAdmin().auth.admin.updateUserById(accountId, {
    email: email.trim(),
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
}

/**
 * Supabase Auth kullanıcısını KALICI siler (hesap kalıcı silmenin parçası).
 *
 * Yapılandırma yoksa ya da kimlik UUID değilse (demo) sessizce çıkar: o
 * durumda zaten hiç kullanıcı oluşturulmamıştır (`importAccountToAuth` aynı
 * koşula bakıyor).
 *
 * Hata FIRLATIR: çağıran best-effort sarıp "silinemeyenler" listesine yazsın.
 * Artakalan bir Auth kullanıcısı tek başına giriş vermez (giriş `users.json`
 * satırını arıyor), ama yine de silinmemiş bir kayıttır ve görünmesi gerekir.
 */
export async function deleteAccountAuthUser(accountId: string): Promise<void> {
  if (!isSupabaseConfigured() || !isUuid(accountId)) return;
  const { error } = await supabaseAdmin().auth.admin.deleteUser(accountId);
  if (error) {
    // "Kullanıcı yok" bir hata değil: silme idempotent olmalı, yoksa ikinci
    // deneme (bir sonraki temizlik koşusu) sonsuza dek başarısız görünür.
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("not found") || error.status === 404) return;
    throw new Error(error.message);
  }
}

/**
 * Hesabın Auth'taki GÜNCEL e-postası — giriş bu adresi kullanmalı.
 *
 * ## Neden `authEmailForAccount` tek başına yetmiyor
 *
 * Sentetik adres yalnız BAŞLANGIÇ adresi. Kurucu gerçek e-postasını
 * bağladığında Auth kullanıcısının adresi onunla DEĞİŞTİRİLİYOR
 * (`confirmAccountAuthEmail`, Faz 3e). O andan sonra sentetik adres Auth'ta
 * kimseye ait değil, dolayısıyla onunla yapılan giriş denemesi başarısız.
 *
 * Bcrypt yedeği açıkken bu görünmezdi: giriş sessizce yedeğe düşüyor,
 * kullanıcı sorunsuz giriyordu. Yedek kalkınca (Faz 4/1b) aynı durum
 * KİLİTLENME oluyor — e-postasını bağlamış bir kurucu hesabına hiç
 * giremiyor. Faz 4'ün kaldırdığı ağın altından çıkan üçüncü hata bu.
 *
 * Adresi tahmin etmek yerine KİMLİKTEN çözüyoruz: `auth.users.id` zaten
 * accountId'ye eşit (`importAccountToAuth`), dolayısıyla tek ve kesin bir
 * kaynak var. Tahmin listesi denenebilirdi ama her aday ayrı bir giriş
 * denemesi demek — hem yavaş hem de yanlış hesaba girme riski açık.
 *
 * `null` döner: yapılandırma yok, kimlik UUID değil, kullanıcı yok ya da
 * arama düştü. Çağıran o durumda sentetik adrese düşer — arama düştü diye
 * girişi tümden kesmek, çözmeye çalıştığımız kilitlenmeyi geri getirirdi.
 */
export async function authEmailOfAccount(accountId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !isUuid(accountId)) return null;
  try {
    const { data, error } = await supabaseAdmin().auth.admin.getUserById(accountId);
    if (error) return null;
    return data?.user?.email?.trim() || null;
  } catch {
    return null;
  }
}

/* ── Faz 4 kapısı — SALT OKUMA envanteri ────────────────────────────────── */

/** `auth.users` satırının kapı için gereken üç alanı. */
export interface AuthUserOzeti {
  id: string;
  email: string | null;
  /** Hiç giriş yapılmamışsa `null` — Faz 4 kapısının aradığı asıl kanıt. */
  lastSignInAt: string | null;
}

/** Tek istekte çekilen kullanıcı sayısı ve en fazla kaç sayfa denenecek. */
const AUTH_PAGE = 200;
const AUTH_MAX_PAGES = 25;

/**
 * `auth.users` envanteri — Faz 4 kapısı için (`app/api/admin/phase4`).
 *
 * Neden `authUserExists` yetmiyor: (1) o işlev yalnız `getUserById` yapıyor
 * ve kimliği UUID OLMAYAN hesaplar (demo: `demo-hesap`) için hiç bakmadan
 * `null` dönüyor — oysa kapının cevaplaması gereken sorulardan biri tam da
 * demo hesabının Auth'ta olup olmadığı; (2) `last_sign_in_at`i hiç
 * getirmiyor, oysa "bu giriş yolu üretimde çalışıyor mu" sorusunun tek
 * kanıtı o alan.
 *
 * HATA FIRLATIR, boş liste DÖNMEZ. Bilerek: boş liste "Auth'ta kimse yok"
 * diye okunur ve kapı bunu "hiçbir hesap taşınmamış" sanır — ya da daha
 * kötüsü, ölçüm düştüğü hâlde bir sonuç üretmiş sayılır. Çağıran, hatayı
 * yakalayıp olguyu `olculemedi` işaretlemeli (`lib/phase4-readiness.ts`
 * başlığındaki "şüphede daima hazır değil" kuralı).
 *
 * Salt okuma: hiçbir kullanıcı oluşturmaz, güncellemez, silmez.
 */
export async function listAuthUsers(): Promise<AuthUserOzeti[]> {
  if (!isSupabaseConfigured()) throw new Error("Supabase yapılandırılmamış");
  const out: AuthUserOzeti[] = [];
  for (let page = 1; page <= AUTH_MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: AUTH_PAGE });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) {
      out.push({
        id: u.id,
        email: u.email ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
      });
    }
    if (users.length < AUTH_PAGE) return out;
  }
  /*
   * Sayfa sınırına DAYANDIK. Elimizdeki liste eksik olabilir ve eksik bir
   * envanterle "şu hesabın Auth kaydı yok" demek yanlış olur — bu yüzden
   * kısmi sonucu döndürmek yerine ölçümü düşmüş sayıyoruz.
   */
  throw new Error(`Auth kullanıcı listesi ${AUTH_MAX_PAGES} sayfada bitmedi — envanter eksik sayılıyor`);
}
