# Yedekleme ve Kurtarma

Aile verisi değerlidir; iki bağımsız yedek katmanı önerilir.

## 0) Kullanıcıya verilen söz (madde 62)

Kullanım Şartları'na geçen taahhüt şu: **saklama süresine sınır yok + her an
tam dışa aktarım.** Ürün sahibinin kararı (2026-09-07); benim önerim "X yıl"
idi, süre sınırı koymamak tercih edildi.

Bu sözün ayakta durmasını sağlayan şey bu belgedeki katmanlar **değil** —
onlar bizim altyapımıza bağlı, dolayısıyla ömrümüz kadar ömürleri var.
Sözü taşıyan tek şey **kullanıcının kendi kopyası**: tek dosyalık HTML
yedeği (#318). Ağacın tamamı (kişiler, tarihler, ilişkiler, notlar) o
dosyanın içinde ve dosya bizden bağımsız açılıyor.

Pratik sonuç — **bu üçü bozulursa taahhüt de bozulur**, ve bozulduğu
hiçbir hata mesajından anlaşılmaz:

1. Dışa aktarım **koşulsuz** kalmalı: ücrete, plana, hesap durumuna ya da
   "önce şunu yap"a bağlanamaz. Bağlandığı an "her an" sözü düşer.
2. HTML yedeği **kendi kendine yeterli** kalmalı: dışarıdan yazı tipi,
   betik, resim çekiyorsa kullanıcının cihazında değil, bizim sunucumuzda
   duruyor demektir. Kapı: `tests/export-html-gate.test.mts`.
3. Yeni bir `Person` alanı eklendiğinde dışa aktarıma da eklenmeli. Yoksa
   veri sessizce kopyanın dışında kalır — sözü delen en olası yol bu,
   çünkü hiçbir test "eksik alan" diye bağırmaz.

Hizmet bir gün sonlandırılacaksa Şartlar'da verilen söz: **önceden duyuru +
o süre boyunca dışa aktarımın açık kalması.**

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

### Harici hedef — kapatıldı, yerine kullanıcı yedeği

Ayrı bir S3/R2 kovası düşünülmüştü; **yapılmayacak.** Yerine geçen çözüm
"3) Kullanıcı tarafı dışa aktarım" başlığındaki **tek dosyalık HTML yedeği**:
her ailenin tam kaydı, kendi cihazında, bizim altyapımızdan bağımsız.
Deponun tamamı kaybolsa bile veriyi elinde tutan kişi ailenin kendisi olur —
bir kovanın kimlik bilgilerini yönetmeye kıyasla hem daha ucuz hem daha
sağlam bir yer.

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

### Tatbikat — kapsamı daraltıldı

**Denenmemiş yedek, yedek değildir** — bu hâlâ doğru. Ama yukarıdaki Blob
geri yükleme komutu, günlük işleyişte beklenen kayıp senaryosu DEĞİL:

| senaryo | kurtaran mekanizma | tatbikat gerekir mi |
|---|---|---|
| yanlış ağacı sildim | 30 günlük bekleme süresi + "Geri getir" | hayır, uygulama içinde denenebilir |
| yanlış kişiyi sildim | geçmiş (`HistoryDialog`) → geri al | hayır |
| hesabımı sildim | 30 gün, girişte geri alma | hayır |
| kendi kopyamı istiyorum | HTML yedeği indir | hayır |
| deponun tamamı gitti | Blob görüntüsü + Supabase PITR | evet, ama nadir |

İlk dördü uygulamanın kendi akışları; hepsi düğmeye basılarak denenebiliyor
ve bir betik/kimlik bilgisi gerektirmiyor. Yıllık tatbikat yükümlülüğü bu
yüzden **yalnız son satır** için anlamlı; ve o senaryoda kullanıcı elindeki
HTML yedeğiyle zaten yalnız değil.

Bir tatbikat yapılırsa sonucu tarihiyle buraya not edin:

| tarih | sonuç | not |
|---|---|---|
| — | — | — |

## 2) Supabase — veritabanı aynası

Çift-yazma ile `trees`/`people`/hesap tabloları Postgres'te aynalanır. Supabase
ücretli planlarda **otomatik günlük yedek** ve PITR sunar (panel > Database >
Backups). Manuel anlık görüntü için `pg_dump` kullanılabilir.

## 3) Kullanıcı tarafı dışa aktarım — asıl yedek katmanı

Her kullanıcı kendi ağacını uygulama içinden dışa aktarabiliyor (üç-nokta menü
> İçe/dışa aktar): **HTML (yedek)**, GEDCOM 5.5.1 / 7 / GEDZIP, CSV, JSON,
Excel, Aile Kitabı.

**Varsayılan HTML ve sebebi var.** Öteki biçimlerin hepsi bir okuyucu istiyor:
GEDCOM bir soy ağacı programı, CSV bir hesap tablosu, JSON bir yazılımcı.
Kullanıcı dosyayı indirip klasöre attığında hiçbiri "aç ve bak" değil — ve
açılamayan bir dosya, kullanıcı için yedek sayılmıyor. HTML her işletim
sisteminde, her telefonda, kurulumsuz açılıyor.

Dosya aynı zamanda **geri yüklenebilir**: tam JSON, belgenin içinde
`<script type="application/json" id="soyagaci-veri">` bloğunda gömülü duruyor.
Tarayıcı bu türü çalıştırmadığı ve ekrana basmadığı için görünümü bozmuyor;
içe aktarma ucu ise aynı bloğu geri okuyor. Yani aynı dosya hem bakılan hem
geri yüklenen yedek. Üretim ve okuma tek dosyada (`lib/export-html.ts`) —
ayrı dosyalara düşselerdi biri değişince öteki sessizce kırılırdı.

Kapsam ve sınırlar:

- **Maskeleme yok.** `lib/privacy.ts` görüntü katmanı uygulanmıyor: maskeli
  bir yedekten maskeli bir ağaç geri gelir, yaşayanların tarihleri bir daha
  bulunamaz. Dosya zaten ağacı görebilen birinin eline geçiyor.
- **Fotoğraflar bağlantı olarak.** Cloudinary adresleri yazılıyor, gömülmüyor:
  yüzlerce görseli `data:` olarak gömmek dosyayı yüz megabaytlara çıkarır ve
  sunucusuz işlevin süresini aşar. Ağsız açıldığında metnin tamamı yerinde,
  eksik olan yalnız görseller.
- **Boyut**: 366 kişilik demo ağaç ≈ 690 KB.

Denetim: `tests/export-html.test.mts` (üretici + gidiş-dönüş + kaçış),
`tests/export-html-gate.test.mts` (uçtan uca zincir).

## Öneri

- **Günlük**: `scripts/backup.mjs` (Blob) + Supabase otomatik yedek.
- **Sürüm öncesi**: elle bir anlık yedek al.
- **Kullanıcıya**: HTML yedeğini ara sıra indirmesini söyleyin. Kurumsal
  yedeğin ulaşamadığı tek yer — kullanıcının kendi cihazı — burada kapanıyor.
- Medya (Cloudinary) için sağlayıcının kendi yedek/çoğaltma seçeneklerine bakın.

## Silme ile ilişkisi

Günlük yedek işi, yedeği aldıktan **sonra** bekleme süresi dolmuş ağaç ve
hesapları kalıcı olarak siliyor (`sweepExpired`). Yani kalıcı silinen verinin
son görüntüsü o günün yedeğinde durur ve saklama süresi (varsayılan 14 gün)
boyunca elle geri getirilebilir. Ayrıntı: `docs/SILME-VE-SAKLAMA.md`.
