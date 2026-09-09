import { put, list, get } from "@vercel/blob";
import { hash as bcryptHash } from "bcryptjs";
import type { User, UsersData } from "@/types/user";
import { dbGetAccountRows, dbUpsertAccount, dbUpsertTree } from "@/lib/db";
import { importAccountToAuth, isUuid } from "@/lib/auth-users";
import { isSupabaseConfigured } from "@/lib/supabase";
import { pickUniqueRecoveryCode, timingSafeEqualHex } from "@/lib/recovery-code";
import { isSoftDeleted } from "@/lib/retention";
import { mutateStore, type Degistirici } from "@/lib/store-mutate";

const USERS_PATHNAME = "users.json";

/**
 * OKUNAMAYAN DOSYA, BOŞ DOSYA DEĞİLDİR — ve burası bu kuralın en pahalı yeri.
 *
 * `users.json` bütün hesapların kimliğini tutuyor. Geçici bir okuma
 * hatasında boş liste dönmek, çağıranların çoğu için "hiç hesap yok"
 * demekti; kayıt/güncelleme yolları listeyi okuyup üstüne yazdığı için de
 * bir sonraki yazma BÜTÜN HESAPLARI silerdi. Hata mesajı yok, uyarı yok.
 *
 * Kural: dosya GERÇEKTEN yoksa (`blobs.length === 0`) boş — ilk kurulumda
 * doğru olan bu. "Var ama okuyamadım" ise HATA ve yükselir: giriş 500
 * verir, ki şifreyi doğrulayamadığımızda söylenecek doğru şey de budur —
 * "böyle bir hesap yok" değil.
 */
export async function getUsersData(): Promise<UsersData> {
  const { blobs } = await list({ prefix: USERS_PATHNAME });
  if (blobs.length === 0) return { users: [], updatedAt: "" };
  const latest = blobs.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0];
  const result = await get(latest.pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200)
    throw new Error(`hesap kaydı okunamadı (HTTP ${result?.statusCode ?? "yanıt yok"})`);
  const kutu = (await new Response(result.stream).json()) as Partial<UsersData>;
  // Damga eski dosyalarda yok; `""` tutarlı bir başlangıç (bkz. `UsersData`).
  return { users: kutu.users ?? [], updatedAt: kutu.updatedAt ?? "" };
}

async function saveUsersData(data: UsersData): Promise<void> {
  // Her yazma damgayı ileri alır; koruma bunu karşılaştırıyor.
  data.updatedAt = new Date().toISOString();
  await put(USERS_PATHNAME, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });

  /*
   * AYNA BURADA — sekiz yazma yolunun her birinde değil.
   *
   * Önce `createUser` ve iki şifre yolu kendi `dbUpsertAccount` /
   * `dbUpdateAccountPassword` çağrısını taşıyordu; kalan BEŞ yazma yolu
   * (bildirim tercihi, kimlik e-postası, sıfırlama jetonu, silme damgası,
   * satır silme) aynaya hiç dokunmuyordu. Yani ayna, Faz 4 parça 2'nin
   * dayanacağı kaynak olmasına rağmen sessizce eskiyordu.
   *
   * Depoya yazan tek nokta burası (`tests/users-store-gate.test.mts` doğrudan
   * `saveUsersData` çağrısı kalmadığını kilitliyor), dolayısıyla aynayı
   * burada tutmak onu UNUTULAMAZ yapıyor — bugünün tekrar eden hatası olan
   * "kuralı kopyala" deseninin tersi.
   *
   * TAMAMI yazılıyor, yalnız değişen satır değil: kimlik yazmaları seyrek
   * (kayıt, şifre sıfırlama, tercih, silme) ve hesap sayısı küçük. Bedeli
   * karşılığında ayna kendi kendini onarıyor — kayma denetiminin var olma
   * sebebi tam da aynaların sessizce eskimesiydi.
   *
   * BEST-EFFORT: Blob asıl kaynak. Ayna yazılamazsa kimlik işlemi
   * başarısız SAYILMAZ; parça 2'ye geçmeden önce kayma denetimi zaten
   * çalıştırılacak (`GET /api/admin/drift`).
   */
  for (const u of data.users) {
    try {
      await dbUpsertAccount(u);
    } catch (e) {
      console.warn(`[cift-yazma] account→postgres (${u.id}):`, (e as Error).message);
    }
  }
}

/**
 * `users.json` üzerindeki her yazma BURADAN geçer — kayıp yazma koruması.
 *
 * Gerekçe `lib/store-mutate.ts` başında ve `UsersData.updatedAt`ta. Kısaca:
 * sekiz ayrı yazma yolu dosyayı okuyup tamamını geri yazıyordu, araya giren
 * ikinci bir yazma birincinin satırını siliyordu ve kimse fark etmiyordu.
 *
 * `mutateStore` yazmadan HEMEN ÖNCE yeniden okuyup damgayı karşılaştırıyor;
 * değiştiyse işlem baştan alınıyor. Pencereyi kapatmıyor, daraltıyor —
 * kapatan tek şey koşullu yazma olurdu ve Blob'da o yok.
 *
 * DIŞ ETKİLER GÖVDEYE GİRMEZ: Postgres aynası, Supabase Auth ve önbellek
 * temizliği çağıranda, mutasyon bittikten SONRA kalıyor. Gövde yeniden
 * çalıştırılabildiği için içeride olsalardı çakışmada iki kez koşarlardı.
 */
function mutateUsers<T>(degistir: Degistirici<UsersData, T>, etiket = "hesap"): Promise<T> {
  return mutateStore(getUsersData, saveUsersData, degistir, etiket);
}

/**
 * `createUser`ın ad çakışmasında fırlattığı işaret.
 *
 * Kullanıcıya gösterilecek metin DEĞİL: mesajı rotalar kendi diliyle
 * veriyor. Kitaplığın kullanıcı metni üretmesi, aynı cümlenin iki yerde
 * ayrışması demek olurdu.
 */
export const AD_DOLU = "ad-dolu";

/**
 * Hesabı kimliğinden bulur.
 *
 * Katkı akışı için gerekli: kurucunun kimliği ağacın kimliğidir ve üye
 * listesinde tutulmaz, dolayısıyla adı ancak buradan çözülebiliyor.
 */
/**
 * KİMLİK OKUMALARININ KAYNAĞI — Faz 4 / 2b-2.
 *
 * Okuma artık Postgres aynasından; Blob geri düşüş. Yazma yolu DEĞİŞMEDİ:
 * `mutateUsers` hâlâ Blob'u oku-değiştir-yaz yapıyor ve kayıp yazma koruması
 * Blob'un kendi damgasına dayanıyor. İkisini birlikte çevirmek, kilidin
 * dayanağını da değiştirmek olurdu; okuma ile yazmanın ayrı adımlar olması
 * bilerek.
 *
 * ## Neden geri düşüş "satır yok"la sınırlı değil
 *
 * Aynaya HİÇ ULAŞILAMADIĞINDA ve ayna BOŞ olduğunda da Blob'a düşülüyor.
 * Boş bir ayna "hiç hesap yok" diye okunsaydı her giriş "böyle bir ağaç
 * yok" derdi — depodaki "boş liste temiz sayılmaz" kuralının aynısı.
 *
 * Şifre özeti boş bir satır da güvenilmez sayılıyor: yarım yazılmış bir
 * satırla giriş doğrulamak, doğrulamamak demek.
 *
 * ## Acil durum anahtarı
 *
 * `IDENTITY_READ_BLOB=1` okumayı Blob'a geri alır. Bayrak varsayılan
 * DEĞERİ yeni davranış, çünkü kapatılmayan bir bayrak koruma değil süstür
 * (`AUTH_BCRYPT_FALLBACK` ile aynı kalıp).
 */
function blobKimlikZorlandiMi(): boolean {
  const v = (process.env.IDENTITY_READ_BLOB || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Kimlik satırları — ayna öncelikli, Blob geri düşüşlü. */
async function kimlikSatirlari(): Promise<User[]> {
  if (!blobKimlikZorlandiMi()) {
    try {
      const rows = await dbGetAccountRows();
      // Boş ayna ya da yarım satır → aynaya güvenme.
      if (rows.length > 0 && rows.every((u) => u.passwordHash)) return rows;
    } catch (e) {
      console.warn("[kimlik] ayna okunamadı, Blob'a düşülüyor:", (e as Error).message);
    }
  }
  return (await getUsersData()).users;
}

export async function findUserById(id: string): Promise<User | null> {
  const users = await kimlikSatirlari();
  return users.find((u) => u.id === id) ?? null;
}

export async function findUserByFamilyName(familyName: string): Promise<User | null> {
  const users = await kimlikSatirlari();
  return users.find((u) => u.familyName.toLowerCase() === familyName.toLowerCase()) ?? null;
}

/**
 * Hesabı KURTARMA KODUNUN İNDEKSİNDEN bulur — ağaç adı sormadan.
 *
 * Kod benzersiz olduğu için hesabı tek başına gösterebiliyor; ağaç adı
 * sormanın tek sebebi bcrypt'in aranamamasıydı (`lib/recovery-code.ts`).
 * Burada bulunan satır DOĞRULANMIŞ sayılmaz: çağıran ayrıca bcrypt
 * karşılaştırmasını yapmak zorunda.
 *
 * Karşılaştırma sabit süreli ve eşleşme bulununca döngü KIRILMIYOR: erken
 * çıkış, yanıt süresinden indeksin listede nerede durduğunu sızdırırdı.
 */
export async function findUserByRecoveryIndex(index: string): Promise<User | null> {
  if (!index) return null;
  const users = await kimlikSatirlari();
  let bulunan: User | null = null;
  for (const u of users) {
    if (u.recoveryCodeIndex && timingSafeEqualHex(u.recoveryCodeIndex, index)) bulunan = u;
  }
  return bulunan;
}

/**
 * Yeni bir kurtarma kodu üretir: düz kod (kullanıcıya bir kez gösterilir),
 * bcrypt hash'i ve arama indeksi.
 *
 * Üretim TEK YERDE: web kaydı, mobil kayıt ve sıfırlama sonrası yenileme aynı
 * işlevi çağırıyor. Kopyalanmış olsaydı benzersizlik denetiminin bir kopyada
 * unutulması sessizce iki hesaba aynı kodu verirdi.
 *
 * Benzersizlik depodaki indekslere bakılarak denetleniyor. İki kayıt aynı anda
 * yarışırsa denetim boşa düşebilir; ayrı bir kilit YOK, çünkü çakışma ihtimali
 * 2^80'de bir mertebesinde ve kilidin bedeli her kayıtta fazladan bir yazma
 * turu olurdu.
 */
export async function issueRecoveryCode(): Promise<{ code: string; hash: string; index: string }> {
  let kullanilan: ReadonlySet<string>;
  try {
    const { users } = await getUsersData();
    kullanilan = new Set(users.map((u) => u.recoveryCodeIndex).filter((x): x is string => !!x));
  } catch {
    /*
     * Depo okunamadı. Boş kümeyle devam etmek "benzersizlik denetimi
     * yapılmadı" demek olurdu; çağıran bunu bilsin diye hata yükseliyor.
     */
    throw new Error("Kurtarma kodu üretilemedi: hesap listesi okunamadı.");
  }
  const { code, index } = pickUniqueRecoveryCode(kullanilan);
  return { code, index, hash: await bcryptHash(code, 10) };
}

/**
 * Hesabı açar.
 *
 * `recoveryCodeIndex` ZORUNLU. Eskiden isteğe bağlıydı ve tek sebebi demo
 * hesabıydı: kurtarma kodu kimsede olmadığı için indekslenmesinin anlamı
 * yoktu. Demo artık kimlik deposuna hiç yazılmıyor (bir hesap değil, bir
 * vitrin — `lib/demo-account.ts`), dolayısıyla bu gevşekliğin bir çağıranı
 * kalmadı. Zorunlu olması bir korumadır: indekssiz açılan bir hesap kendi
 * kurtarma koduyla BULUNAMAZ (`findUserByRecoveryIndex`), yani sahibi
 * şifresini unuttuğunda elindeki kod işe yaramaz — ve bu, ancak kod
 * kullanılmaya çalışıldığında, aylar sonra fark edilirdi.
 *
 * Alanın kendisi `User` tipinde isteğe bağlı KALIYOR: indeks düzeninden önce
 * açılmış hesaplarda yok (`tests/recovery-gate.test.mts`).
 */
export async function createUser(
  id: string,
  familyName: string,
  passwordHash: string,
  recoveryCodeHash: string,
  recoveryCodeIndex: string
): Promise<User> {
  const user: User = {
    id,
    familyName,
    passwordHash,
    recoveryCodeHash,
    ...(recoveryCodeIndex ? { recoveryCodeIndex } : {}),
    createdAt: new Date().toISOString(),
  };
  /*
   * KİMLİK ÖNCE AUTH'A, SONRA users.json'a — ve artık best-effort DEĞİL.
   *
   * Eskiden içe aktarma en sonda, try/catch içindeydi. Bcrypt yedeği varken
   * zararsızdı: Auth'a yazılamamış hesap yine bcrypt'le giriyordu. Faz 4'te
   * o yedek kalkıyor, dolayısıyla sessizce düşmüş TEK bir içe aktarma,
   * kullanıcının hiç giriş yapamadığı bir hesap demek — ve bu ancak
   * kullanıcı giriş denediğinde, gün(ler) sonra fark edilirdi.
   *
   * SIRA DA DEĞİŞTİ. Yazma users.json'dan sonra olsaydı ve içe aktarma
   * düşseydi, elde girilemeyen ama ADI TUTULMUŞ bir hesap satırı kalırdı:
   * kullanıcı yeniden kaydolmayı denediğinde "bu adla zaten bir hesap var"
   * yanıtını alırdı. Şimdi hata yerelde hiçbir iz bırakmadan dönüyor, ad
   * boşta kalıyor, kullanıcı yeniden deneyebiliyor.
   *
   * Supabase yapılandırılmamışsa (yerel geliştirme) ve demo gibi UUID
   * olmayan kimliklerde atlanıyor — o kurulumlarda Auth kullanıcısı zaten
   * hiç yaratılmıyor, olmayan bir kayda bakıp kaydı engellemek kendi kendine
   * kesinti olurdu.
   */
  if (isSupabaseConfigured() && isUuid(user.id)) {
    const r = await importAccountToAuth(user);
    if (r !== "created" && r !== "exists") {
      throw new Error(
        `Hesap kimliği Supabase Auth'a yazılamadı: ${typeof r === "string" ? r : r.error}`
      );
    }
  }

  /*
   * AD TEKİLLİĞİ ARTIK MUTASYONUN İÇİNDE.
   *
   * Denetim yalnız rotalarda (`findUserByFamilyName` → 409) duruyordu ve
   * okuma ile yazma arasında saniyeler vardı: iki kişi aynı adla aynı anda
   * kaydolduğunda ikisi de denetimi geçiyor, ikisi de yazıyordu. Sonuç ya
   * aynı adla iki hesap ya da birinin satırının silinmesiydi — ve giriş
   * `users.json`dan doğrulandığı için kaybeden hesaba bir daha hiç
   * girilemiyordu (kurtarma kodu verilmiş, Auth kaydı açılmış olmasına
   * rağmen).
   *
   * Rotadaki denetim KALIYOR: kullanıcıya doğru mesajı o veriyor. Burası
   * son savunma; yarışı yalnız burası kapatabilir, çünkü tek atomik
   * pencerede hem bakıp hem yazan tek yer burası.
   */
  await mutateUsers<true>((data) => {
    if (data.users.some((u) => u.familyName.toLowerCase() === familyName.toLowerCase()))
      throw new Error(AD_DOLU);
    data.users.push(user);
    return { yaz: true, sonuc: true };
  }, "hesap");
  // Faz 3 — çift-yazma (best-effort): hesabı Postgres'e de yaz. Giriş hâlâ
  // Blob'dan doğrulanıyor; hata giriş/kayıt akışını ETKİLEMEZ.
  /*
   * EV AĞACININ SATIRI DA BURADA AÇILIYOR — yoksa ayna o hesap için TAMAMEN
   * ölü kalıyordu.
   *
   * `people.tree_id` → `trees(id)` yabancı anahtarı var. Ev ağacının satırını
   * kimse oluşturmuyordu: `lib/trees.ts` `createTree` yalnız EK ağaçlar için
   * (`isHome: false`) ve tek diğer yer yönetim göç ucu. Yani yeni kaydolan bir
   * kullanıcının eklediği her kişi FK'ya takılıyor, hata da "best-effort"
   * aynanın `console.warn`ında kayboluyordu: Blob'da 300 kişi, Postgres'te
   * sıfır — ve hiçbir yerde hata görünmüyor.
   *
   * Ev ağacı hesapla BİRLİKTE var oluyor (treeId === accountId), o yüzden
   * satırı da burada, hesabın yanında açılmalı.
   */
  try {
    await dbUpsertTree({
      treeId: user.id,
      ownerAccount: user.id,
      name: user.familyName,
      isHome: true,
      createdAt: user.createdAt,
    });
  } catch (e) {
    console.warn(`[cift-yazma] ev agaci→postgres (${user.id}):`, (e as Error).message);
  }
  return user;
}

/** Bildirim e-posta tercihini günceller (opt-in). id ile bulunur. */
export async function updateUserNotify(
  id: string,
  patch: {
    notifyEmail?: string | null;
    notifyReminders?: boolean;
    notifyMemorials?: boolean;
    notifyNewsletter?: boolean;
  }
): Promise<boolean> {
  return mutateUsers<boolean>((data) => {
  const user = data.users.find((u) => u.id === id);
  if (!user) return { yaz: false, sonuc: false };
  if (patch.notifyEmail !== undefined) {
    const e = (patch.notifyEmail ?? "").trim();
    user.notifyEmail = e || undefined;
    /*
     * Adres SİLİNİRSE bütün onaylar da düşer. Bayraklar açık kalsaydı,
     * kullanıcı sonradan yeni bir adres yazdığında hiç onaylamadığı postaları
     * almaya başlardı — onay adrese değil kişiye ait gibi davranmak olurdu.
     */
    if (!user.notifyEmail) {
      user.notifyReminders = undefined;
      user.notifyMemorials = undefined;
      user.notifyNewsletter = undefined;
      return { yaz: true, sonuc: true };
    }
  }
  if (patch.notifyReminders !== undefined) user.notifyReminders = patch.notifyReminders;
  if (patch.notifyMemorials !== undefined) user.notifyMemorials = patch.notifyMemorials;
  if (patch.notifyNewsletter !== undefined) user.notifyNewsletter = patch.notifyNewsletter;
  return { yaz: true, sonuc: true };
  }, "bildirim tercihi");
}

/**
 * Kimlik e-postasını yazar (Faz 3e). `lib/account-email.ts` neyin
 * uygulanacağına karar verir; burası yalnız uygular.
 *
 * Bekleyen doğrulama jetonu da birlikte yazılıyor: adres değişince eski
 * jetonun geçerli kalması, artık bağlı olmayan bir adresin doğrulanmasına
 * izin vermek olurdu.
 */
export async function updateUserAuthEmail(
  id: string,
  patch: {
    authEmail: string;
    authEmailVerified: boolean;
    emailTokenHash?: string | null;
    emailTokenExpires?: string | null;
  }
): Promise<boolean> {
  return mutateUsers<boolean>((data) => {
  const user = data.users.find((u) => u.id === id);
  if (!user) return { yaz: false, sonuc: false };
  user.authEmail = patch.authEmail || undefined;
  user.authEmailVerified = patch.authEmailVerified || undefined;
  if (patch.emailTokenHash !== undefined)
    user.emailTokenHash = patch.emailTokenHash || undefined;
  if (patch.emailTokenExpires !== undefined)
    user.emailTokenExpires = patch.emailTokenExpires || undefined;
  return { yaz: true, sonuc: true };
  }, "kimlik e-postası");
}

/**
 * Bekleyen ŞİFRE SIFIRLAMA jetonunu yazar/temizler (madde 51).
 *
 * `updateUserAuthEmail`den ayrı bir işlev: o ADRES doğrulama jetonunu
 * yönetiyor, bu HESABIN KENDİSİNİ veren jetonu. İkisini tek işlevde
 * toplamak, bir çağıranın yanlışlıkla ötekini ezmesini kolaylaştırırdı.
 */
export async function updateUserResetToken(
  id: string,
  patch: { resetTokenHash: string | null; resetTokenExpires: string | null }
): Promise<boolean> {
  return mutateUsers<boolean>((data) => {
  const user = data.users.find((u) => u.id === id);
  if (!user) return { yaz: false, sonuc: false };
  user.resetTokenHash = patch.resetTokenHash || undefined;
  user.resetTokenExpires = patch.resetTokenExpires || undefined;
  return { yaz: true, sonuc: true };
  }, "sıfırlama jetonu");
}

export async function updateUserPassword(
  familyName: string,
  newPasswordHash: string
): Promise<boolean> {
  const yazildi = await mutateUsers<string | null>((data) => {
  const user = data.users.find(
    (u) => u.familyName.toLowerCase() === familyName.toLowerCase()
  );
  if (!user) return { yaz: false, sonuc: null };
  user.passwordHash = newPasswordHash;
  /*
   * ŞİFRE DEĞİŞTİ → BEKLEYEN SIFIRLAMA JETONU DÜŞER.
   *
   * Yoksa şu açık kalırdı: kullanıcı e-postayla sıfırlama bağlantısı ister,
   * sonra kurtarma koduyla şifresini kendi değiştirir — ama postadaki
   * bağlantı bir saat daha geçerli kalır. O postayı ele geçiren biri
   * kullanıcının YENİ şifresini de sıfırlayabilirdi. Şifre değiştiği anda
   * bekleyen jeton anlamını yitirmeli, hangi yoldan değişmiş olursa olsun.
   */
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  /*
   * VAR OLAN OTURUMLAR DÜŞÜYOR.
   *
   * Şifre sıfırlamanın anlamı "artık o şifreyi bilen giremesin". Ama girişte
   * verilen NextAuth çerezi (30 gün) ve mobil JWT (60 gün) imzalandıktan
   * sonra geri çağrılamıyor — sunucuda bir oturum kaydı yok. Yani hesabı ele
   * geçirmiş biri, kullanıcı şifresini değiştirdikten sonra da elindeki
   * çerezle aylarca içeride kalabiliyordu; sıfırlama saldırganı değil yalnız
   * gelecekteki girişleri etkiliyordu.
   *
   * Damgayı ileri alıyoruz; `resolveActiveTree` bundan eski `iat` taşıyan
   * her oturumu reddediyor. Kullanıcının kendi öbür cihazları da düşüyor —
   * doğru olan bu: sıfırlama zaten "bir şeyler ters gitti" demek.
   */
  user.sessionEpoch = new Date().toISOString();
  return { yaz: true, sonuc: user.familyName };
  }, "şifre");
  if (!yazildi) return false;
  return true;
}

/**
 * KURTARMA KODUYLA sıfırlamanın tek yazması: yeni şifre ve (verildiyse)
 * yenilenen kurtarma kodu birlikte uygulanır.
 *
 * ## Neden ayrı bir işlev
 *
 * `updateUserPassword` hesabı AĞAÇ ADINDAN buluyor; kod artık tek başına
 * yettiği için elimizde ad değil kimlik var. Ayrıca kod yenileme ile şifre
 * yazma ayrı çağrılar olsaydı araya düşen bir hata hesabı "yeni şifre + eski
 * kod" (ya da tersi) gibi yarım bir hâlde bırakabilirdi.
 *
 * Bekleyen sıfırlama jetonu burada da düşüyor — `updateUserPassword`taki
 * gerekçenin aynısı: şifre hangi yoldan değişirse değişsin, postadaki
 * bağlantı o anda anlamını yitirir.
 */
export async function applyRecoveryReset(
  id: string,
  patch: { passwordHash: string; recoveryCodeHash?: string; recoveryCodeIndex?: string }
): Promise<boolean> {
  const yazildi = await mutateUsers<string | null>((data) => {
  const user = data.users.find((u) => u.id === id);
  if (!user) return { yaz: false, sonuc: null };
  user.passwordHash = patch.passwordHash;
  if (patch.recoveryCodeHash) user.recoveryCodeHash = patch.recoveryCodeHash;
  if (patch.recoveryCodeIndex) user.recoveryCodeIndex = patch.recoveryCodeIndex;
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  /*
   * VAR OLAN OTURUMLAR DÜŞÜYOR.
   *
   * Şifre sıfırlamanın anlamı "artık o şifreyi bilen giremesin". Ama girişte
   * verilen NextAuth çerezi (30 gün) ve mobil JWT (60 gün) imzalandıktan
   * sonra geri çağrılamıyor — sunucuda bir oturum kaydı yok. Yani hesabı ele
   * geçirmiş biri, kullanıcı şifresini değiştirdikten sonra da elindeki
   * çerezle aylarca içeride kalabiliyordu; sıfırlama saldırganı değil yalnız
   * gelecekteki girişleri etkiliyordu.
   *
   * Damgayı ileri alıyoruz; `resolveActiveTree` bundan eski `iat` taşıyan
   * her oturumu reddediyor. Kullanıcının kendi öbür cihazları da düşüyor —
   * doğru olan bu: sıfırlama zaten "bir şeyler ters gitti" demek.
   */
  user.sessionEpoch = new Date().toISOString();
  return { yaz: true, sonuc: user.familyName };
  }, "kurtarma sıfırlaması");
  if (!yazildi) return false;
  return true;
}

/* ── HESAP YAŞAM DÖNGÜSÜ: yumuşak silme, geri alma, kalıcı silme ────────────
 *
 * Gerekçe `lib/retention.ts` başında. Burada yalnız `users.json` üzerindeki
 * yazmalar var; sıralama ve öteki depolar `lib/account-lifecycle.ts`te.
 * ------------------------------------------------------------------------ */

/**
 * Hesabı yumuşak siler / geri alır (`null` → damgayı kaldırır).
 *
 * Damga hesabın KENDİ satırında duruyor, ayrı bir "silinenler" dosyasında
 * değil: iki dosya ayrışırsa hesap ya iki kez silinir ya hiç silinmez, ve
 * `users.json` zaten kimliğin tek kaynağı.
 */
export async function setUserDeletedAt(id: string, deletedAt: string | null): Promise<boolean> {
  const ok = await mutateUsers<boolean>((data) => {
  const user = data.users.find((u) => u.id === id);
  if (!user) return { yaz: false, sonuc: false };
  if (deletedAt) user.deletedAt = deletedAt;
  else delete user.deletedAt;
  /*
   * SİLİNEN HESABIN BEKLEYEN JETONLARI DÜŞER. Sıfırlama/doğrulama postaları
   * yolda olabilir; hesap beklemedeyken o bağlantıların çalışması, silme
   * kararını postayı eline geçiren birine açmak olurdu. Geri almanın yolu
   * ŞİFRE (`/api/account/restore`), posta değil.
   */
  if (deletedAt) {
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.emailTokenHash = undefined;
    user.emailTokenExpires = undefined;
  }
  return { yaz: true, sonuc: true };
  }, "hesap silme damgası");
  if (ok) silinmisOnbellek = null; // kapı verisi değişti → önbellek geçersiz
  return ok;
}

/** Hesabın `users.json` satırını KALICI olarak siler. */
export async function deleteUserRow(id: string): Promise<boolean> {
  const ok = await mutateUsers<boolean>((data) => {
    const kalan = data.users.filter((u) => u.id !== id);
    if (kalan.length === data.users.length) return { yaz: false, sonuc: false };
    // Kutu YERİNDE değiştiriliyor: `{ users: kalan }` yazmak damgayı da
    // düşürürdü ve koruma dayanağını kaybederdi.
    data.users = kalan;
    return { yaz: true, sonuc: true };
  }, "hesap satırı");
  if (ok) silinmisOnbellek = null;
  return ok;
}

/*
 * SİLİNMİŞ HESAP KİMLİKLERİ — kısa ömürlü önbellek.
 *
 * `resolveActiveTree` her API isteğinde bu soruyu soruyor. Oturum çerezi
 * silmeden önce verilmiş olabilir ve JWT'yi geri çağırmanın yolu yok; yani
 * "giriş kapalı" tek başına yetmiyor, VAR OLAN oturum da çözülmemeli.
 *
 * Her istekte `users.json` indirmek bunun bedeli olurdu, o yüzden yalnız
 * KİMLİK KÜMESİ birkaç saniye tutuluyor. Bedeli, silmeden sonra en fazla
 * `ONBELLEK_MS` kadar süren bir pencere: o pencerede hesabın kendi açık
 * oturumu çalışmaya devam eder. Kabul edilebilir — veri zaten `GRACE_DAYS`
 * gün duruyor ve pencere yalnız hesabın KENDİSİNE açık.
 */
const ONBELLEK_MS = 15_000;
let silinmisOnbellek: { ids: Set<string>; at: number } | null = null;

export async function deletedAccountIds(): Promise<Set<string>> {
  const now = Date.now();
  if (silinmisOnbellek && now - silinmisOnbellek.at < ONBELLEK_MS) return silinmisOnbellek.ids;
  const users = await kimlikSatirlari();
  const ids = new Set(users.filter((u) => isSoftDeleted(u)).map((u) => u.id));
  silinmisOnbellek = { ids, at: now };
  return ids;
}

/**
 * Hesabın oturum çağı (ISO) — yoksa `null`.
 *
 * `deletedAccountIds` ile AYNI önbelleği kullanmıyor ama aynı desende: her
 * istekte bir hesap listesi okumamak için kısa ömürlü bir harita. Pencere
 * (ONBELLEK_MS) boyunca sıfırlanmış bir şifrenin eski oturumu çalışmaya
 * devam edebilir — saniyeler mertebesinde ve kabul edilebilir; alternatifi
 * her API çağrısında bir blob okuması olurdu.
 *
 * Okuma başarısız olursa `null`: kimseyi kendi altyapı hatamız yüzünden
 * uygulamasından etmeyiz.
 */
let cagOnbellek: { map: Map<string, string>; at: number } | null = null;

export async function sessionEpochOf(accountId: string): Promise<string | null> {
  const now = Date.now();
  if (!cagOnbellek || now - cagOnbellek.at >= ONBELLEK_MS) {
    try {
      const users = await kimlikSatirlari();
      const map = new Map<string, string>();
      for (const u of users) if (u.sessionEpoch) map.set(u.id, u.sessionEpoch);
      cagOnbellek = { map, at: now };
    } catch {
      return null;
    }
  }
  return cagOnbellek.map.get(accountId) ?? null;
}

/**
 * Hesap yumuşak silinmiş mi? Okuma başarısız olursa `false` — kimseyi kendi
 * altyapı hatamız yüzünden uygulamasından etmeyiz; silinmiş hesabın gizlenmesi
 * bir gizlilik değil, bir yaşam döngüsü kuralı ve gecikmesi zarar vermez.
 */
export async function isAccountDeleted(accountId: string): Promise<boolean> {
  try {
    return (await deletedAccountIds()).has(accountId);
  } catch {
    return false;
  }
}
