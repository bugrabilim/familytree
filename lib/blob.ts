import { withTimeout, MIRROR_TIMEOUT_MS } from "@/lib/with-timeout";
import { put, list, get } from "@vercel/blob";
import type { FamilyData, Person } from "@/types/family";
import {
  dbDeletePeople,
  dbGetFamilyData,
  dbReplacePeople,
  dbSetTreeUpdatedAt,
  dbUpsertPeople,
} from "@/lib/db";
import { diffPeople } from "@/lib/people-diff";
import { pushHistorySnapshot } from "@/lib/history";
import { shouldKeepCover } from "@/lib/tree-meta";

function blobPathname(userId: string) {
  return `family-data-${userId}.json`;
}

/* ----------------------------------------------------------------------
 * Madde 10 — Kısa ömürlü bellek içi önbellek.
 *
 * Tüm veri tek bir JSON dosyası; her istekte tümünü indirmek/yazmak, ağaç
 * büyüdükçe pahalılaşıyor. Sıcak (warm) bir sunucusuz örnekte ardışık
 * okumalar dosyayı tekrar tekrar indirmesin diye küçük bir TTL önbelleği
 * tutuyoruz. Önbellek, JSON dizisi olarak saklanır: her okuma taze bir nesne
 * ayrıştırır, böylece çağıranın nesneyi değiştirmesi önbelleği bozamaz.
 *
 * Yazma yolları (POST/PUT/DELETE, import) `skipCache: true` ile taze okur:
 * `oku→değiştir→yaz` akışının bayat veriyle çalışıp bir başkasının
 * değişikliğini ezmesini istemiyoruz. Çakışma tespiti ise Madde 9'daki
 * sürüm (updatedAt) kontrolüyle yapılır.
 * -------------------------------------------------------------------- */
const CACHE_TTL_MS = 4000;
const cache = new Map<string, { json: string; at: number }>();

const emptyData = (): FamilyData => ({ people: [], updatedAt: new Date().toISOString() });

async function readFromBlob(userId: string): Promise<FamilyData> {
  const key = blobPathname(userId);
  const { blobs } = await list({ prefix: key });
  if (blobs.length === 0) return emptyData();
  const latest = blobs.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0];
  const result = await get(latest.pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return emptyData();
  const text = await new Response(result.stream).text();
  cache.set(userId, { json: text, at: Date.now() });
  return JSON.parse(text) as FamilyData;
}

/**
 * Ağaç-düzeyi meta (yalnız Blob'da tutulan `coverPhoto` gibi) — Postgres yalnız
 * `people` sakladığından, DB okuma yolu bu alanları düşürür. Blob'dan hafifçe
 * okuyup birleştiririz ki oku→değiştir→yaz döngüsünde silinmesin. Ana önbelleğe
 * DOKUNMAZ (aksi hâlde DB yerine Blob'u döndürmüş gibi olurduk).
 */
/** Blob'daki ham FamilyData'yı önbelleğe DOKUNMADAN okur (yoksa null). */
async function readRawFromBlob(userId: string): Promise<FamilyData | null> {
  const key = blobPathname(userId);
  const { blobs } = await list({ prefix: key });
  if (blobs.length === 0) return null;
  const latest = blobs.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0];
  const result = await get(latest.pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  try {
    return JSON.parse(await new Response(result.stream).text()) as FamilyData;
  } catch {
    return null;
  }
}

/**
 * SALT BLOB okuma — Postgres'e hiç bakmaz. Yoksa `null`.
 *
 * `getFamilyData` Faz 2d'den beri ÖNCE Postgres'e bakıyor ve ağaç orada varsa
 * Blob'a hiç inmiyor. Bu, uygulamanın okuma yolu için doğru; ama iki iş için
 * YANLIŞ, çünkü ikisi de tam olarak "Blob ne diyor" sorusunu soruyor:
 *
 * · Göç (`/api/admin/migrate`) — Blob'u Postgres'e kopyalar. `getFamilyData`
 *   ile okursa, ağaç satırı yeni açıldığı için Postgres'ten BOŞ liste alır ve
 *   göç sıfır kişi taşır.
 * · Kayma denetimi (`/api/admin/drift`) — iki kaynağı karşılaştırır.
 *   `getFamilyData` ile okursa Postgres'i Postgres'le karşılaştırır ve her
 *   zaman "ayrışma yok" der; yani denetim aracının verebileceği en kötü yanıt.
 *
 * Bu yüzden ikisi de bu işlevi kullanmak ZORUNDA. `tests/blob-source.test.mts`
 * kilitliyor.
 */
export async function readFamilyFromBlob(userId: string): Promise<FamilyData | null> {
  return readRawFromBlob(userId);
}

async function readMetaFromBlob(userId: string): Promise<{ coverPhoto?: string }> {
  const d = await readRawFromBlob(userId);
  return { coverPhoto: d?.coverPhoto };
}

/**
 * Sağlık kontrolü: Blob deposuna gerçekten ulaşılıyor mu? (sır sızdırmaz)
 *
 * Doğrudan bir `list()` çağrısı dener — token'ın env değişkeni ADINI tahmin
 * etmeye çalışmaz. Bu ortamdaki özelleştirilmiş `@vercel/blob`, kimlik
 * doğrulamayı `BLOB_READ_WRITE_TOKEN` dışında bir yolla çözebildiği için
 * (uygulama fiilen okuyup yazabiliyor) env-adı ön kontrolü yanlış negatif
 * veriyordu. Gerçek çağrı, yeteneği en doğru şekilde ölçer.
 */
export async function pingBlob(): Promise<{ ok: boolean; error?: string }> {
  try {
    await list({ limit: 1 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getFamilyData(
  userId: string,
  opts?: { skipCache?: boolean }
): Promise<FamilyData> {
  if (!opts?.skipCache) {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return JSON.parse(hit.json) as FamilyData;
    }
  }
  // Faz 2d — okuma yolu: ÖNCE Postgres. Ağaç Postgres'te yoksa (null) ya da
  // bir hata olursa Blob'a düşülür (yedek). Yazma yolu iki yere yazmaya devam
  // ettiği için Blob canlı bir yedek olarak güncel kalır.
  try {
    const fromDb = await dbGetFamilyData(userId);
    /*
     * AYNASI BOŞALMIŞ AĞAÇ, BOŞ AĞAÇ DEĞİLDİR.
     *
     * `dbGetFamilyData` yalnız AĞAÇ SATIRI yoksa `null` dönüyor; kişiler
     * boşsa `{people: []}` dönüyordu ve yedek hiç devreye girmiyordu. Yani
     * ayna bir kez bozulursa (çift-yazma en iyi çaba ve 4 sn zaman aşımı
     * var) kullanıcı ağacını BOŞ görüyor, hiçbir uyarı çıkmıyordu — sessiz
     * ve en kötü türden bir arıza: veri duruyor ama yokmuş gibi görünüyor.
     *
     * Boş gelen ağaçta Blob'a da bakılıyor. Gerçekten boş bir ağaçta (yeni
     * kurulmuş) bedeli tek bir fazladan okuma; aynası bozuk bir ağaçta ise
     * bütün verinin geri gelmesi. Blob'da kayıt VARSA bu bir ayna boşluğudur
     * ve gürültülü şekilde günlüğe yazılıyor — sessiz kalması, sorunu
     * bulunamaz kılardı.
     */
    if (fromDb && fromDb.people.length === 0) {
      try {
        const yedek = await readFromBlob(userId);
        if (yedek.people.length > 0) {
          console.error(
            `[ayna-boslugu] ${userId}: Postgres 0 kişi, Blob ${yedek.people.length} kişi — Blob kullanıldı`
          );
          return yedek;
        }
      } catch {
        /* Blob da okunamadıysa aşağıdaki boş sonuç dönsün */
      }
    }
    if (fromDb) {
      // Blob-only meta'yı (kapak fotoğrafı) birleştir — DB bunu tutmaz.
      try {
        const meta = await readMetaFromBlob(userId);
        if (meta.coverPhoto) fromDb.coverPhoto = meta.coverPhoto;
      } catch { /* meta okunamazsa yoksay */ }
      cache.set(userId, { json: JSON.stringify(fromDb), at: Date.now() });
      return fromDb;
    }
  } catch (e) {
    console.warn(`[okuma] postgres→blob yedek (${userId}):`, (e as Error).message);
  }
  try {
    return await readFromBlob(userId);
  } catch {
    return emptyData();
  }
}

/* ----------------------------------------------------------------------
 * Madde 9 — İyimser kilitleme (optimistic locking).
 *
 * "Giriş yapan herkes düzenler" ve akış `oku→değiştir→yaz` olduğundan, iki
 * kişi aynı anda düzenlerse biri diğerinin değişikliğini eziyordu
 * (last-write-wins). İstemci, düzenlemeye başladığı sürümü (`updatedAt`)
 * `x-base-version` başlığıyla gönderir; sunucudaki güncel sürümle uyuşmuyorsa
 * yazma reddedilir (409) ve kullanıcıdan yenilemesi istenir.
 * -------------------------------------------------------------------- */
export function versionMismatch(
  req: { headers: { get(k: string): string | null } },
  current: string
): boolean {
  const base = req.headers.get("x-base-version");
  return !!base && base !== current;
}

export async function saveFamilyData(
  userId: string,
  data: FamilyData,
  /**
   * Bu kaydetmeyi YAPAN hesabın kimliği (katkı akışı için). İsteğe bağlı:
   * yirmiden fazla çağıran var ve hepsinin kullanıcı bağlamı yok (ör. ağaç
   * kurulumu). Verilmezse akışta katkı "biri" olarak görünür, kayıt yine
   * tutulur.
   */
  opts: { by?: string } = {}
): Promise<void> {
  // Hedefli çift-yazma için: AYNI istekte okunmuş TAZE anlık görüntüyü yakala
  // (kaydetmeden önceki durum). Taze değilse (ör. önce okumayan demo yolu)
  // güvenli tam-yenilemeye düşeceğiz.
  const hit = cache.get(userId);
  const freshOldJson = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.json : null;

  // #11 — Güncelleme günlüğü: bu kaydın ÜZERİNE yazdığı ÖNCEKİ durumu geçmişe
  // ekle (geri alma için). Taze eski görüntü varsa onu kullan; yoksa Blob'dan
  // oku. Kişi listesi değişmediyse (ör. yalnız kapak) günlüğe eklemeyiz.
  try {
    let prevPeople: Person[] | null = null;
    if (freshOldJson) {
      prevPeople = (JSON.parse(freshOldJson) as FamilyData).people ?? null;
    } else {
      const meta = await readRawFromBlob(userId);
      prevPeople = meta?.people ?? null;
    }
    if (prevPeople && JSON.stringify(prevPeople) !== JSON.stringify(data.people)) {
      await pushHistorySnapshot(userId, prevPeople, opts.by);
    }
  } catch { /* günlük başarısız olursa kaydı ETKİLEMEZ */ }

  /*
   * KAPAK FOTOĞRAFINI KORU.
   *
   * `coverPhoto` ağaç düzeyinde bir ayar, kişi verisi değil. Ama yedi rota
   * kaydederken `{ people, updatedAt }` diye YENİ bir nesne kuruyor (kişi
   * birleştirme, toplu silme, aşılama, ağaç birleştirme, içe aktarma, YZ
   * çıkarımı); o nesnede kapak olmadığı için sessizce siliniyordu. Yani
   * hata bir rotada değil, DESENDE — sekizinci rota da aynı şekilde
   * yazılırdı.
   *
   * O yüzden düzeltme burada, tek yerde. Kural `keepCoverPhoto`da ve
   * birim testli: alan nesnede HİÇ YOKSA eskisi korunur ("bu konuda bir
   * şey söylemiyorum"), VARSA (değeri boş olsa bile) söylenen uygulanır
   * ("kaldır" da bir karardır).
   */
  if (shouldKeepCover(data)) {
    try {
      const onceki = freshOldJson
        ? (JSON.parse(freshOldJson) as FamilyData)
        : await readRawFromBlob(userId);
      if (onceki?.coverPhoto) data.coverPhoto = onceki.coverPhoto;
    } catch { /* okunamazsa kapak korunamaz; kayıt yine de geçerli */ }
  }

  data.updatedAt = new Date().toISOString();
  const json = JSON.stringify(data);
  await put(blobPathname(userId), json, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  // Yazdıktan sonra önbelleği tazele: aynı örnekteki sonraki okumalar güncel.
  cache.set(userId, { json, at: Date.now() });

  // Faz 2c/2e — çift-yazma (best-effort): Postgres'i de yaz. Blob kaynaktır;
  // Postgres yazması başarısız olursa kullanıcının kaydı ETKİLENMEZ. Taze eski
  // görüntü varsa YALNIZ değişen/silinen kişileri yaz (hızlı); yoksa tam yenile.
  // Ayna YANIT VERMEZSE kullanıcının kaydı asılı kalmasın diye süre sınırlı (#3).
  try {
    await withTimeout(
      (async () => {
        /*
         * SÜRÜM DAMGASI ÖNCE.
         *
         * Jeton artık `trees.updated_at` ile kişi damgalarının büyüğü
         * (`lib/version-stamp.ts`). Damgayı kişilerden ÖNCE yazıyoruz,
         * çünkü ayna yarıda kalabilir ve iki yarım durumun sonuçları eşit
         * değil:
         *
         * · damga yazıldı, kişiler yazılamadı → jeton veriden İLERİDE:
         *   elinde eski jeton olan istemci 409 alır, yenilemesi istenir.
         * · kişiler yazıldı, damga yazılamadı → jeton kişilerden türeyen
         *   değerle yine ilerler (büyüğü alınıyor), kayıp yok.
         *
         * Ters sıra üçüncü bir durum üretirdi: kişiler silinmiş ama jeton
         * eski — yani düzeltmeye çalıştığımız dirilme hatasının ta kendisi.
         */
        await dbSetTreeUpdatedAt(userId, data.updatedAt);
        if (freshOldJson) {
          const oldPeople = (JSON.parse(freshOldJson) as FamilyData).people ?? [];
          const { changed, removed } = diffPeople(oldPeople, data.people);
          if (changed.length) await dbUpsertPeople(userId, changed);
          if (removed.length) await dbDeletePeople(userId, removed);
        } else {
          await dbReplacePeople(userId, data.people);
        }
      })(),
      MIRROR_TIMEOUT_MS,
      "people→postgres"
    );
  } catch (e) {
    console.warn(`[cift-yazma] people→postgres (${userId}):`, (e as Error).message);
  }
}
