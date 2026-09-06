import { del } from "@vercel/blob";
import { deleteUserRow, findUserById, getUsersData, setUserDeletedAt } from "@/lib/users";
import {
  allTreeIds,
  duePurgeTrees,
  listDeletedTrees,
  purgeTree,
  purgeTreeStorage,
} from "@/lib/trees";
import { markTreeDeleted } from "@/lib/members";
import { accountBlobPaths, failedPaths } from "@/lib/tree-storage";
import { graceInfo, isPurgeDue, isSoftDeleted, type GraceInfo } from "@/lib/retention";
import { dbDeleteAccount, dbDeleteRateLimitsFor } from "@/lib/db";
import { deleteAccountAuthUser } from "@/lib/auth-users";
import { DEMO_USER_ID } from "@/lib/demo-account";
import type { User } from "@/types/user";

/**
 * HESABIN YAŞAM DÖNGÜSÜNÜN SONU — yumuşak silme, geri alma, kalıcı silme.
 *
 * Ağaç silmenin (`lib/trees.ts`) hesap ölçeğindeki karşılığı; kurallar aynı
 * (`lib/retention.ts`): önce damga ve `GRACE_DAYS` günlük bekleme, sonra
 * zamanlanmış işin yaptığı kalıcı silme.
 *
 * ## Neden ana ağaç buradan siliniyor
 *
 * Ana ağaç (treeId === accountId) hesabın kendisidir; `softDeleteTree` onu
 * bilerek reddediyor. Hesabı silmek, ana ağacı da silmenin TEK yolu — ve o
 * yol şifre teyidi istiyor.
 *
 * ## Silme sırası: içerik önce, KİMLİK EN SON
 *
 * Kalıcı silmede `users.json` satırı en sona bırakılıyor. Ters sırada bir
 * hata, sahibi olmayan yetim veri bırakırdı: kimse onu bulamaz, kimse
 * temizleyemez, bir sonraki koşu da hesabı göremediği için hiç denemez.
 * Bu sırayla ise yarıda kalan silme bir sonraki gün olduğu yerden devam eder
 * (damga hâlâ duruyor, koşu idempotent).
 */

/** Kalıcı silmede dokunulan yerlerin özeti (kullanıcıya 207 olarak döner). */
export interface PurgeResult {
  /** Silinemeyen yollar — boşsa temiz. Blob yolu ya da `postgres:…`/`auth:…`. */
  failed: string[];
}

export type AccountDeleteResult =
  | { ok: false; reason: "demo" | "not-found" | "already-deleted" }
  | ({ ok: true; failed: string[] } & GraceInfo);

/**
 * YUMUŞAK SİLME — hesabı bekleme süresine alır.
 *
 * Damga `users.json`da; ama hesabın BÜTÜN ağaçlarının erişim dosyaları da
 * damgalanıyor. Sebep: paylaşım bağlantısı, davet ve RSVP yüzeyleri hesabı
 * değil ağacı tanıyor. Yalnız `users.json`a damga koymak, girişi kapatıp
 * WhatsApp'taki paylaşım bağlantısını açık bırakmak olurdu.
 *
 * DEMO HESABI SİLİNEMEZ: herkese açık ortak oyun alanı (`lib/demo-account.ts`).
 * Ziyaretçi orada founder yetkisiyle geziyor; silinebilseydi ilk meraklı
 * ziyaretçi demoyu herkes için kapatırdı.
 */
export async function softDeleteAccount(accountId: string): Promise<AccountDeleteResult> {
  if (accountId === DEMO_USER_ID) return { ok: false, reason: "demo" };
  const user = await findUserById(accountId);
  if (!user) return { ok: false, reason: "not-found" };
  if (isSoftDeleted(user)) return { ok: false, reason: "already-deleted" };

  const deletedAt = new Date().toISOString();
  const failed: string[] = [];

  /*
   * ÖNCE AĞAÇLAR, SONRA HESAP. Ters sırada, ağaç damgalaması yarıda kalırsa
   * ortaya "giriş kapalı ama bağlantı açık" çıkardı — silmenin en kötü yarım
   * hâli. Bu sırada ise en kötü ihtimalle bazı ağaçlar erkenden gizlenir ve
   * hesap açık kalır; kullanıcı işlemi tekrarlayabilir.
   */
  for (const treeId of await allTreeIds(accountId)) {
    try {
      await markTreeDeleted(treeId, deletedAt);
    } catch (e) {
      console.warn(`[hesap-silme] erişim damgası (${treeId}):`, (e as Error).message);
      failed.push(`tree-access-${treeId}.json`);
    }
  }

  await setUserDeletedAt(accountId, deletedAt);
  return { ok: true, failed, ...graceInfo(deletedAt) };
}

/**
 * GERİ ALMA — bekleme süresi içinde hesabı canlıya döndürür.
 *
 * TEK TEK SİLİNMİŞ AĞAÇLAR GERİ GELMEZ: kullanıcı hesabı silmeden önce bir
 * ağacı ayrıca silmişse, o ağacın kendi bekleme süresi işlemeye devam eder.
 * Hesabın geri gelmesi, o karar için "vazgeçtim" anlamına gelmiyor; ayrımı
 * ağaç kaydındaki damga taşıyor.
 */
export async function restoreAccount(
  accountId: string
): Promise<{ ok: boolean; reason?: "not-found" | "not-deleted"; failed: string[] }> {
  const user = await findUserById(accountId);
  if (!user) return { ok: false, reason: "not-found", failed: [] };
  if (!isSoftDeleted(user)) return { ok: false, reason: "not-deleted", failed: [] };

  const failed: string[] = [];
  await setUserDeletedAt(accountId, null);

  const kendiSilinen = new Set((await listDeletedTrees(accountId)).map((t) => t.treeId));
  for (const treeId of await allTreeIds(accountId)) {
    if (kendiSilinen.has(treeId)) continue; // ağaç ayrıca silinmişti — öyle kalsın
    try {
      await markTreeDeleted(treeId, null);
    } catch (e) {
      console.warn(`[hesap-geri-alma] erişim damgası (${treeId}):`, (e as Error).message);
      failed.push(`tree-access-${treeId}.json`);
    }
  }
  return { ok: true, failed };
}

/**
 * KALICI SİLME — hesabın sahip olduğu her şey.
 *
 * Kullanıcıya AÇIK DEĞİL: yalnız bekleme süresi dolunca zamanlanmış iş
 * çağırır. En iyi çaba, ama sessiz değil: silinemeyen her yol listeye ve
 * günlüğe düşer.
 *
 * NOT: Cloudinary'deki medya SİLİNMEZ — gerekçesi `lib/tree-storage.ts`te,
 * kullanıcıya söylenmesi gereken hâliyle `docs/SILME-VE-SAKLAMA.md`de.
 */
export async function purgeAccount(user: User): Promise<PurgeResult> {
  if (user.id === DEMO_USER_ID) return { failed: [`demo-hesap:${user.id}`] };
  const failed: string[] = [];

  // 1) Ağaçlar — ana ağaç dahil (kayıt blob'u birazdan zaten silinecek, o
  //    yüzden kayıttan tek tek çıkarmak yerine doğrudan depoyu siliyoruz).
  for (const treeId of await allTreeIds(user.id)) {
    failed.push(...(await purgeTreeStorage(treeId)));
  }

  // 2) Hesabın ağaç kaydı.
  const hesapYollari = accountBlobPaths(user.id);
  const sonuc = await Promise.allSettled(hesapYollari.map((p) => del(p)));
  for (const yol of failedPaths(hesapYollari, sonuc)) {
    console.warn(`[hesap-silme] blob silinemedi: ${yol}`);
    failed.push(yol);
  }

  // 3) Postgres — hesap satırı + sahip olduğu ağaçlar (FK cascade YOK,
  //    `lib/db.ts`teki gerekçeye bak) + hız sınırı kovaları.
  try {
    await dbDeleteAccount(user.id);
  } catch (e) {
    console.warn(`[hesap-silme] postgres (${user.id}):`, (e as Error).message);
    failed.push(`postgres:accounts/${user.id}`);
  }
  try {
    await dbDeleteRateLimitsFor(user.id);
  } catch (e) {
    console.warn(`[hesap-silme] rate_limits (${user.id}):`, (e as Error).message);
    failed.push(`postgres:rate_limits/${user.id}`);
  }

  // 4) Supabase Auth kullanıcısı.
  try {
    await deleteAccountAuthUser(user.id);
  } catch (e) {
    console.warn(`[hesap-silme] supabase auth (${user.id}):`, (e as Error).message);
    failed.push(`supabase-auth:${user.id}`);
  }

  // 5) KİMLİK EN SON (dosya başındaki gerekçe).
  try {
    if (!(await deleteUserRow(user.id))) failed.push(`users.json#${user.id}`);
  } catch (e) {
    console.warn(`[hesap-silme] users.json (${user.id}):`, (e as Error).message);
    failed.push(`users.json#${user.id}`);
  }

  return { failed };
}

/** Temizlik koşusunun özeti — zamanlanmış iş bunu günlüğe yazar ve döner. */
export interface SweepSummary {
  purgedAccounts: number;
  purgedTrees: number;
  failed: string[];
}

/**
 * SÜRESİ DOLMUŞ olan her şeyi kalıcı siler.
 *
 * ## Neden ayrı bir cron YOK
 *
 * Vercel Hobby planında proje başına EN FAZLA İKİ zamanlanmış iş var ve
 * ikisi de dolu (`app/api/cron/reminders`, `app/api/cron/backup`). Bu yüzden
 * temizlik yeni bir iş değil, GÜNLÜK YEDEĞİN son adımı — çağrı
 * `app/api/cron/backup/route.ts`te. Kısıt kalkarsa (plan yükseltilirse) ayrı
 * bir iş daha doğru olur; bu işlev olduğu gibi taşınabilir.
 *
 * Sıra bilinçli: temizlik yedeğin ARDINDAN koşuyor, yani silinen verinin o
 * günkü görüntüsü `backups/<gün>/` altında duruyor ve saklama süresi
 * (varsayılan 14 gün) boyunca elle geri alınabiliyor. Ters sırada, silinen
 * ağacın son yedeği hiç alınmamış olurdu.
 */
export async function sweepExpired(now: Date = new Date()): Promise<SweepSummary> {
  const ozet: SweepSummary = { purgedAccounts: 0, purgedTrees: 0, failed: [] };
  const { users } = await getUsersData();

  for (const u of users) {
    // 1) Süresi dolmuş HESAP → her şeyiyle gider; ağaçlarına ayrıca bakmaya
    //    gerek yok (hepsi bu silmenin içinde).
    if (isSoftDeleted(u) && isPurgeDue(u.deletedAt!, now)) {
      const r = await purgeAccount(u);
      ozet.purgedAccounts++;
      ozet.failed.push(...r.failed);
      continue;
    }

    // 2) Yaşayan hesabın süresi dolmuş AĞAÇLARI.
    let dueTrees: Awaited<ReturnType<typeof duePurgeTrees>>;
    try {
      dueTrees = await duePurgeTrees(u.id, (d) => isPurgeDue(d, now));
    } catch (e) {
      console.warn(`[temizlik] ağaç kaydı okunamadı (${u.id}):`, (e as Error).message);
      ozet.failed.push(`account-trees-${u.id}.json`);
      continue;
    }
    for (const t of dueTrees) {
      ozet.failed.push(...(await purgeTree(u.id, t.treeId)));
      ozet.purgedTrees++;
    }
  }

  if (ozet.failed.length > 0) {
    console.warn(`[temizlik] silinemeyen ${ozet.failed.length} yol:`, ozet.failed.join(", "));
  }
  return ozet;
}
