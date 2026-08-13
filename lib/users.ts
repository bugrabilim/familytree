import { put, list, get } from "@vercel/blob";
import type { User, UsersData } from "@/types/user";
import { dbUpdateAccountPassword, dbUpsertAccount } from "@/lib/db";
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
  await saveUsersData(data);
  // Çift-yazma (best-effort): Postgres aynasındaki şifreyi de güncelle.
  try {
    await dbUpdateAccountPassword(user.familyName, newPasswordHash);
  } catch (e) {
    console.warn(`[cift-yazma] account password→postgres (${user.id}):`, (e as Error).message);
  }
  return true;
}
