import { put, list, get } from "@vercel/blob";
import type { User, UsersData } from "@/types/user";
import { dbUpdateAccountPassword, dbUpsertAccount, dbUpsertTree } from "@/lib/db";
import { importAccountToAuth, isUuid } from "@/lib/auth-users";

const USERS_PATHNAME = "users.json";

export async function getUsersData(): Promise<UsersData> {
  const { blobs } = await list({ prefix: USERS_PATHNAME });
  if (blobs.length === 0) return { users: [] };
  const latest = blobs.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0];
  const result = await get(latest.pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return { users: [] };
  return await new Response(result.stream).json();
}

async function saveUsersData(data: UsersData): Promise<void> {
  await put(USERS_PATHNAME, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/**
 * Hesabı kimliğinden bulur.
 *
 * Katkı akışı için gerekli: kurucunun kimliği ağacın kimliğidir ve üye
 * listesinde tutulmaz, dolayısıyla adı ancak buradan çözülebiliyor.
 */
export async function findUserById(id: string): Promise<User | null> {
  const { users } = await getUsersData();
  return users.find((u) => u.id === id) ?? null;
}

export async function findUserByFamilyName(familyName: string): Promise<User | null> {
  const { users } = await getUsersData();
  return users.find((u) => u.familyName.toLowerCase() === familyName.toLowerCase()) ?? null;
}

export async function createUser(
  id: string,
  familyName: string,
  passwordHash: string,
  recoveryCodeHash: string
): Promise<User> {
  const data = await getUsersData();
  const user: User = {
    id,
    familyName,
    passwordHash,
    recoveryCodeHash,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  await saveUsersData(data);
  // Faz 3 — çift-yazma (best-effort): hesabı Postgres'e de yaz. Giriş hâlâ
  // Blob'dan doğrulanıyor; hata giriş/kayıt akışını ETKİLEMEZ.
  try {
    await dbUpsertAccount(user);
  } catch (e) {
    console.warn(`[cift-yazma] account→postgres (${user.id}):`, (e as Error).message);
  }
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
  // Faz 3c — yeni founder'ı Supabase Auth'a da aktar (mevcut bcrypt hash'iyle),
  // böylece bayrak açıkken Supabase üzerinden giriş yapabilir. Yalnız gerçek
  // (UUID) hesaplar; demo (UUID değil) dışlanır. Best-effort — kaydı bozmaz.
  if (isUuid(user.id)) {
    try {
      await importAccountToAuth(user);
    } catch (e) {
      console.warn(`[3c] account→auth (${user.id}):`, (e as Error).message);
    }
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
  const data = await getUsersData();
  const user = data.users.find((u) => u.id === id);
  if (!user) return false;
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
      await saveUsersData(data);
      return true;
    }
  }
  if (patch.notifyReminders !== undefined) user.notifyReminders = patch.notifyReminders;
  if (patch.notifyMemorials !== undefined) user.notifyMemorials = patch.notifyMemorials;
  if (patch.notifyNewsletter !== undefined) user.notifyNewsletter = patch.notifyNewsletter;
  await saveUsersData(data);
  return true;
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
  const data = await getUsersData();
  const user = data.users.find((u) => u.id === id);
  if (!user) return false;
  user.authEmail = patch.authEmail || undefined;
  user.authEmailVerified = patch.authEmailVerified || undefined;
  if (patch.emailTokenHash !== undefined)
    user.emailTokenHash = patch.emailTokenHash || undefined;
  if (patch.emailTokenExpires !== undefined)
    user.emailTokenExpires = patch.emailTokenExpires || undefined;
  await saveUsersData(data);
  return true;
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
  const data = await getUsersData();
  const user = data.users.find((u) => u.id === id);
  if (!user) return false;
  user.resetTokenHash = patch.resetTokenHash || undefined;
  user.resetTokenExpires = patch.resetTokenExpires || undefined;
  await saveUsersData(data);
  return true;
}

export async function updateUserPassword(
  familyName: string,
  newPasswordHash: string
): Promise<boolean> {
  const data = await getUsersData();
  const user = data.users.find(
    (u) => u.familyName.toLowerCase() === familyName.toLowerCase()
  );
  if (!user) return false;
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
  await saveUsersData(data);
  // Çift-yazma (best-effort): Postgres aynasındaki şifreyi de güncelle.
  try {
    await dbUpdateAccountPassword(user.familyName, newPasswordHash);
  } catch (e) {
    console.warn(`[cift-yazma] account password→postgres (${user.id}):`, (e as Error).message);
  }
  return true;
}
