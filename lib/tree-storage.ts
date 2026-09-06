/**
 * BİR AĞACIN / HESABIN BÜTÜN DEPOLAMA YOLLARI — tek envanter.
 *
 * ## Neden tek yerde
 *
 * `deleteTree` uzun süre yalnız iki dosyayı siliyordu (`family-data-…` ve
 * `tree-access-…`). Oysa ağaç kimliğiyle anahtarlanan sekiz depo daha var:
 * tarifler, mektuplar, vefat ilanları, buluşmalar, bağlar, hikâyeler,
 * öneriler ve değişiklik geçmişi. Yani silinen bir ağacın ardından ailenin
 * KENDİ YAZDIĞI içerik depoda kalıyordu.
 *
 * İki ayrı zarar: (1) kullanıcı sildiğini sanıyor ama silinmiyor — gereksiz
 * saklama; (2) aynı `treeId` bir gün yeniden kullanılırsa yabancı içerik yeni
 * ağacın içinde belirir.
 *
 * Envanter ELLE yazılmıştır — çalışma zamanında keşfedilecek bir şey değil.
 * Bu yüzden listeye girmeyen yeni bir depo eklenmesi tek başına fark
 * edilemez; onu `tests/tree-storage-gate.test.mts` yakalıyor: `lib/` altında
 * `` `xxx-${treeId}.json` `` biçimli her yol burada karşılığını bulmak
 * zorunda.
 *
 * ## KAPSAM DIŞI: Cloudinary (medya)
 *
 * Fotoğraf, ses, video ve belgeler Cloudinary'de (`lib/cloudinary.ts`).
 * SİLİNMİYORLAR ve bu bilinçli bir karar:
 *
 *  · `lib/cloudinary.ts` yalnız `upload_stream` ve `ping` kullanıyor; silme
 *    (`uploader.destroy`) için `public_id` gerekir, oysa kayıtlarda yalnız
 *    `secure_url` saklanıyor. URL'den `public_id` türetmek dönüşüm
 *    parçalarını ve sürüm ekini ayıklamak demek — yanlış ayıklanan bir kimlik
 *    ya hiçbir şeyi siler ya da BAŞKA bir ağacın medyasını.
 *  · Aynı URL birden çok kayıtta (ve aşılama/birleştirme sonrası birden çok
 *    AĞAÇTA) geçebiliyor; bir ağacı silerken URL'i silmek, başka bir ağaçtaki
 *    resmi kırardı.
 *
 * Sonuç: medya sağlayıcıda kalır. Bu, bilinmesi gereken bir eksik — kullanıcı
 * "her şey silindi" derken medyanın Cloudinary'de durduğunu bilmeli
 * (`docs/SILME-VE-SAKLAMA.md`). Saf ve bağımlılıksız kalsın diye burada
 * yalnız yazılı; kod yok.
 */

/**
 * Ağaç kimliğiyle anahtarlanan blob önekleri. Yol her zaman
 * `<önek>-<treeId>.json`.
 *
 * Sıra ANLAMLI: asıl veri (`family-data`) EN SONA bırakılıyor. Silme en iyi
 * çaba ve yarıda kalabilir; yarım silinmiş bir ağaçta elde kalan en değerli
 * şey kişi listesidir, o yüzden en son o gider.
 */
export const TREE_BLOB_PREFIXES = [
  "family-history", // lib/history.ts    — geri alma günlüğü (anlık görüntüler)
  "tree-access", //    lib/members.ts    — üyeler, davetler, paylaşımlar, eşleşmeler
  "recipes", //        lib/recipe-store.ts
  "letters", //        lib/letter-store.ts
  "obituaries", //     lib/obituary-store.ts
  "gatherings", //     lib/gathering-store.ts
  "bonds", //          lib/bond-store.ts
  "stories", //        lib/story-store.ts
  "proposals", //      lib/proposal-store.ts
  "family-data", //    lib/blob.ts       — kişiler (asıl veri; en son silinir)
] as const;

/**
 * HESAP kimliğiyle anahtarlanan blob önekleri. Ağaç silmede DOKUNULMAZ:
 * ağaç kaydı hesabın kendisine ait ve içinde başka ağaçlar da var.
 */
export const ACCOUNT_BLOB_PREFIXES = [
  "account-trees", // lib/trees.ts — founder'ın ek ağaç kaydı
] as const;

/**
 * Hesaba ait olup da ayrı bir dosyası OLMAYAN kayıtlar — silme sırasında
 * unutulmasın diye burada yazılı:
 *
 *  · `users.json` içindeki hesap SATIRI (`lib/users.ts`)
 *  · Supabase Auth kullanıcısı (`lib/auth-users.ts`)
 *  · Postgres satırları (aşağıdaki tablo envanteri)
 */

/**
 * Postgres tarafı — hangi satır NASIL gidiyor.
 *
 * FK cascade'e körlemesine güvenilmiyor: `supabase/schema.sql`te `people`,
 * `tree_members` ve `tree_invites` gerçekten `references trees(id) on delete
 * cascade` taşıyor, ama `trees.owner_account` hesaba bağlı DEĞİL (FK yok).
 * Yani hesabı silmek ağaçlarını silmez; ağaçlar açıkça silinmeli. Bunun
 * tersi de yaşandı: kaldırılan misafir girişinden arta kalan yetim bir
 * `accounts` satırı depoda öylece kaldı.
 */
export const TREE_DB_TABLES = [
  "trees", //         açıkça silinir (id = treeId)
  "people", //        cascade (trees → people)
  "tree_members", //  cascade
  "tree_invites", //  cascade
] as const;

export const ACCOUNT_DB_TABLES = [
  "accounts", //     açıkça silinir (id = accountId)
  "trees", //        açıkça silinir (owner_account = accountId) — FK YOK, cascade beklenemez
  "rate_limits", //  açıkça silinir (anahtarın içinde hesap kimliği geçer)
] as const;

/** Bir ağacın bütün blob yolları. Boş kimlikte boş liste — `-.json` üretmez. */
export function treeBlobPaths(treeId: string): string[] {
  if (!treeId.trim()) return [];
  return TREE_BLOB_PREFIXES.map((p) => `${p}-${treeId}.json`);
}

/** Bir hesabın (ağaçları HARİÇ) blob yolları. */
export function accountBlobPaths(accountId: string): string[] {
  if (!accountId.trim()) return [];
  return ACCOUNT_BLOB_PREFIXES.map((p) => `${p}-${accountId}.json`);
}

/**
 * `Promise.allSettled` sonucundan SİLİNEMEYEN yolları çıkarır.
 *
 * Silme en iyi çaba olmalı — tek bir dosyanın hatası ötekileri iptal
 * etmemeli. Ama SESSİZ olmamalı: yarım silinmiş bir ağaç, hiç silinmemiş bir
 * ağaçtan tehlikelidir, çünkü kullanıcı sildiğini sanır. Bu yüzden çağıran
 * taraf listeyi günlüğe yazar ve yanıtta (207) döndürür.
 */
export function failedPaths(
  paths: readonly string[],
  results: readonly PromiseSettledResult<unknown>[]
): string[] {
  const out: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    if (results[i]?.status === "rejected") out.push(paths[i]);
  }
  // Sonuç eksikse (olmaması gereken durum) geri kalanı da başarısız say —
  // "bilmiyorum"u "silindi" diye raporlamak yanlış yönde bir hata olurdu.
  if (results.length < paths.length) out.push(...paths.slice(results.length));
  return out;
}
