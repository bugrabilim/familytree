/**
 * HESABIN KİMLİK E-POSTASI (Supabase Faz 3e, madde 42).
 *
 * ## Neden yeni bir alan — `notifyEmail` neden kullanılmıyor
 *
 * Hesapta zaten bir `notifyEmail` var ama o BAŞKA bir şey: kullanıcının açık
 * onayıyla verdiği bir BİLDİRİM adresi. Yanlış yazılmışsa bedeli bir
 * hatırlatmanın yanlış kutuya düşmesidir.
 *
 * Kimlik e-postası ise hesabı GERİ ALMANIN yolu olacak (madde 51). Yanlış ya
 * da başkasına ait bir adres burada, hesabın kendisini kaybetmek demek. İki
 * alanın güven eşiği aynı olmadığı için tek alana indirmedik: mevcut
 * `notifyEmail` değerlerini kimlik e-postasına terfi ettirmek, doğrulanmamış
 * yüzlerce adresi bir anda kurtarma yoluna açmak olurdu.
 *
 * ## Tek kural
 *
 * **Doğrulanmamış e-posta hiçbir zaman kurtarma yolu değildir.** Bağlama
 * (kullanıcının adresi yazması) ile doğrulama (adresin gerçekten ona ait
 * olduğunun kanıtlanması) ayrı iki adım; ikincisi olmadan birincisi yalnız
 * bir niyet beyanıdır.
 *
 * Bundan çıkan ikinci kural: **adres değişirse doğrulama sıfırlanır.** Yoksa
 * kullanıcı kendi adresini doğrulayıp sonra başkasınınkiyle değiştirerek
 * doğrulanmış bir yabancı adres elde ederdi.
 *
 * Saf ve bağımlılıksız — birim testi koşulabilsin.
 */

/**
 * Sentetik iç e-posta alan adı. `lib/auth-users.ts`teki `authEmailForAccount`
 * bu adı kullanıyor; burada yalnız TANIMAK için gerekiyor (bu dosya
 * bağımlılıksız kalsın diye kopyalanmadı, örüntüyle tanınıyor).
 */
export const SYNTHETIC_LOCAL_IS_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@/i;

/**
 * Sentetik (iç) adres mi?
 *
 * GoTrue e-posta zorunlu tuttuğu için her hesaba `<accountId>@…` verildi. O
 * adres KULLANICIYA AİT DEĞİL: kimse oraya posta alamaz, dolayısıyla asla
 * doğrulanmış sayılamaz ve asla kurtarma yolu olamaz.
 */
export function isSyntheticEmail(email: string): boolean {
  return SYNTHETIC_LOCAL_IS_UUID.test(email.trim());
}

/**
 * Karşılaştırma/saklama için normalleştirir. Geçersizse `null`.
 *
 * Tamamı küçük harfe iniyor — yerel kısım teknik olarak büyük/küçük harf
 * duyarlı olabilir ama pratikte hiçbir yaygın sağlayıcı öyle davranmıyor ve
 * "Ali@x.com" ile "ali@x.com"u iki ayrı hesap saymak, kullanıcıyı kendi
 * adresinden kilitlemenin en kolay yolu olurdu.
 *
 * Türkçe klavye tuzağı: `toLowerCase()` yerine `toLocaleLowerCase("en")`
 * kullanılıyor. Türkçe yerelde "I" → "ı" olur ve "ALI@x.com" adresi
 * "alı@x.com"a dönüp hiçbir zaman eşleşmezdi.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLocaleLowerCase("en");
  if (!s || s.length > 254) return null;
  // Tek @, iki yanı dolu, alan adında en az bir nokta, boşluk yok.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  if (s.includes("..")) return null;
  return s;
}

export interface AccountEmailState {
  /** Bağlanmış adres (normalleştirilmiş). Yoksa boş. */
  authEmail?: string;
  /** Adresin sahipliği KANITLANDI mı? */
  authEmailVerified?: boolean;
}

/**
 * Bu hesap e-postayla kurtarılabilir mi?
 *
 * Üç koşul da şart: adres var, DOĞRULANMIŞ ve sentetik değil. Madde 51
 * (e-postayla şifre sıfırlama) bu işlevi tek kapı olarak kullanacak — kural
 * tek yerde dursun ki bir çağıran onu atlayamasın.
 */
export function canRecoverByEmail(a: AccountEmailState): boolean {
  const e = a.authEmail?.trim();
  if (!e) return false;
  if (!a.authEmailVerified) return false;
  if (isSyntheticEmail(e)) return false;
  return true;
}

export type EmailChange =
  | { kind: "gecersiz" }
  | { kind: "degismedi"; email: string; verified: boolean }
  | { kind: "temizle" }
  | { kind: "ayarla"; email: string };

/**
 * Gelen değerin ne anlama geldiğini söyler — rota bunu uygular.
 *
 * `""`/`null` TEMİZLER (deponun her yerindeki kural), `undefined` dokunmaz.
 * Aynı adres yeniden gönderilirse doğrulama durumu KORUNUR: kullanıcının
 * formu yeniden kaydetmesi, doğrulanmış adresini doğrulanmamışa düşürmemeli.
 */
export function planEmailChange(
  current: AccountEmailState,
  incoming: unknown
): EmailChange {
  if (incoming === undefined) {
    const e = current.authEmail?.trim() ?? "";
    return e
      ? { kind: "degismedi", email: e, verified: !!current.authEmailVerified }
      : { kind: "temizle" };
  }
  if (incoming === null || incoming === "") return { kind: "temizle" };

  const e = normalizeEmail(incoming);
  if (!e) return { kind: "gecersiz" };
  /*
   * Sentetik adresi KULLANICI YAZAMAZ. Yazabilseydi, başka bir hesabın iç
   * adresini kendi hesabına bağlayıp Supabase tarafında çakışma (ya da daha
   * kötüsü, o hesabın kurtarma yolunu ele geçirme) denemesi mümkün olurdu.
   */
  if (isSyntheticEmail(e)) return { kind: "gecersiz" };

  const eski = current.authEmail?.trim() ?? "";
  if (eski && eski === e) {
    return { kind: "degismedi", email: e, verified: !!current.authEmailVerified };
  }
  return { kind: "ayarla", email: e };
}

/**
 * Değişiklikten sonraki durum. `ayarla` her zaman doğrulamayı SIFIRLAR.
 *
 * Bu, dosyadaki ikinci kuralın kodu: kullanıcı kendi adresini doğrulayıp
 * sonra başkasınınkiyle değiştirerek "doğrulanmış" bir yabancı adres elde
 * edememeli.
 */
export function applyEmailChange(change: EmailChange): AccountEmailState | null {
  switch (change.kind) {
    case "gecersiz":
      return null;
    case "temizle":
      return { authEmail: "", authEmailVerified: false };
    case "degismedi":
      return { authEmail: change.email, authEmailVerified: change.verified };
    case "ayarla":
      return { authEmail: change.email, authEmailVerified: false };
  }
}

/**
 * Aynı adres başka bir hesapta bağlı mı?
 *
 * DOĞRULANMIŞ bir adres tekildir; doğrulanmamışlar çakışabilir çünkü bunlar
 * henüz yalnız birer niyet beyanı — birinin yanlışlıkla yazdığı adres,
 * gerçek sahibinin sonradan doğrulamasını engellememeli. Doğrulama anında
 * tekillik yeniden denetlenir (`verifyWouldCollide`).
 */
export function emailTakenBy(
  email: string,
  accounts: ReadonlyArray<{ id: string } & AccountEmailState>,
  exceptAccountId: string
): string | null {
  const e = normalizeEmail(email);
  if (!e) return null;
  for (const a of accounts) {
    if (a.id === exceptAccountId) continue;
    if (!a.authEmailVerified) continue;
    if ((a.authEmail ?? "").trim() === e) return a.id;
  }
  return null;
}

/** Doğrulama anında çakışma var mı? (tekillik burada zorlanır) */
export function verifyWouldCollide(
  email: string,
  accounts: ReadonlyArray<{ id: string } & AccountEmailState>,
  accountId: string
): boolean {
  return emailTakenBy(email, accounts, accountId) !== null;
}
