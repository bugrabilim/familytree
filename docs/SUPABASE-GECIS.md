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

## Faz 3 — Supabase Auth'a geçiş

- Her mevcut ağaç/üye için Supabase Auth kimliği oluşturulur (göç sırasında).
- Mevcut *soyad + şifre* girişi korunur: ilk girişte eski şifre doğrulanır →
  arka planda Supabase kimliğine bağlanır → sonraki girişler Supabase üzerinden.
  Kullanıcı hiçbir kesinti yaşamaz.
- NextAuth Credentials sağlayıcısı Supabase oturumuna köprülenir; oturum/rol
  modeli (founder/üye, viewer/editor/admin) aynı kalır.

## Faz 4 — E-posta ile bağlama & hesapsız giriş

- **Hesapsız (anonim) giriş** (Supabase Anonymous sign-in) — özellikle mobil için.
- İsteğe bağlı **e-posta ile kalıcı hesaba bağlama**: anonim kullanıcı e-posta +
  doğrulama ekleyerek verisini kaybetmeden hesabını kalıcılaştırır.
- E-posta doğrulama/parola sıfırlama Supabase'in yerleşik akışlarıyla.

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
