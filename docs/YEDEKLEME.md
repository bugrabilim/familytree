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
- Otomatikleştirme: bir cron/CI işinde günlük çalıştırıp çıktıyı özel bir S3/R2
  kovasına yükleyebilirsiniz. Belge/medya (Cloudinary) ayrı barınır.

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
