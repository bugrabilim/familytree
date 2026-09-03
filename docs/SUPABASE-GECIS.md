# Supabase'e Geçiş Planı

Bu belge, Soy Ağacı'nın veri ve kimlik katmanının **Vercel Blob + NextAuth**'tan
**Supabase (Postgres + Auth)**'a kademeli geçişini tanımlar. Amaç: her aşamada
uygulama çalışır ve **hiçbir kullanıcı erişimini kaybetmeden** ilerlemek.

> **Neden Supabase?** Gerçek (sorgulanabilir, ilişkisel) veritabanı + e-posta ile
> giriş + ileride hesapsız (anonim) girişi e-postayla kalıcı hesaba bağlama —
> hepsi tek serviste. Fotoğraf/ses için **Cloudinary kalır**.

## İlkeler

- **Kayıpsız kimlik.** Mevcut tüm kimlikler (`treeId`, `personId`, üye id'leri)
  aynen korunur. Ana ağacın kimliği founder hesabının kimliğine eşittir
  (`treeId === accountId`) — bu değişmez. Şema bu yüzden `text` kimlik kullanır.
- **Kesintisiz giriş.** Auth geçişi, mevcut *soyad + şifre* girişini bir anda
  kırmadan yapılır (bkz. Faz 3).
- **Adımlı ve geri alınabilir.** Her faz ayrı PR; önce yaz-çift (dual-write),
  sonra okumayı çevir, en son eski yolu kaldır.

---

## Faz 1 — Temel (bu PR)

Yalnız altyapı; hiçbir mevcut rota değişmez, uygulama tümüyle Blob üzerinde
çalışmaya devam eder.

- `supabase/schema.sql` — tablolar: `trees`, `people`, `tree_members`,
  `tree_invites`. RLS açık, politika yok (tüm erişim sunucudan servis-rolüyle).
- `lib/supabase.ts` — sunucu-taraflı servis-rolü istemcisi (`server-only`).
- `@supabase/supabase-js` bağımlılığı.

**Senin yapman gereken:** Supabase panelinde **SQL Editor → `schema.sql` → Run**.

## Faz 2 — Veri katmanı geçişi (DB + veri)

- `lib/db.ts` — kişileri/ağaçları/üyeleri Postgres'ten okuyup yazan tipli katman.
- **Tek seferlik göç**: yönetici-only `/api/admin/migrate` — mevcut Blob verisini
  (ağaç kaydı, family-data, tree-access) Postgres'e kopyalar. İdempotent.
- **Çift yazma** (kısa süre): yazma hem Blob'a hem Postgres'e gider; okuma
  Postgres'ten. Sorun çıkarsa Blob'a anında dönülür.
- Doğrulama sonrası okuma/yazma tümüyle Postgres; Blob veri katmanı kaldırılır
  (Blob yalnız gerekiyorsa dosya için kalır — fotoğraf/ses zaten Cloudinary'de).

## Faz 3 — Supabase Auth'a geçiş (kademeli, kesintisiz)

**Anahtar bulgu:** GoTrue admin API'si hazır **bcrypt hash** ile kullanıcı içe
aktarmayı destekliyor (`password_hash`; bcrypt/scrypt/argon2). Yani mevcut
hesapları **düz-metin şifreye gerek olmadan** Supabase Auth'a taşıyabiliyoruz —
girişte "tembel backfill" gerekmez, giriş hot-path'i hiç değişmez.

Kimlik kayıpsız: accountId zaten bir UUID olduğundan auth kullanıcısının id'si
ona eşitlenir → `auth.users.id === accounts.id === treeId`. GoTrue e-posta
zorunlu tuttuğu için her hesaba **sentetik iç e-posta** (`<accountId>@…`)
verilir; bu adrese e-posta gönderilmez (Faz 3e'de gerçek e-postayla değişir).

- **Faz 3a — hesap aynası (bitti):** founder hesapları `accounts` tablosuna
  çift-yazılır. Giriş değişmedi.
- **Faz 3b — Auth'a içe aktarım (bu PR):** yönetici göç aracı, hesabı mevcut
  bcrypt hash'iyle Supabase Auth'a **aktarır** (`lib/auth-users.ts`). Giriş
  akışına HİÇ dokunulmaz — giriş hâlâ Blob/Postgres bcrypt ile doğrulanır; bu
  adım yalnız arka planda Auth kullanıcısını hazırlar (idempotent, best-effort).
  Göç önizlemesi/sonucu her hesabın Auth durumunu gösterir.
- **Faz 3c — giriş doğrulamasını çevir (bu PR):** `authorize()` **bayrak
  açıksa** önce Supabase `signInWithPassword(sentetikEposta, şifre)` dener;
  yalnız temiz doğrulamada kabul eder, aksi hâlde mevcut **bcrypt** yoluna
  düşer (yedek — kimse kilitlenmez). Oturum/rol modeli aynı kalır.
  - **Bayrak:** `SUPABASE_AUTH_LOGIN=1` (varsayılan kapalı → davranış bugünküyle
    bire bir; değişkeni kaldırmak anında geri alır). 5 sn zaman aşımı → bcrypt.
  - **Senkron:** parola sıfırlama artık Supabase Auth şifresini de günceller
    (düz-metinle) → sıfırlanmış eski şifre Supabase üzerinden kabul edilemez.
    Yeni kayıtlar da otomatik Auth'a aktarılır.
  - **Ön koşullar (bayrağı açmadan önce):** (1) Supabase → Authentication →
    Providers → **Email açık**; (2) `NEXT_PUBLIC_SUPABASE_ANON_KEY` mevcut;
    (3) hesaplar göç aracıyla Auth'a aktarılmış (3b).
- **Faz 3d — hesapsız (misafir) giriş (bitti):** kayıt olmadan denemek için
  kişiye özel, geçici, SAHİPLENİLEBİLİR bir ağaç (`lib/guest.ts`).
  - **Demo değil.** Demo herkese açık ve PAYLAŞIMLI tek bir ağaç; misafir
    ağacı kişiye özel. Karıştırmak birinin denediği veriyi başkasına
    göstermek olurdu.
  - **Asıl tehlike ölçülen yüzeyler.** Misafir hesabı sınırsız üretilebiliyor
    ve bu depodaki sınırların çoğu HESAP BAŞINA. AI ya da yükleme misafire
    açık bırakılsaydı kota diye bir şey kalmazdı — saldırgan her çağrı için
    yeni hesap açardı. Kapalı liste bu yüzden iki başlıkta: **ölçülen**
    (AI, yükleme) ve **kendi ağacının dışına uzanan** (davet, paylaşım,
    eşleştirme, etkinlik/RSVP, e-posta bağlama). Açık kalanlar: kendi
    ağacında ekle/düzenle/görüntüle/dışa aktar.
  - **Bayrak zinciri.** `isGuest` altı duraktan geçiyor: User → SessionUser →
    JWT → session → TreeContext → rota. Herhangi birinde düşerse misafir
    sessizce tam yetki kazanır ve hiçbir hata vermez; `tests/guest-gate.test.mts`
    her durağı ayrı denetliyor. Okuma her yerde `=== true` — bayrağın yokluğu
    "gerçek hesap" demek.
  - **Sahiplenme** (`/api/guest/claim`) kayıt kurallarının aynısını uygular
    (ad ≥ 2 ve benzersiz, şifre ≥ 6): "arka kapıdan kayıt" olduğu için ondan
    gevşek olamaz.
- **Faz 3e — gerçek e-posta ile bağlama (bitti):** hesaba KİMLİK e-postası
  bağlanır (`lib/account-email.ts`, `/api/account/email`). `notifyEmail`den
  AYRI bir alan — o bildirim adresi, bu hesabı geri almanın yolu; güven
  eşikleri aynı olmadığı için birleştirilmedi.
  - **İki kural.** (1) Doğrulanmamış adres asla kurtarma yolu değildir
    (`canRecoverByEmail` — madde 51 bunu tek kapı olarak kullanacak).
    (2) Adres değişince doğrulama sıfırlanır; yoksa kullanıcı kendi adresini
    doğrulayıp başkasınınkiyle değiştirerek doğrulanmış bir yabancı adres
    elde ederdi.
  - **Tekillik doğrulamada zorlanır**, bağlamada değil: birinin yazım hatası
    gerçek sahibin adresini kilitlememeli.
  - **Supabase tarafı:** adres yazma `email_confirm` GÖNDERMEZ; onay ayrı bir
    işlevde (`confirmAccountAuthEmail`), yalnız doğrulama tamamlanınca.
  - **Teslimat 54'e bağlı.** Jeton üretilip saklanıyor ama e-posta sağlayıcısı
    olmadan gönderilemiyor; uç `deliverable: false` döndürüyor ve arayüz
    "gönderildi" demiyor. Sağlayıcı gelince hiçbir kod değişmeden çalışır.

## Kayma denetimi (K4/43) — Faz 4'ün ön koşulu

Faz 4'ün geri dönüşü yok: okuma yolu Postgres'e döndükten ve `users.json`
emekliye ayrıldıktan sonra Blob'a geri düşmek yok. Bu yüzden ondan önce
"iki kaynak hâlâ aynı" cümlesini KANITLAYABİLİYOR olmak gerekiyor.

`/api/admin/migrate` GET'teki `inSync` bunu kanıtlamıyordu: kişi
**sayısını** karşılaştırıyordu. Sayı eşitliği eşitlik değildir — bir kişi
eklenip başkası silindiğinde sayı aynı kalır; bir kaydın ölüm tarihi ya da
ebeveyn bağı Postgres'te eski kalırsa sayıya hiç yansımaz.

**`/admin/drift`** (uç: `/api/admin/drift`, çekirdek: `lib/drift.ts`) iki
ayrı kayma türüne ayrı ayrı bakar:

| Tür | Ne | Neden önemli |
|---|---|---|
| `eksik` | Blob'da var, Postgres'te yok | DB geride; okuma dönünce kişi kaybolur |
| `fazla` | Postgres'te var, Blob'da yok | **Silme yayılmamış**; okuma dönünce silinen kişi geri gelir |
| `farkli` | İkisinde de var, alanlar ayrışmış | Sessiz; sayıya hiç yansımaz |
| sütun kayması | Satırın `first_name`/`birth_date`… sütunları kendi `data`sıyla çelişiyor | Faz 4 sorguları bu sütunlardan süzüp sıralar; `data` doğru olsa bile okuma yanlış olur |

- **GET** denetler, hiçbir şey yazmaz (`?full=1` tam liste).
- **POST** onarır: Blob **kaynak**, yalnız Postgres hizaya getirilir
  (`dbUpsertPeople` / `dbDeletePeople` ile hedefli — göçün "hepsini sil,
  hepsini yaz" davranışı değil). Blob'a dokunulmaz. Postgres'te hiç olmayan
  ağaç onarılmaz, "önce göç edin" denir — göç ile denetim ayrı işler.
- Rapor içerik sızdırmaz: gizli gruptaki alanlar ve `confidential` kayıtlar
  için yalnız hangi alanın ayrıştığı ve değerin uzunluğu döner.
- Göç edilmemiş ağaç **temiz sayılmaz**; okunamayan ağaç da temiz sayılmaz.

Faz 4'e geçmeden önce beklenen durum: **her ağaç için `clean: true`.**

---

## Faz 4 — Eski yolu kaldırma (temizlik)

Faz 3c–3e oturduktan, tüm hesaplar Supabase Auth'a taşındıktan **ve kayma
denetimi her ağaç için temiz döndükten** sonra:

- NextAuth Credentials bcrypt yedeği kaldırılır (giriş tümüyle Supabase Auth).
- Blob tabanlı `users.json` kimlik deposu emekliye ayrılır (veri zaten
  Postgres + Auth'ta). Blob yalnız gerekiyorsa dosya için kalır.

---

## Ortam değişkenleri (Vercel-Supabase entegrasyonu enjekte eder)

| Değişken | Kullanım |
|---|---|
| `SUPABASE_URL` | Sunucu istemcisi (proje URL'i) |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | Sunucu servis-rolü (gizli) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | İstemci (Faz 3+ auth) |
| `POSTGRES_URL`, `POSTGRES_PRISMA_URL` | Doğrudan Postgres bağlantısı (gerekirse) |

`lib/supabase.ts` bu adları sırayla dener; sürüm farklarına dayanıklıdır.
İstemci-taraflı auth (Faz 3) için `NEXT_PUBLIC_SUPABASE_URL` gerekebilir — o
aşamada elle eklenir.


## Paylaşımlı hız sınırı (K4/33)

`lib/rate-limit.ts` örnek-içi bellekte çalışıyordu. Sunucusuz ortamda her
örneğin kendi kovası olduğu için bu **gerçek bir sınır değildi**: yeterince
örnek varsa bir istemci sınırın katları kadar istek geçirebiliyordu. Oysa
korumaya çalıştığımız şey (Gemini kotası ve faturası) hesap başına değil,
**global** bir kaynak.

Eklenenler:

- `supabase/schema.sql` → `rate_limits` tablosu + `consume_rate_limit(...)`
  işlevi. Hesap **işlevin içinde**, satır kilidi altında yapılır; "oku →
  hesapla → yaz" turunu Node'dan yapmak yarış doğururdu (iki örnek aynı anda
  okur, ikisi de dolu kova görür, ikisi de geçirir).
- `lib/rate-limit-core.ts` → token-bucket matematiği, saf ve testli. SQL
  tarafı bunun birebir karşılığı olmak zorunda; ayrışırlarsa sınır ortama
  göre farklı davranır ve sebebi bulunamaz. `tests/rate-limit-sql.test.mts`
  SQL'in aynı kuralları yazdığını denetler.
- `rateLimitShared(key, opts)` → paylaşımlı sınır. Supabase yapılandırılmamışsa
  ya da o an ulaşılamıyorsa **isteği reddetmez**, örnek-içi kovaya düşer:
  bizim altyapı sorunumuz kullanıcıyı uygulamadan etmemeli. Hiçbir durumda
  "sınır yok" olmaz.

**Senin yapman gereken:** Supabase panelinde **SQL Editor → `schema.sql` →
Run** (dosya idempotent, tekrar çalıştırmak güvenli). Bunu yapana kadar
sınırlar eskisi gibi örnek-içi çalışmaya devam eder — uygulama bozulmaz,
yalnız paylaşımlı koruma devreye girmez.
