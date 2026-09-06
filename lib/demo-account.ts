import { hash } from "bcryptjs";
import { findUserByFamilyName, createUser } from "@/lib/users";
import { saveFamilyData } from "@/lib/blob";
import { listTrees, purgeTree } from "@/lib/trees";
import { DEMO_PEOPLE } from "@/lib/demo-data";
import type { User } from "@/types/user";

/** Herkesin şifresiz girebildiği ortak demo hesabı. */
export const DEMO_FAMILY_NAME = "Demirtaş (demo)";
export const DEMO_USER_ID = "demo-hesap";

/**
 * Demo hesabını hazırlar ve ağacını başlangıç hâline döndürür.
 *
 * Hesap herkese açık ve ortak: ziyaretçiler kişi ekleyip silebilir.
 * Bu yüzden her demo girişinde ağaç sıfırlanır — bir sonraki ziyaretçi
 * her zaman tertemiz bir demo görür. Demo hesabı founder olduğundan
 * ziyaretçiler ekstra ("test") ağaçlar da oluşturabilir; bunlar ana ağaç
 * sıfırlamasına dahil değildi ve birikiyordu — girişte hepsi temizlenir,
 * yalnız ana demo ağacı kalır.
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
    // Aile Kitabı için varsayılan kapak (#9). Ziyaretçi kendi fotoğrafını
    // yükleyip değiştirebilir; her demo girişinde bu varsayılana döner.
    coverPhoto: "/demo-book-cover.svg",
    updatedAt: new Date().toISOString(),
  });

  // Ziyaretçilerin oluşturduğu ekstra ("test") ağaçları temizle — yalnız ana
  // demo ağacı kalsın. Best-effort: temizlik başarısız olsa da demo açılır.
  try {
    const trees = await listTrees(user.id, DEMO_FAMILY_NAME);
    for (const t of trees) {
      /*
       * Demo'da BEKLEME SÜRESİ YOK: yumuşak silme (`softDeleteTree`) yerine
       * doğrudan kalıcı silme. Bekleme süresi "yanlışlıkla sildim" hatasına
       * karşı; demo ağaçları zaten her girişte sıfırlanan oyuncak veri ve 30
       * gün beklemek, ziyaretçilerin bıraktığı ağaçların birikmesi demek
       * olurdu.
       */
      if (!t.home) await purgeTree(user.id, t.treeId);
    }
  } catch {
    /* temizlik başarısız olsa da demo çalışmaya devam eder */
  }

  // NOT: Paylaşım bağlantılarını girişte SIFIRLAMIYORUZ. Eskiden resetShares
  // çağrılıyordu; bu, ziyaretçinin demo'da oluşturduğu paylaşım linkini
  // (bazen daha o linke tıklamadan) siliyor ve link "Bağlantı geçersiz"
  // veriyordu. Demo verisi sabittir (DEMO_PEOPLE), bir link hep geçerli demo
  // ağacını gösterir; birikim MAX_SHARES ile zaten sınırlıdır.

  return user;
}
