import { hash } from "bcryptjs";
import { findUserByFamilyName, createUser } from "@/lib/users";
import { saveFamilyData } from "@/lib/blob";
import { DEMO_PEOPLE } from "@/lib/demo-data";
import type { User } from "@/types/user";

/** Herkesin şifresiz girebildiği ortak demo hesabı. */
export const DEMO_FAMILY_NAME = "Demirtaş (demo)";
const DEMO_USER_ID = "demo-hesap";

/**
 * Demo hesabını hazırlar ve ağacını başlangıç hâline döndürür.
 *
 * Hesap herkese açık ve ortak: ziyaretçiler kişi ekleyip silebilir.
 * Bu yüzden her demo girişinde ağaç sıfırlanır — bir sonraki ziyaretçi
 * her zaman tertemiz bir demo görür.
 *
 * Hesabın şifre karması rastgeledir ve hiçbir yerde saklanmaz; normal
 * giriş formundan bu hesaba girilemez, yalnızca `demo` sağlayıcısıyla
 * girilir.
 */
export async function prepareDemoAccount(): Promise<User> {
  let user = await findUserByFamilyName(DEMO_FAMILY_NAME);

  if (!user) {
    const rastgele = crypto.randomUUID() + crypto.randomUUID();
    const [passwordHash, recoveryCodeHash] = await Promise.all([
      hash(rastgele, 12),
      hash(crypto.randomUUID(), 10),
    ]);
    user = await createUser(DEMO_USER_ID, DEMO_FAMILY_NAME, passwordHash, recoveryCodeHash);
  }

  await saveFamilyData(user.id, {
    people: DEMO_PEOPLE,
    updatedAt: new Date().toISOString(),
  });

  return user;
}
