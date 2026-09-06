# Silme ve saklama

Ağaç ve hesap silmenin sunucu tarafı: ne siliniyor, ne kadar bekliyor, ne
KALIYOR.

## 1. Neden hemen silmiyoruz

Aile ağacı geri getirilemez bir içerik — kişiler, tarifler, mektuplar,
hikâyeler, yas ilanları; çoğunun başka kopyası yok. Buna karşılık "yanlış
ağacı sildim" kolay bir hata. Bu yüzden silme **iki aşamalı**:

1. **Yumuşak silme** — kayda `deletedAt` damgası konur. Ağaç/hesap her
   yüzeyden düşer, veri **durur**.
2. **Kalıcı silme** — `GRACE_DAYS` (bugün **30**) gün sonra zamanlanmış iş
   envanterdeki her şeyi gerçekten yok eder.

Süre ve "sırası geldi mi" kararı tek yerde: `lib/retention.ts`. Testler de
sayıyı oradan okur; hiçbir yere elle 30 yazılmaz.

Ağacın **içindeki** değişiklik geçmişi için ayrı bir saklama süresi yok: ağaç
yaşadığı sürece geçmişi de yaşar, ağaç kalıcı silinince geçmiş de gider.

## 2. Uç noktalar

| Uç | Gövde | Yanıt |
| --- | --- | --- |
| `DELETE /api/trees` | `{ treeId }` | `200 { success, deletedAt, purgeAt, daysLeft }` |
| `POST /api/trees/restore` | `{ treeId }` | `200 { success, tree }` |
| `POST /api/account/delete` | `{ password, confirm }` | `200 { ok, deletedAt, purgeAt, daysLeft, graceDays }` |
| `POST /api/account/restore` | `{ familyName, password }` | `200 { ok, restoredFrom }` |
| `GET /api/trees` | — | `{ trees, deleted[], graceDays, activeTreeId }` |

Ortak hata kodları: `400` (geçersiz istek / onay eşleşmedi / bulunamadı),
`403` (sahibi değil, demo hesabı, şifre yanlış), `429` (oran sınırı).

**`207`**: işlem yapıldı ama bir yol geride kaldı — yanıt `failed: string[]`
taşır. Yarım kalan bir gizleme/silme sessizce `200` dönmemeli; kullanıcı
"her şey kapandı" sanır.

Kalıcı silme kullanıcıya **açılmıyor**: tek tetikleyici zamanlanmış iş.

### Kurallar

- **Ana ağaç (`treeId === accountId`) silinemez.** Onu silmek hesabı silmektir;
  o akış ayrı ve şifre ister.
- **Hesap silme şifre + onay ister.** Şifre "sen misin" (çalınmış çerez),
  `confirm` alanına birebir yazılan aile adı "ne yaptığının farkında mısın"
  (dalgınlık) sorusunun yanıtı. Üye şifresi kabul edilmez.
- **Demo hesabı silinemez** (`lib/demo-account.ts`) — herkese açık ortak oyun
  alanı. Kapı hem uçta hem `lib/account-lifecycle.ts`te.
- **Oran sınırı** her iki hesap ucunda da var; geri alma ucu oturumsuz olduğu
  için iki kovalı (IP + ağaç adı).
- **Dışa aktarma** silmeden önce çalışır: `GET /api/family/export`
  (gedcom/gedcom7/gedzip/csv/json/xlsx). Silmeden **sonra** çalışmaz, oturum
  kapanır — arayüz bu yüzden dışa aktarmayı silme akışının içinde öneriyor.

## 3. Bekleme süresinde ne oluyor

| Yüzey | Durum | Yer |
| --- | --- | --- |
| Ağaç listesi / ağaç değiştirme | kapalı | `lib/trees.ts` |
| Oturum çözümü (`resolveActiveTree`) | kapalı | `lib/tree-context.ts` |
| Giriş (kurucu ve üye) | kapalı | `lib/credentials.ts` |
| Paylaşım bağlantısı `/g/<jeton>`, `/embed`, genel API | kapalı | `lib/members.ts` |
| Davet bağlantısı ve davetle katılma | kapalı | `lib/members.ts` |
| Eşleşmiş ağaç görünümü, aşılama, birleştirme | kapalı | `lib/members.ts` |
| RSVP ve hikâye bağlantıları | kapalı | ilgili `[treeId]` rotaları |
| İletişim onay/çıkış jetonu | kapalı | `lib/contact-lookup.ts` |
| Günlük hatırlatma/bülten postası | gönderilmez | `app/api/cron/reminders` |

Damga **iki yerde** duruyor ve ikisi tek işlevden yazılıyor:

- hesabın ağaç kaydı (`account-trees-<accountId>.json`) — sahibin listesi ve
  yetki çözümü,
- ağacın kendi erişim dosyası (`tree-access-<treeId>.json`) — elinde yalnız
  `treeId` olan yüzeyler (paylaşım, davet, RSVP…) sahibin kim olduğunu
  bilmiyor.

Ayrışmaları hâlinde ortaya "yarı gizlenmiş ağaç" çıkar: kullanıcı sildiğini
sanır, bağlantı hâlâ açılır. `tests/soft-delete-gate.test.mts` bu kapsamı
kilitliyor ve yeni bir `[treeId]` rotası eklendiğinde kendiliğinden kırılıyor.

### Bilinerek yapılmayanlar

- **Aile adı bekleme süresince serbest bırakılmıyor.** Silinmiş hesabın adıyla
  yeni kayıt açılamaz; geri alma o adın hesapta kalmasına bağlı.
- **Şifre sıfırlama açık kalıyor.** Geri alma şifre istiyor; sıfırlamayı da
  kapatsaydık şifresini unutmuş kullanıcı hesabını 30 gün sonra kalıcı olarak
  kaybederdi. Sıfırlama sonrası giriş yine açılmaz — kullanıcı
  `POST /api/account/restore` yolundan geçer.
- **Var olan oturumlar en fazla birkaç saniye yaşar.** `isAccountDeleted`
  kısa ömürlü bir önbellek kullanıyor (`lib/users.ts`); her istekte hesap
  listesini indirmemek için. Pencere yalnız hesabın kendi oturumuna açık.

## 4. Kalıcı silmede ne gidiyor

### Blob (envanter: `lib/tree-storage.ts`)

Ağaç başına: `family-history-`, `tree-access-`, `recipes-`, `letters-`,
`obituaries-`, `gatherings-`, `bonds-`, `stories-`, `proposals-`,
`family-data-` (+`<treeId>.json`). Hesap başına ayrıca
`account-trees-<accountId>.json` ve `users.json` içindeki satır.

Envanter elle yazılmış; eksik kalmasını `tests/tree-storage-gate.test.mts`
engelliyor: `lib/` ve `app/api/` altında geçen her `` `<önek>-${…}.json` ``
yolu envanterde karşılığını bulmak zorunda.

### Postgres — hangisi cascade, hangisi açık

| Tablo | Nasıl |
| --- | --- |
| `trees` | **açıkça** silinir (`id = treeId`, ayrıca `owner_account = accountId`) |
| `people` | cascade (`trees(id) on delete cascade`) |
| `tree_members` | cascade |
| `tree_invites` | cascade |
| `accounts` | **açıkça** silinir |
| `rate_limits` | **açıkça** silinir (anahtarın içinde hesap kimliği geçiyor) |

`trees.owner_account` hesabı işaret ediyor ama **yabancı anahtar değil** —
yani `accounts` satırını silmek ağaçları silmez. FK cascade'e körlemesine
güvenmemenin gerekçesi bu; kaldırılan misafir girişinden arta kalan yetim bir
`accounts` satırı zaten yaşanmış bir örnek.

### Supabase Auth

`auth.users` kaydı `deleteAccountAuthUser` ile siliniyor (idempotent; kullanıcı
yoksa hata değil).

## 5. NE KALIYOR

- **Cloudinary'deki medya kalır.** Fotoğraf, ses, video, belge silinmiyor.
  Sebep: kayıtlarda yalnız `secure_url` var, silme için `public_id` gerekiyor
  ve URL'den türetmek dönüşüm/sürüm ekleri yüzünden güvenilir değil — yanlış
  türetilen bir kimlik başka bir ağacın medyasını silebilir. Ayrıca aynı URL
  aşılama/birleştirme sonrası birden çok ağaçta geçebiliyor. Kullanıcıya
  "her şey silindi" denirken bu istisna bilinmeli.
- **Yedekler bir süre daha taşır.** Günlük yedek (`app/api/cron/backup`)
  deponun tamamını `backups/<gün>/` altına kopyalıyor ve varsayılan saklama
  14 gün. Kalıcı silme yedekten SONRA koştuğu için silinen verinin son
  görüntüsü yedekte durur; elle geri getirme penceresi budur, sonra o da
  düşer.
- **Silinemeyen yollar.** `207` yanıtındaki `failed` listesi ve sunucu
  günlüğündeki `[silme] / [hesap-silme] / [temizlik]` satırları. Bir sonraki
  temizlik koşusu aynı işi yeniden dener (damga duruyor, koşu idempotent).

## 6. Kalıcı silmeyi kim tetikliyor

`app/api/cron/backup` — **günlük yedeğin son adımı** (`sweepExpired`).

Ayrı bir cron **eklenemiyor**: Vercel Hobby planında proje başına en fazla iki
zamanlanmış iş var ve ikisi de dolu (`reminders`, `backup`). Aynı kısıt aylık
bülteni de günlük işin içine sokmuştu. Plan yükseltilirse `sweepExpired`
olduğu gibi ayrı bir işe taşınabilir.

Sıra önemli: **önce yedek, sonra temizlik**. Ters sırada silinen ağacın son
yedeği hiç alınmamış olurdu.
