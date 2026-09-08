# Supabase'e Geçiş Planı

Bu belge, Soy Ağacı'nın veri ve kimlik katmanının **Vercel Blob + NextAuth**'tan
**Supabase (Postgres + Auth)**'a kademeli geçişini tanımlar. Amaç: her aşamada
uygulama çalışır ve **hiçbir kullanıcı erişimini kaybetmeden** ilerlemek.

> **Neden Supabase?** Gerçek (sorgulanabilir, ilişkisel) veritabanı + e-posta ile
> giriş + ileride hesapsız (anonim) girişi e-postayla kalıcı hesaba bağlama —
> hepsi tek serviste. Fotoğraf/ses için **Cloudinary kalır**.

---

## BUGÜNKÜ DURUM (2026-09-06 — ölçüldü, tahmin değil)

Bu bölüm aşağıdaki faz anlatımından ÖNCE geliyor, çünkü belgenin gövdesi
planı anlatıyor ve plan ile gerçek arasındaki farkı görmeden hiçbir adım
doğru sıralanamaz. Sayılar Supabase'e sorularak alındı.

| tablo | satır |
|---|---|
| `accounts` | 3 — `demo-hesap`, `Pirci` (test), `Misafir ağacı 7b37a143` (yetim) |
| `trees` | 3 (aynı üçü) |
| `people` | 373 (demo 366, Misafir 7, Pirci 0) |
| `tree_members` | 0 |
| `tree_invites` | 4 |
| `auth.users` | 2 |
| `trees.updated_at` dolu | 0 / 3 |

**En önemli bulgu: ÜRÜN SAHİBİNİN HESABI POSTGRES'TE HİÇ YOK.**
`604a6f47-b9c2-4924-a66f-ce0681925baa` yalnız bir hız-sınırı anahtarında
geçiyor (`email:bind:604a6f47…`); `accounts`, `trees`, `people` ve
`auth.users` tablolarının hiçbirinde satırı yok. Yani **asıl ağaç yalnız
Blob'da** ve `getFamilyData` onu her okuyuşta Blob yedeğine düşüyor.

Sonucu: Faz 4 bugün yapılsaydı (`users.json` emekliye ayrılır) o hesabın
hiçbir yerde kimlik kaydı kalmazdı. Göç aracı (`/api/admin/migrate`) var ve
idempotent — yalnız hiç çalıştırılmamış.

`trees.updated_at` sütunu eklendi ve kod (#287) onu yazıyor, ama üç ağacın
hiçbirinde henüz dolu değil: damga bir SONRAKİ kaydetmede oluşuyor.

### Okuma yolu ZATEN Postgres öncelikli

Faz 2 bölümü "doğrulama sonrası okuma Postgres olur" diye yazılmış; bu
GERÇEKLEŞTİ (Faz 2d). `getFamilyData` önce `dbGetFamilyData` çağırıyor ve
Blob'a yalnız AĞAÇ SATIRI Postgres'te yoksa düşüyor. Belgenin eski hâli
okuyanı (bu belgeyi yazanı da dâhil) "hâlâ Blob'dan okunuyor" sanısına
düşürdü; düzeltme burada.

---

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
- **Faz 2d (bitti):** okuma Postgres öncelikli. `getFamilyData` önce
  `dbGetFamilyData`ya bakıyor; ağaç satırı orada yoksa Blob'a düşüyor.
- Yazma HÂLÂ iki yere gidiyor (Blob kaynak + Postgres aynası, en iyi çaba,
  süre sınırlı). Blob veri katmanının kaldırılması Faz 4'ün işi.

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
- **Faz 3d — hesapsız (misafir) giriş (KALDIRILDI):** kayıt olmadan denemek
  için kişiye özel, geçici, sahiplenilebilir bir ağaç kurulmuştu (`lib/guest.ts`,
  `/api/guest`, `/api/guest/claim`, `isGuest` bayrak zinciri: User → SessionUser
  → JWT → session → TreeContext → rota). Ürün sahibi özelliği istemedi ve
  tamamen kaldırıldı — kod, rotalar, testler, i18n anahtarları ve giriş
  sayfasındaki düğme silindi; `canDo(ctx.isGuest, …)` kapılarının kaldırıldığı
  rotalarda diğer yetki denetimleri (`canEdit`/`canManage`/`isFounder`) aynen
  kaldı. Canlıda `users.json`da kalmış olabilecek eski `guest: true` alanı
  `User` tipinden çıkarıldığı için artık okunmuyor — o hesap sessizce normal
  hesap gibi davranır (veri göçü yapılmadı, kasıtlı).
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
Bu, Faz 4'ün ön koşullarından yalnız BİRİ; hepsini bir arada ölçen kapı
`GET /api/admin/phase4` (aşağıda).

---

## Faz 4 — Eski yolu kaldırma (temizlik)

Yapılacak iş **üç parça**, ikisi tamam:

| parça | durum | geri alınır mı |
|---|---|---|
| **1a** — kimlik/şifre senkronu best-effort olmaktan çıkar | ✅ | evet (kod) |
| **1b** — kurucunun bcrypt yedeği varsayılan olarak kapanır | ✅ | **evet, anında** (`AUTH_BCRYPT_FALLBACK=1`) |
| **2** — Blob tabanlı `users.json` kimlik deposu emekliye ayrılır | bekliyor | **hayır** |

### 1a — Senkron artık kanıtlanıyor

Bcrypt yedeği, üç ayrı sessiz düşüşün ağıydı: kayıtta Auth'a içe aktarma,
sıfırlamada Auth şifre senkronu, ve ikisinin sırası. Üçü de best-effort
çağrılıyordu ve gerekçe hep aynıydı — *"bcrypt zaten güncellendi"*.

Sıfırlamadaki düşüş bcrypt'ten **bağımsız olarak** bir açıktı: giriş önce
Auth'u denediği için, senkron düşünce Auth'ta **eski şifre** kalıyor ve o
şifreyi bilen girmeye devam ediyordu — kullanıcıya "sıfırlandı" denmiş
olmasına rağmen.

Şimdi: **önce Auth, sonra yerel.** Auth yazılamazsa `503` dönüyor ve
hesapta hiçbir şey değişmiyor. Kayıtta içe aktarma `users.json`'dan önce ve
zorunlu — düşerse girilemeyen ama adı rezerve etmiş hesap doğmuyor.
Kapı: `tests/auth-sync-gate.test.mts`.

### 1b — Yedek kapandı, kilitlenme imkânsız kaldı

`SUPABASE_AUTH_LOGIN=1` iken kurucunun bcrypt yolu artık **denenmiyor**.
Yedek dururken Supabase Auth asıl kaynak değil, yalnız hızlı bir ön
kontroldü: Auth'ta silinen ya da şifresi değiştirilen bir hesap
`users.json`'daki eski hash'le girmeye devam ediyordu.

İki koruma bunun bir kilitlenmeye dönüşmesini engelliyor:

- **`SUPABASE_AUTH_LOGIN` kapalıyken yedek zorla açık** (`lib/auth-flags.ts`).
  Yani tek bir değişkeni silmek — ya da yanlış yazmak — bütün kurucuları
  dışarıda bırakamaz. Doğruluk tablosu çalıştırılarak sınanıyor:
  `tests/auth-flags.test.mts`.
- **`AUTH_BCRYPT_FALLBACK=1`** acil durum anahtarı. Supabase Auth
  kesintisinde girişin tamamen durmaması için; kesinti bitince kaldırılır.
  Arka kapı değil: yerel hash sıfırlamalarda güncellendiği için (1a) yedek
  açıldığında eski bir şifre dirilmiyor.

**ÜYELER BU KAPININ DIŞINDA.** Davetli üyelerin `auth.users` kaydı yok;
girişleri her koşulda bcrypt'ten doğrulanıyor. Bcrypt'i "giriş yolundan
kaldırdık" diye toptan silmek davetli herkesi aynı anda dışarıda bırakırdı
ve kurucu girebildiği için arıza günlerce görünmeyebilirdi. Kapı:
`tests/login-path-gate.test.mts`.

### Yedeğin altından çıkan üçüncü hata: bağlanan e-posta

Kurucu gerçek e-postasını bağladığında Auth kullanıcısının adresi onunla
**değiştiriliyor** (`updateAccountAuthEmail`, Faz 3e). Giriş ise hep
**sentetik** adresle deneniyordu (`<accountId>@hesap.soyagaci.local`) — o
adres artık Auth'ta kimseye ait değil.

Bcrypt yedeği açıkken bu görünmüyordu: giriş sessizce yedeğe düşüyor,
kullanıcı sorunsuz giriyordu. 1b'den sonra aynı durum **kilitlenme**:
e-postasını bağlamış bir kurucu hesabına hiç giremez.

Çözüm tahmin değil, kimlikten çözüm: `auth.users.id === accountId` olduğu
için adres `getUserById` ile okunuyor; arama düşerse sentetik adrese
düşülüyor (ölçememek girişi kesmemeli). Ayrıca oturumun **gerçekten o
hesaba ait olduğu** doğrulanıyor — `users.json` doğrulanmamış adreste
tekilliği zorlamadığı için "şu adresle girilebildi" ile "şu hesaba girildi"
aynı şey değil.

Kapı: `tests/login-path-gate.test.mts`.

### 2 — Geri dönüşü olmayan parça

`users.json`'ın kimlik kaynağı olmaktan çıkması, depodaki tek **geri
dönüşü olmayan** iş: o noktadan sonra Auth kaydı olmayan bir hesabın giriş
yolu kalıcı olarak yok olur. 1b canlıda birkaç gün beklemeden yapılmamalı —
bu bekleme, 1b'nin geri alınabilir olmasının tek sebebi.

### Ön koşullar artık düzyazı değil — `GET /api/admin/phase4`

Bu bölüm eskiden şunu yazıyordu: *"Faz 3c–3e oturduktan, tüm hesaplar
Supabase Auth'a taşındıktan ve kayma denetimi her ağaç için temiz döndükten
sonra…"*. Cümle doğruydu ama **hiçbir yerde hesaplanmıyordu** — yani
"hazır mıyız?" sorusunun tek cevabı o gün belgeyi okuyan kişinin kanaatiydi
ve geri dönüşü olmayan iş ölçülmeden basılabiliyordu.

Artık ölçülüyor:

| parça | ne yapar |
|---|---|
| `GET /api/admin/phase4` | **Salt okuma.** Olguları ölçer, kararı döndürür. POST **yok** — bu uç Faz 4'ü uygulamaz. |
| `lib/phase4-readiness.ts` | Saf karar katmanı (bağımlılıksız, testli): ölçülmüş olgular → `{ hazir, engeller[] }`. |
| `tests/phase4-readiness.test.mts` | Karar kurallarını mutasyonla sınar. |
| `tests/phase4-gate.test.mts` | Ucün salt okuma olduğunu, yetki kapısının drift ucununkiyle aynı olduğunu ve ölçümün `readFamilyFromBlob` kullandığını kilitler. |

Yetki drift ucuyla aynı: founder + `canManage` + `isSupabaseConfigured`.
Ağaç kapsamı çağıranın ağaçlarıyla sınırlı; hesap kapsamı zorunlu olarak
geneldir (bir başka hesabın kilitlenmesi kapıya görünmeli), ama başkasının
aile adı rapora **girmez** — yalnız kimliği.

#### Engel sözlüğü

| kod | ağırlık | ne demek |
|---|---|---|
| `ayna-eksik` | engel | Bir ağacın Postgres'teki kişi sayısı Blob'unkinden az, ya da ağaç hiç göç etmemiş. Faz 4 Blob'u bırakıyor → eksik kişiler **kalıcı** kaybolur. |
| `kayma-var` | engel | Alan düzeyi kayma temiz değil (`lib/drift.ts`). Sayı eşitliği eşitlik değildir. |
| `auth-eksik` | engel | `auth.users`ta karşılığı olmayan hesap var → bcrypt yedeği kalkınca bir daha giremez. |
| `demo-acikta` | engel | Demo **hâlâ `users.json`da bir hesap satırı** olarak duruyor. Demo bir hesap değil, bir vitrin (aşağıya bak); emekliye ayrılan depoda kimlik kalıntısı bırakılmaz. |
| `giris-denenmemis` | engel | Hiçbir hesap Supabase Auth ile giriş yapmamış (`last_sign_in_at` boş). Faz 4 sonrası **tek** giriş yolu bu olacak. |
| `yedek-acik` | engel | Kurucunun bcrypt yedeği bugün **deneniyor**. İki sebebi var ve onarımları farklı: `AUTH_BCRYPT_FALLBACK` açık (acil durum anahtarı kullanımda → Supabase Auth'a bugün güvenilmiyor), ya da `SUPABASE_AUTH_LOGIN` kapalı (bcrypt zaten tek yol). Kalan parça `users.json`'ı emekliye ayırıyor — yani bcrypt yolunun **okuduğu** dosyayı. `giris-denenmemis`in kapatmadığı boşluğu kapatıyor: geçmişte bir kez Supabase üzerinden girilmiş olması, bugün bcrypt'in tek yol olduğunu değiştirmiyor. |
| `damga-yok` | uyarı | `trees.updated_at` boş. Veri kaybettirmiyor (sürüm jetonu kişi damgalarına düşüyor); yazma yolunun o ağaçta henüz işlemediğini gösterir. |
| `olculemedi` | değişken | Olgu **ölçülemedi**. Ölçülemeyen olgunun ağırlığı, o olgunun en kötü olası değerinin ağırlığıdır. |

İki karar kapının varlık sebebi ve testle kilitli:

1. **Şüphede daima "hazır değil".** Bir olgu ölçülemediyse (Blob okunamadı,
   Auth sorgusu düştü) bu asla "sorun yok" sayılmaz. Geri dönüşü olmayan bir
   işin kapısında "bilmiyorum" ile "temiz" aynı şey değildir: birincisi
   ölçümü tekrarlamayı, ikincisi düğmeye basmayı gerektirir.
2. **Boş envanter "temiz" değildir.** Sıfır ağaç ölçüldüğünde
   `[].every(clean)` → `true` döner; bu "her ağaç temiz" değil, "hiç ölçüm
   yok" demektir ve `olculemedi` engeliyle işaretlenir.

### Bugünkü cevap (2026-09-07 — üretim veritabanına soruldu)

Faz 4 **HAZIR DEĞİL**. Üç bağımsız engel var; bir sonraki okuyan bunu
baştan araştırmasın:

| # | engel | ölçülen |
|---|---|---|
| 1 | `ayna-eksik` | `accounts` 3 · `trees` 3 · `people` 373 (demo 366, misafir 7, **Pirci 0**) · `tree_members` 0. Kurucunun kendi ağacı Postgres'te boş. |
| 2 | `demo-acikta` | `demo-hesap` için `auth.users` kaydı **yok**; `lib/demo-account.ts` onu şifreli normal hesap olarak `users.json`'a yazıyor. Kimliği UUID olmadığı için `importAccountToAuth` de onu 1:1 eşlemiyor. — **Bu engelin ANLAMI o günden sonra değişti; aşağıdaki "Demo kimlik sisteminin dışında" bölümüne bak.** |
| 3 | `giris-denenmemis` | `auth.users` 2 kayıt, **ikisinin de** `last_sign_in_at` = `null` → Supabase Auth ile üretimde hiç giriş yapılmamış; `SUPABASE_AUTH_LOGIN` bayrağı kapalı. |

Ayrıca uyarı: üç ağacın da `trees.updated_at` değeri `null` (`damga-yok`) —
damga bir SONRAKİ kaydetmede oluşuyor, Faz 4'ü durdurmuyor.

**Sıra:** (1) `/api/admin/migrate` ile hesapları ve ağaçları Auth + Postgres'e
taşı → (2) `/api/admin/drift` temiz dönene kadar onar → (3) demo satırını
`users.json`dan elle sil (karar verildi ve kod tarafı bitti — aşağıya bak) →
(4) `SUPABASE_AUTH_LOGIN=1` açıp bir süre koştur, `last_sign_in_at` dolsun →
(5) `GET /api/admin/phase4` → `hazir: true` → ancak o zaman Faz 4.

### Demo kimlik sisteminin dışında (madde 45 hazırlığı)

Yukarıdaki üç engelden ikincisi (`demo-acikta`) için ürün sahibine iki seçenek
sunuldu: demoyu Supabase Auth'a taşımak, ya da demoyu kimlik sisteminden
tamamen çıkarmak. **İkincisi seçildi** — gerekçesi tek cümlede: *demo bir
hesap değil, bir vitrindir.* Herkesin bildiği bir giriş yolunu kimlik
altyapısının içinde tutmak da, sahibi olmayan bir vitrine gerçek kimlik
(Auth kaydı, kurtarma kodu, şifre sıfırlama) taşıtmak da savunulamıyordu.

**Kod tarafı bitti.** `lib/demo-account.ts` artık `users.json`a hiç yazmıyor
ve oradan hiç okumuyor; demo oturumunun bütün alanları koddaki `DEMO_SESSION`
sabitinden geliyor (`signIn("demo")` yolu, ağaç sıfırlama, ekstra ağaç
temizliği, kapak fotoğrafı aynen duruyor). Gerekçenin uzun hâli o dosyanın
başında; kararı koruyan testler `tests/demo-identity-gate.test.mts` ve
`tests/phase4-readiness.test.mts`.

Bunun doğal sonuçları — hepsi istenen davranış:

- Demo `users.json`, `accounts` ve `auth.users`ın hiçbirinde yok.
- Normal giriş formundan demoya girilemez: `findUserByFamilyName(demo)` artık
  `null`. (Eskiden bunu sağlayan şey rastgele bir şifreydi — bir tesadüf;
  şimdi kapı testle kilitli.)
- Demo şifre sıfırlamaya, kurtarma koduna, kimlik e-postasına ve cron
  postalarına hiç girmiyor. Kayıp değil: demonun sahibi yok.
- Demo silinemezliği bozulmadı — o kapılar `users.json` satırına değil
  **kimliğe** (`DEMO_USER_ID`) bakıyor.
- Demo artık günlük ayna taramasına (`lib/mirror-scan.ts`) girmiyor; o tarama
  hesap envanterini geziyor. Demo ağacı zaten her girişte sıfırlanan oyuncak
  veri, kaymasının bir anlamı yok. Blob yedeği etkilenmiyor (yedek blob'ları
  geziyor, hesapları değil).
- Demonun adı artık **kodda** rezerve (`isDemoFamilyName`, iki kayıt ucunda):
  rezervi eskiden `users.json` satırının kendisi tutuyordu.

**Üretimdeki satır kendiliğinden GİTMEZ — elle silinecek.** Kod artık ona
dayanmıyor, ama `users.json`da bugün hâlâ bir `demo-hesap` satırı var (ve
Postgres `accounts` tablosunda onun aynası). Bu tur üretim verisine hiç
dokunmadı; bir "temizlik göçü" de yazılmadı, çünkü tek satırlık, tek seferlik
ve geri dönüşü olan bir iş için kalıcı kod bırakmak, kodun kendisini bir
kalıntıya çevirirdi. Silinecek iki şey:

1. `users.json` → `users[]` içinden `id === "demo-hesap"` satırı,
2. Postgres → `delete from accounts where id = 'demo-hesap';`

`trees` satırı ve demo ağacının kişileri **KALIR**: onlar kimlik değil veri,
ve `people.tree_id` yabancı anahtarı o satıra bağlı (`prepareDemoAccount`
girişte kendisi de idempotent olarak açıyor).

Satır durduğu sürece `GET /api/admin/phase4` `demo-acikta` engelini vermeye
devam eder — bilerek: kapı artık "demo Auth'ta yok mu" değil, "demo hâlâ
kimlik deposunda mı" diye soruyor, ve engel silindiği anda kendiliğinden
düşer.

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
