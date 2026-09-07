# Yedekleme ve Kurtarma

Aile verisi değerlidir; iki bağımsız yedek katmanı önerilir.

## 1) Vercel Blob — ana kaynak (anlık yedek)

Aile ağacı verisi (`family-data-<treeId>.json`), kimlik deposu (`users.json`)
ve kayıt/erişim JSON'ları Vercel Blob'da tutulur. Tümünü yerel diske indirmek
için:

```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... node scripts/backup.mjs
# → backups/<zaman-damgası>/ altına indirir
```

- Salt-okunur; hiçbir şeyi silmez/değiştirmez.
- Çıktı klasörünü güvenli bir yere (şifreli disk / özel depo) kopyalayın.
- Belge/medya (Cloudinary) ayrı barınır.

## 1b) Otomatik günlük görüntü (madde 46)

`/api/cron/backup` her gece 03:30 UTC'de koşuyor (`vercel.json`) ve depodaki
**her şeyi** `backups/<YYYY-AA-GG>/…` altına kopyalıyor. Varsayılan 14 günlük
görüntü saklanır.

**Canlıda doğrulandı (2026-09-05):** ilk koşu 10 dosya / 2.735.267 bayt
kopyaladı; bayt sayısı Blob panelinin bildirdiği depo boyutuyla (2,74 MB)
birebir örtüşüyor — yani yalnız dosya sayısı değil içerikleri de tam.

> **Özel depo tuzağı.** Bu depo `private`. Blob URL'ine düz `fetch` atılmaz;
> `get(pathname, { access: "private" })` gerekir. İlk sürüm bunu yanlış
> yapıyordu ve iş **200 dönerken sıfır dosya kopyalıyordu** (#252). Aynı hata
> `scripts/backup.mjs`te de vardı, yani aşağıdaki elle yedek komutu da hiçbir
> şey indirmiyordu. İkisi de düzeltildi ve `tests/backup-gate.test.mts` bu
> kuralı her iki dosya için kilitliyor.

**Neden ağaç verisinden fazlası.** `family-history-<treeId>.json` her ağacın
kişi listesinin geçmişini zaten tutuyor. Geçmişi **olmayan** blob'lar ise
şunlar ve en kritikleri onlar:

| Blob | Kaybı ne demek |
|---|---|
| `users.json` | Kimlik deposu — **herkes hesabını kaybeder**, dönülecek önceki sürüm yok |
| erişim kayıtları | Üyeler, davetler, paylaşım bağlantıları, eşleşmeler |
| ağaç kayıtları | Founder'ın ek ağaç listesi |

**Neyi korur, neyi korumaz.** Aynı depo içindeki kopya, gerçekleşmesi en olası
kayba karşı korur: uygulamanın kendi hatasıyla verinin bozulması ya da
silinmesi. **Deponun tamamının kaybına karşı korumaz** — onun için harici bir
hedef gerekir (aşağıda).

### Gereken ayarlar

| Değişken | Zorunlu | Varsayılan | Not |
|---|:-:|---|---|
| `CRON_SECRET` | **evet** | — | Yoksa uç **kapalı düşer** (401). Bu uç bütün depoyu okuyup yazdığı için "sır yoksa serbest" davranışı tek bir HTTP çağrısıyla deponun kopyalanması demek olurdu. |
| `BACKUP_KEEP_DAYS` | hayır | `14` | Kaç **günlük** görüntü saklanacağı (dosya değil gün: bir günün görüntüsü yüzlerce dosya olabilir). |

`CRON_SECRET` ayarlanmadan iş koşmaz — Vercel cron'u `Authorization: Bearer
<CRON_SECRET>` gönderir ve sır yoksa istek reddedilir. Bu bilinçli: yedeği
sessizce çalışmayan bir işe dönüştürmektense, görünür biçimde çalışmayan bir
işe dönüştürmek yeğdir.

### Silme kuralları

Yanlış silen bir yedek işi, hiç yedek almamaktan kötüdür. Karar mantığı
`lib/backup.ts`te ve birim testiyle kilitli:

1. `backups/` **dışındaki** hiçbir yol asla silinmez — canlı veri silme
   listesine giremez.
2. Damgası tanınmayan bir yedek yolu da silinmez (elle konmuş dosyalar dahil).
3. En az **bir** görüntü her zaman korunur; `BACKUP_KEEP_DAYS` sayı değilse
   de öyle (`Number(undefined)` → `NaN` yüzünden "hepsini sil"e dönüşmesin).
4. O koşuda **hiçbir dosya kopyalanamadıysa silme yapılmaz** — depo erişimi
   bozukken eski görüntüleri silmek elde hiç yedek bırakmamak olurdu.
5. **Doğrulama düştüyse de silme yapılmaz** (aşağıya bakın): yazdığını geri
   okuyamayan bir koşunun, elindeki eski görüntüleri atmaya hakkı yok.

### Doğrulama — yazdığını geri oku

`put` çağrısının dönmesi, dosyanın **okunabilir olduğunu kanıtlamıyor**. Bu
depoda tam olarak bu tür bir sessizlik bir kez yaşandı: iş her gün 200
dönüyordu ama `private` depoya düz `fetch` attığı için hiçbir dosya
kopyalanmıyordu — aylarca, ve dışarıdan bakınca yedek vardı. (Blob deposunda
`backups/` klasörünün hiç oluşmamasıyla anlaşıldı.)

Bu yüzden her koşu, yazdığı görüntülerden bir **örneği geri okuyor** ve JSON
olarak ayrıştırıyor. Örnek rastgele değil: önce `users.json` (kimlik deposu),
sonra ağaç verisi, kalan yer listenin başından. Rastgele seçim, kritik
dosyanın doğrulanmadığı koşular üretirdi.

Yalnız boy karşılaştırmak yetmez — yarım yazılmış ama doğru uzunlukta bir
dosya sağlam sayılırdı; bu yüzden içerik ayrıştırılıyor.

Günlükte: `[yedek] … doğrulanan N …`. Başarısızlık `GERİ OKUMA BAŞARISIZ`
ibaresiyle **uyarı** seviyesinde düşer.

### Ayna taraması

Yedeğin bir sonraki adımı, Blob (kaynak) ile Postgres (ayna) hâlâ aynı mı
diye bakıyor: kişi sayıları ve sürüm damgaları. Ayrışma varsa günlüğe
`[ayna] … AYRIŞMA: …` uyarısı düşüyor.

Tarama **onarmıyor** — onarım Blob'u kaynak alıp Postgres'te kayıt siliyor ve
kimsenin bakmadığı bir zamanlanmış işin böyle bir yetkisi olmamalı. Uyarıyı
gördüğünüzde `/admin/drift` sayfasını açın: orada kayıt kayıt, alan alan
karşılaştırma ve onarım düğmesi var.

Neden ayrı bir tarama: `/admin/drift` yalnız **elle**, yalnız giriş yapmış
founder'ın **kendi** ağaçları için çalışıyordu ve o düğmeyi kimse görmüyordu.
Yani ayrışma varsa da kimsenin haberi olmuyordu.

### Harici hedef (henüz yok)

Deponun tamamının kaybına karşı korunmak için `scripts/backup.mjs` çıktısını
bir CI işinde özel bir S3/R2 kovasına yükleyin. Bu karar (hedef + kimlik
bilgileri) **sizde**; kod tarafı hazır.

### Geri yükleme

Görüntüler `backups/<YYYY-MM-DD>/<özgün yol>` altında, **özgün yolu olduğu
gibi koruyarak** duruyor. Yani `family-data-t1.json`in 6 Eylül görüntüsü
`backups/2026-09-06/family-data-t1.json`. Geri yükleme, o dosyayı özgün yola
geri yazmak demek.

```bash
# Tek dosya (örnek: bir ağacın verisi)
node -e '
  const { get, put } = require("@vercel/blob");
  const [gun, yol] = process.argv.slice(1);
  (async () => {
    const r = await get(`backups/${gun}/${yol}`, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200) throw new Error("görüntü okunamadı");
    const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
    JSON.parse(buf.toString());            // bozuk dosyayı canlıya YAZMA
    await put(yol, buf, { access: "private", addRandomSuffix: false, allowOverwrite: true,
                          contentType: "application/json" });
    console.log("geri yüklendi:", yol, buf.length, "bayt");
  })();
' 2026-09-06 family-data-t1.json
```

`BLOB_READ_WRITE_TOKEN` ortamda olmalı. **Geri yüklemeden önce mevcut hâlin
bir kopyasını alın** — geri yükleme, aradaki değişiklikleri siler.

Postgres aynası bu yazımdan haberdar olmaz. Geri yükledikten sonra
`/admin/drift` sayfasından onarım çalıştırın; yoksa okuma yolu (önce
Postgres) eski veriyi göstermeye devam eder.

### Tatbikat — yılda en az bir kez

**Denenmemiş yedek, yedek değildir.** Yukarıdaki komut hiç çalıştırılmadıysa
çalışacağını kimse bilmiyor demektir; ve bunu öğrenmek için en kötü an, gerçek
bir kayıp anıdır.

Tatbikat, canlı veriye dokunmadan yapılabilir:

1. Bir test hesabı açın, birkaç kişi ekleyin.
2. Ertesi gün (yedek koştuktan sonra) o hesapta bir kişiyi silin.
3. Yukarıdaki komutla o ağacın bir önceki günkü görüntüsünü geri yükleyin.
4. `/admin/drift` → onarım.
5. Silinen kişi geri geldi mi?

Sonucu bu dosyaya tarihiyle not edin. Geçmiş tatbikatlar:

| tarih | sonuç | not |
|---|---|---|
| — | henüz yapılmadı | ilk tatbikat bekleniyor |

## 2) Supabase — veritabanı aynası

Çift-yazma ile `trees`/`people`/hesap tabloları Postgres'te aynalanır. Supabase
ücretli planlarda **otomatik günlük yedek** ve PITR sunar (panel > Database >
Backups). Manuel anlık görüntü için `pg_dump` kullanılabilir.

## 3) Kullanıcı tarafı dışa aktarım

Her kullanıcı kendi ağacını uygulama içinden **GEDCOM / CSV / JSON** olarak dışa
aktarabilir (üç-nokta menü > İçe/dışa aktar). Bu, kişisel bir yedek katmanıdır.

## Öneri

- **Günlük**: `scripts/backup.mjs` (Blob) + Supabase otomatik yedek.
- **Sürüm öncesi**: elle bir anlık yedek al.
- Medya (Cloudinary) için sağlayıcının kendi yedek/çoğaltma seçeneklerine bakın.

## Silme ile ilişkisi

Günlük yedek işi, yedeği aldıktan **sonra** bekleme süresi dolmuş ağaç ve
hesapları kalıcı olarak siliyor (`sweepExpired`). Yani kalıcı silinen verinin
son görüntüsü o günün yedeğinde durur ve saklama süresi (varsayılan 14 gün)
boyunca elle geri getirilebilir. Ayrıntı: `docs/SILME-VE-SAKLAMA.md`.
