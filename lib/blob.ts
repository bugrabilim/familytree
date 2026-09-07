import { withTimeout, MIRROR_TIMEOUT_MS } from "@/lib/with-timeout";
import { normalizeStamp } from "@/lib/version-stamp";
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

/**
 * OKUNAMAYAN DOSYA, BOŞ DOSYA DEĞİLDİR.
 *
 * Bu ayrım bu depoda yedi yan depoda bulunup düzeltildi ve bir testle
 * kilitlendi — ama kapı kapsamını `lib/*-store.ts` DOSYA ADI kalıbıyla
 * tanımlıyordu ve asıl veri o kalıba girmiyordu. Yani hatanın en pahalı
 * hâli tam da burada, ağacın kendisinde kalmıştı.
 *
 * Neden pahalı: uygulama akışı `oku → değiştir → yaz`. Geçici bir okuma
 * hatasında boş dönmek, kullanıcıya ağacını BOŞ göstermek ve bir sonraki
 * kaydetmede o boşluğu diske basmaktır. Kimse hata görmez; veri gider.
 *
 * Kural: dosya GERÇEKTEN yoksa (`blobs.length === 0`) boş — yeni hesapta
 * doğru olan bu. "Var ama okuyamadım" ise HATA ve yükselir.
 */
async function readFromBlob(userId: string): Promise<FamilyData> {
  const key = blobPathname(userId);
  const { blobs } = await list({ prefix: key });
  if (blobs.length === 0) return emptyData();
  const latest = blobs.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0];
  const result = await get(latest.pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200)
    throw new Error(`aile verisi okunamadı (HTTP ${result?.statusCode ?? "yanıt yok"})`);
  const text = await new Response(result.stream).text();
  /*
   * ÖNBELLEK AYRIŞTIRMADAN SONRA.
   *
   * Önce önbelleğe yazılıyordu: bozuk bir JSON geldiğinde `JSON.parse`
   * fırlatıyor ama BOZUK METİN önbellekte kalıyordu. Sonraki dört saniye
   * boyunca aynı ağaç, aynı bozuk metinden okunmaya çalışılıyor ve istek
   * istek 500 ile boş arasında gidip geliyordu.
   */
  const data = JSON.parse(text) as FamilyData;
  cache.set(userId, { json: text, at: Date.now() });
  return data;
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

/**
 * SALT BLOB okuma — Postgres'e hiç bakmaz. Yoksa `null`.
 *
 * `getFamilyData` Faz 2d'den beri ÖNCE Postgres'e bakıyor. Bu, uygulamanın
 * okuma yolu için doğru; ama iki iş için YANLIŞ, çünkü ikisi de tam olarak
 * "Blob ne diyor" sorusunu soruyor:
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
     * AYNASI GERİDE KALMIŞ AĞAÇ, KÜÇÜLMÜŞ AĞAÇ DEĞİLDİR.
     *
     * Okuma yolu Faz 2d'de Postgres'e döndü ama yazma yolu değişmedi:
     * rota OKUDUĞUNU değiştirip Blob'a yazıyor. Yani ayna eksik döndüyse o
     * eksiklik bir sonraki kaydetmede KAYNAĞA geçiyor — Blob artık "canlı
     * yedek" değil, aynanın kopyası. Çift-yazma en iyi çaba ve 4 sn zaman
     * aşımlı olduğu için kısmi ayna beklenen bir durum, kaza değil.
     *
     * Önceki koruma yalnız "Postgres 0 kişi" hâlini yakalıyordu; 300
     * kişiden 297'si gelen bir aynayı hiç görmüyordu ve o üç kişi ilk
     * kaydetmede kalıcı olarak siliniyordu.
     *
     * Blob ZATEN OKUNUYOR — kapak fotoğrafı Postgres'te tutulmadığı için
     * (`readRawFromBlob`). Yani karşılaştırma bedava; eskiden boş ağaçta
     * dosya İKİ KEZ okunuyordu, şimdi bir kez.
     *
     * İki sinyal var ve ikisi de "ayna geride" demek; ayna güncelken
     * hiçbiri doğru olamaz:
     *   · Blob'un damgası Postgres jetonundan YENİ,
     *   · Blob'da DAHA ÇOK kişi var.
     * Damga karşılaştırması eski (hiç damgalanmamış) ağaçlarda anlamsız
     * olduğu için sayı karşılaştırması onun kör noktasını kapatıyor.
     *
     * Ters yön (Postgres'te fazla kişi = yayılmamış silme) bu koruma
     * ALTINDA DEĞİL: orada hangi tarafın haklı olduğunu okuma anında
     * bilemiyoruz ve yanlış tahmin silinmiş kişiyi diriltir. Onun yeri
     * kayma denetimi (`/admin/drift`).
     */
    if (fromDb) {
      let yedek: FamilyData | null = null;
      try {
        yedek = await readRawFromBlob(userId);
      } catch { /* Blob okunamadıysa elimizdeki Postgres sonucuyla devam */ }

      if (yedek) {
        // Blob-only meta'yı (kapak fotoğrafı) birleştir — DB bunu tutmaz.
        if (yedek.coverPhoto) fromDb.coverPhoto = yedek.coverPhoto;

        const damgaYeni =
          normalizeStamp(yedek.updatedAt) > normalizeStamp(fromDb.updatedAt);
        const kisiFazla = (yedek.people?.length ?? 0) > fromDb.people.length;
        if (damgaYeni || kisiFazla) {
          /*
           * Gürültülü — sessiz kalması sorunu bulunamaz kılardı. Hangi
           * sinyalin yandığı da yazılıyor: damga farkı bir yazma
           * hatasını, kişi farkı kısmi bir aynayı işaret eder.
           */
          console.error(
            `[ayna-geride] ${userId}: Blob ${yedek.people?.length ?? 0} kişi/${yedek.updatedAt}, ` +
              `Postgres ${fromDb.people.length} kişi/${fromDb.updatedAt} — ` +
              `Blob kullanıldı (${damgaYeni ? "damga" : ""}${damgaYeni && kisiFazla ? "+" : ""}${kisiFazla ? "kişi" : ""})`
          );
          cache.set(userId, { json: JSON.stringify(yedek), at: Date.now() });
          return yedek;
        }
      }
      cache.set(userId, { json: JSON.stringify(fromDb), at: Date.now() });
      return fromDb;
    }
  } catch (e) {
    console.warn(`[okuma] postgres→blob yedek (${userId}):`, (e as Error).message);
  }
  /*
   * SON ÇARE DE BOŞ DÖNMÜYOR.
   *
   * Buradaki `catch` her hatayı boş ağaca çeviriyordu ve bu, yukarıdaki
   * kuralı tek satırda iptal ediyordu: Postgres de Blob da okunamadığında
   * kullanıcı ağacını boş görüyor, bir şey kaydettiğinde de o boşluk diske
   * iniyordu.
   *
   * Artık hata yükseliyor: sayfa 500 verir. Çirkin ama DOĞRU — "ağacınız
   * boş" demek, okuyamadığımız bir ağaç için söylenebilecek en kötü yalan.
   * Hiç kaydı olmayan yeni hesap yine boş dönüyor; o yol `readFromBlob`
   * içinde `blobs.length === 0` ile ayrılmış durumda.
   */
  return await readFromBlob(userId);
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
  opts: {
    by?: string;
    /**
     * GERİ ALMA GÜNLÜĞÜNE YAZMA.
     *
     * Günlük 50 görüntüyle sınırlı ve amacı KULLANICININ kendi
     * düzenlemelerini geri alabilmesi. Ama bazı yazmalar kullanıcının
     * düzenlemesi değil: bir üçüncü kişinin postadaki bağlantıya tıklayıp
     * onay/ret vermesi (`lib/contact-lookup.ts`) ya da hatırlatma işinin
     * gönderdiği soruyu işaretlemesi (`app/api/cron/reminders`).
     *
     * Bunlar günlüğe yazıldığında iki zarar birden veriyordu: sınırlı geri
     * alma yuvasını tüketip kullanıcının GERÇEK bir düzenlemesini ringden
     * düşürüyor, ve katkı akışında hiç yapılmamış bir "düzenleme" gösteriyor
     * ("biri bir şey değiştirdi" — kimse değiştirmedi).
     *
     * Kaydın kendisi yine yapılıyor; yalnız geçmişe yazılmıyor.
     */
    skipHistory?: boolean;
  } = {}
): Promise<void> {
  // Hedefli çift-yazma için: AYNI istekte okunmuş TAZE anlık görüntüyü yakala
  // (kaydetmeden önceki durum). Taze değilse (ör. önce okumayan demo yolu)
  // güvenli tam-yenilemeye düşeceğiz.
  const hit = cache.get(userId);
  const freshOldJson = hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.json : null;

  // #11 — Güncelleme günlüğü: bu kaydın ÜZERİNE yazdığı ÖNCEKİ durumu geçmişe
  // ekle (geri alma için). Taze eski görüntü varsa onu kullan; yoksa Blob'dan
  // oku. Kişi listesi değişmediyse (ör. yalnız kapak) günlüğe eklemeyiz.
  if (!opts.skipHistory) try {
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
        /*
         * Damga hatası KİŞİ AYNASINI DÜŞÜRMEMELİ.
         *
         * İlk hâlinde çağrı çıplaktı ve bu blok tek bir `async` gövde:
         * damga çağrısı hata verirse gövde orada reddediyor ve ALTINDAKİ
         * kişi yazmaları hiç çalışmıyordu. Yani #287'den sonra bütün ayna,
         * tek bir sütunun varlığına bağlanmış oldu — ve `supabase/schema.sql`
         * o sütunu taşımadığı için bu dosyadan kurulmuş her ortamda ayna
         * sessizce tümüyle ölürdü (şema da bu turda düzeltildi).
         *
         * Damga hâlâ ÖNCE deneniyor (sıranın gerekçesi aşağıda duruyor),
         * ama artık kendi kapsülünde: düşerse gürültüyle günlüğe geçiyor ve
         * kişiler yine yazılıyor.
         */
        let damgaDustu = false;
        try {
          await dbSetTreeUpdatedAt(userId, data.updatedAt);
        } catch (e) {
          damgaDustu = true;
          console.warn(`[cift-yazma] damga→postgres (${userId}):`, (e as Error).message);
        }
        if (freshOldJson) {
          const oldPeople = (JSON.parse(freshOldJson) as FamilyData).people ?? [];
          const { changed, removed } = diffPeople(oldPeople, data.people);
          if (changed.length) await dbUpsertPeople(userId, changed, data.updatedAt);
          if (removed.length) await dbDeletePeople(userId, removed);
        } else {
          await dbReplacePeople(userId, data.people, data.updatedAt);
        }
        /*
         * Damga düştüyse kişiler yazıldıktan SONRA bir kez daha denenir.
         *
         * Geçici bir hatada jeton yine ilerlesin diye: damgasız kalan bir
         * kaydetmede jeton kişilerden türeyen değere düşüyor ve o değer bir
         * SİLMEDE geriye gidebiliyor — düzeltmeye çalıştığımız dirilme
         * hatasının penceresi. İkinci deneme de düşerse yapacak bir şey yok;
         * o zaman en azından iki satır günlük var.
         */
        if (damgaDustu) {
          try {
            await dbSetTreeUpdatedAt(userId, data.updatedAt);
          } catch (e) {
            console.warn(`[cift-yazma] damga→postgres ikinci deneme (${userId}):`, (e as Error).message);
          }
        }
      })(),
      MIRROR_TIMEOUT_MS,
      "people→postgres"
    );
  } catch (e) {
    console.warn(`[cift-yazma] people→postgres (${userId}):`, (e as Error).message);
  }
}
