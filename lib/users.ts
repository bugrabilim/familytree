import { put, list } from "@vercel/blob";
import type { User, UsersData } from "@/types/user";

const USERS_PATHNAME = "users.json";

export async function getUsersData(): Promise<UsersData> {
  try {
    const { blobs } = await list({ prefix: USERS_PATHNAME });
    if (blobs.length === 0) return { users: [] };
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    const res = await fetch(latest.url, { cache: "no-store" });
    return await res.json();
  } catch {
    return { users: [] };
  }
}

async function saveUsersData(data: UsersData): Promise<void> {
  await put(USERS_PATHNAME, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
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
  return true;
}
