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
- **Faz 3c — giriş doğrulamasını çevir:** yeterli hesap aktarıldıktan sonra
  `authorize()` önce Supabase `signInWithPassword(sentetikEposta, şifre)` dener,
  başarısızsa mevcut bcrypt yoluna düşer (yedek). Oturum/rol modeli aynı kalır.
  _Ön koşul:_ Supabase panelinde **Email** sağlayıcısı açık olmalı.
- **Faz 3d — hesapsız (misafir) giriş:** Supabase Anonymous sign-in.
- **Faz 3e — gerçek e-posta ile bağlama:** kullanıcı sentetik e-postayı kendi
  e-postasıyla değiştirip hesabını kalıcılaştırır (doğrulama + parola sıfırlama
  Supabase'in yerleşik akışlarıyla).

## Faz 4 — Eski yolu kaldırma (temizlik)

Faz 3c–3e oturduktan ve tüm hesaplar Supabase Auth'a taşındıktan sonra:

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
