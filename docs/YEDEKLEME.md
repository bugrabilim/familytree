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

### Harici hedef (henüz yok)

Deponun tamamının kaybına karşı korunmak için `scripts/backup.mjs` çıktısını
bir CI işinde özel bir S3/R2 kovasına yükleyin. Bu karar (hedef + kimlik
bilgileri) **sizde**; kod tarafı hazır.

### Geri yükleme
İndirilen JSON'lar aynı adlarla Blob'a geri yazılırsa (Vercel dashboard ya da
`@vercel/blob put`) durum eski haline döner. Geri yüklemeden önce mevcut hâlin
bir yedeğini alın.

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
