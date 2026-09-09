-- Soy Ağacı — Supabase (Postgres) şeması
-- Faz 1: veri katmanı. Auth şimdilik NextAuth'ta kalır (bkz. docs/SUPABASE-GECIS.md).
--
-- Kullanım: Supabase panelinde SQL Editor → bu dosyayı yapıştır → Run.
-- Tekrar çalıştırmak güvenli (idempotent: IF NOT EXISTS).
--
-- Kimlik biçimi: mevcut Blob verisiyle KAYIPSIZ uyum için tüm kimlikler `text`.
-- Ana ağacın id'si founder hesabının kimliğidir (treeId === accountId); bu yüzden
-- uuid zorunluluğu yok.

-- ── Ağaçlar ──────────────────────────────────────────────────────────────────
-- Her founder hesabının sahip olduğu ağaçlar (ana ağaç dahil).
create table if not exists public.trees (
  id            text primary key,               -- home: accountId, diğer: mevcut uuid
  owner_account text not null,                   -- founder (NextAuth) hesap kimliği
  name          text not null default '',
  is_home       boolean not null default false,
  created_at    timestamptz not null default now(),
  -- Ağacın SÜRÜM DAMGASI (madde 1 / #287). İyimser kilitleme bunu okuyor.
  --
  -- NULL OLABİLİR ve bilerek öyle: bu sütun canlı veritabanına sonradan
  -- eklendi (`add_trees_updated_at` göçü) ve var olan ağaçlarda boş. Kod
  -- boşluğu zaten karşılıyor — `pickVersion` damga yoksa kişilerin en yeni
  -- `updated_at`ine düşüyor (`lib/version-stamp.ts`). `not null default now()`
  -- yazsaydık şema dosyası canlıyla AYRIŞIRDI.
  --
  -- Sütunun burada OLMAMASI sessiz bir felaketti: `saveFamilyData` aynayı
  -- yazarken önce damgayı vuruyor, damga çağrısı hata verince aynı bloktaki
  -- kişi yazmaları hiç çalışmıyor — yani bu dosyadan kurulmuş her ortamda
  -- Postgres aynası tümüyle ölürdü.
  updated_at    timestamptz
);
create index if not exists trees_owner_idx on public.trees (owner_account);

-- ── Kişiler ──────────────────────────────────────────────────────────────────
-- Ağaç başına kişiler. Zengin/opsiyonel alanlar `data` (JSONB) içinde saklanır
-- (kayıpsız); sık sorgulanan çekirdek alanlar indekslenebilir sütunlarda.
create table if not exists public.people (
  tree_id       text not null references public.trees(id) on delete cascade,
  person_id     text not null,
  first_name    text not null default '',
  last_name     text not null default '',
  gender        text not null default 'unknown',
  birth_date    text,
  death_date    text,
  sibling_order integer,
  data          jsonb not null,                  -- tam Person nesnesi
  updated_at    timestamptz not null default now(),
  primary key (tree_id, person_id)
);

-- ── Üyeler ───────────────────────────────────────────────────────────────────
-- Davetle katılan (founder olmayan) parola sahipleri.
create table if not exists public.tree_members (
  id            text primary key,
  tree_id       text not null references public.trees(id) on delete cascade,
  display_name  text not null default '',
  password_hash text not null,
  role          text not null default 'viewer',
  -- Giriş adı (`lib/username.ts`). SONRADAN eklendi: eski üyelerde boş.
  -- Boş bırakılabilir olması şart — üye adsız da var olabiliyor ve
  -- `not null` yapmak göçü kilitlerdi.
  username      text,
  joined_at     timestamptz not null default now()
);
create index if not exists tree_members_tree_idx on public.tree_members (tree_id);
-- Ad ağaç içinde BENZERSİZ ve büyük/küçük harf duyarsız — `usernameTaken`
-- ile aynı kural, ama burada veritabanı düzeyinde. Blob tarafındaki denetim
-- iki eşzamanlı davetin aynı adı almasını engelleyemiyor; bu indeks
-- engelliyor. `where username is not null`: adsız üyeler kısıta girmiyor.
create unique index if not exists tree_members_username_idx
  on public.tree_members (tree_id, lower(username))
  where username is not null;

-- ── Davetler ─────────────────────────────────────────────────────────────────
-- Tek kullanımlık davetler (bekleyen/kullanılmış).
create table if not exists public.tree_invites (
  tree_id     text not null references public.trees(id) on delete cascade,
  token_hash  text not null,
  role        text not null default 'viewer',
  created_by  text not null default '',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  primary key (tree_id, token_hash)
);

-- ── Hesaplar (founder) ───────────────────────────────────────────────────────
-- Ağacı kuran (founder) hesaplar. id = founder/treeId. Giriş şimdilik Blob'dan
-- doğrulanıyor; bu tablo çift-yazmayla ayna tutulur (Faz 3 — sonraki adımda
-- okuma buraya çevrilecek). family_name benzersiz (büyük/küçük harf duyarsız).
create table if not exists public.accounts (
  id                text primary key,           -- founder/treeId
  family_name       text not null,
  password_hash     text not null,
  recovery_code_hash text not null default '',
  created_at        timestamptz not null default now()
);
create unique index if not exists accounts_family_name_key
  on public.accounts (lower(family_name));

/*
 * KİMLİĞİN GERİ KALANI (Faz 4 / parça 2'nin ön koşulu).
 *
 * Tablo beş sütunla açılmıştı ve `docs/SUPABASE-GECIS.md` parça 2'yi
 * "veri zaten Postgres + Auth'ta" diye tarif ediyordu. DEĞİLDİ: `User`
 * tipinin on sekiz alanının on üçü yalnız `users.json`da yaşıyordu.
 *
 * `users.json` bu hâliyle emekliye ayrılsaydı sessizce şunlar giderdi:
 *
 *  · `deleted_at`        → yumuşak silinmiş hesap GERİ DİRİLİR; silme
 *                          kararı, kullanıcının haberi olmadan iptal olur.
 *  · `session_epoch`     → şifre sıfırlama artık oturumları düşürmez;
 *                          çalınmış çerez yaşamaya devam eder (bu korumayı
 *                          eklemenin tek sebebi buydu).
 *  · `recovery_code_index` → kurtarma koduyla sıfırlama hiç çalışmaz.
 *  · `reset_token_*`, `email_token_*` → yoldaki bütün sıfırlama ve
 *                          doğrulama bağlantıları ölür.
 *  · `auth_email*`       → e-postayla kurtarma yolu kapanır.
 *  · `notify_*`          → bildirim ONAYLARI sıfırlanır (onay kaydı).
 *
 * Sütunlar `if not exists` ile ekleniyor: şema betiği yeniden koşturulabilir
 * olmalı, ilk kurulumda da var olan veritabanında da aynı sonucu vermeli.
 */
alter table public.accounts add column if not exists recovery_code_index text;
alter table public.accounts add column if not exists session_epoch       timestamptz;
alter table public.accounts add column if not exists deleted_at          timestamptz;
alter table public.accounts add column if not exists auth_email          text;
alter table public.accounts add column if not exists auth_email_verified boolean;
alter table public.accounts add column if not exists email_token_hash    text;
alter table public.accounts add column if not exists email_token_expires timestamptz;
alter table public.accounts add column if not exists reset_token_hash    text;
alter table public.accounts add column if not exists reset_token_expires timestamptz;
alter table public.accounts add column if not exists notify_email        text;
alter table public.accounts add column if not exists notify_reminders    boolean;
alter table public.accounts add column if not exists notify_memorials    boolean;
alter table public.accounts add column if not exists notify_newsletter   boolean;

/*
 * SÜRÜM DAMGASI — kimlik yazmalarının karşılaştır-ve-değiştir dayanağı
 * (Faz 4 / 2c-2).
 *
 * Yazma yolu `users.json`dan bu tabloya taşınıyor. Blob'da kayıp yazma
 * koruması ancak DARALTILABİLİYORDU: koşullu yazma olmadığı için "damga
 * hâlâ aynı mı" sorusu ile yazmanın kendisi iki ayrı istekti ve aralarında
 * her zaman bir pencere kalıyordu.
 *
 * Burada aynı koruma GERÇEK oluyor:
 *   update accounts set … , updated_at = $yeni
 *    where id = $id and updated_at = $eski
 * Soru ve yazma tek ifadede; hiçbir satır güncellenmediyse araya biri
 * girmiştir ve bunu veritabanının kendisi söylüyor.
 *
 * `null` OLABİLİR ve bu bir eksiklik değil: sütun sonradan eklendi, var olan
 * satırlarda değeri yok. Karşılaştırma bunu `is null` ile ele almak zorunda
 * (`= null` hiçbir satırla eşleşmez) — yoksa göçten önce açılmış her hesap
 * bir daha hiç güncellenemezdi ve bu, ilk şifre sıfırlamasına kadar
 * görünmezdi.
 */
alter table public.accounts add column if not exists updated_at          timestamptz;

/*
 * Kurtarma kodu İNDEKSTEN bulunuyor (`findUserByRecoveryIndex`): kod tek
 * başına hesabı gösterebiliyor, ağaç adı sorulmuyor. Okuma yolu Postgres'e
 * döndüğünde bu arama indekssiz tam tarama olurdu.
 */
create index if not exists accounts_recovery_code_index_key
  on public.accounts (recovery_code_index)
  where recovery_code_index is not null;

-- ── Paylaşımlı hız sınırı ────────────────────────────────────────────────────
-- `lib/rate-limit.ts` örnek-içi bellekte çalışıyordu; sunucusuz ortamda her
-- örneğin kendi kovası olduğu için bu GERÇEK bir sınır değildi: yeterince
-- örnek varsa bir istemci sınırın katları kadar istek geçirebiliyordu.
--
-- Kova durumu burada; hesabın kendisi bir Postgres işlevinde, çünkü
-- "oku → hesapla → yaz" turunu Node'dan yapmak yarış doğurur: iki örnek aynı
-- anda okuyup ikisi de dolu kova görür ve ikisi de geçirir.
create table if not exists public.rate_limits (
  key        text primary key,
  tokens     double precision not null,
  updated_ms bigint not null
);

-- Eski kayıtları süpürmek için (kova bir saat dokunulmamışsa zaten doludur).
create index if not exists rate_limits_updated_idx on public.rate_limits (updated_ms);

-- Bir isteği kovadan düşürür. TEK tur, satır kilidi altında (atomik).
--
-- Matematiği `lib/rate-limit-core.ts` ile BİREBİR aynı olmalı; ikisi ayrışırsa
-- sınır ortama göre farklı davranır ve sebebi bulunamaz. Oradaki kurallar:
--   · durum yoksa kova DOLU sayılır (ilk istek engellenmez)
--   · reddedilen istek jeton HARCAMAZ
--   · geriye giden saat jeton GERİ ALMAZ (geçen süre en az 0)
--   · kapasite en az 1
create or replace function public.consume_rate_limit(
  p_key        text,
  p_capacity   double precision,
  p_refill     double precision,
  p_now_ms     bigint
) returns table (allowed boolean, retry_after integer)
language plpgsql
-- `search_path` SABİTLENİYOR. Boş bırakılırsa arama yolu ÇAĞIRANIN elinde olur
-- ve gövdedeki nitelenmemiş her ad (tip adları dâhil) çağıranın yoluna göre
-- çözülür; kendi şemasında nesne yaratabilen biri işlevi kendi tablosuna
-- bakmaya ikna edebilir. Gövde zaten `public.rate_limits` diye tam nitelenmiş,
-- yerleşik işlevler de `pg_catalog`ta örtük olarak bulunuyor — bu yüzden boş
-- yol güvenli ve en dar olanı. (Supabase denetleyicisi: 0011.)
set search_path = ''
as $$
declare
  v_cap      double precision := greatest(1, p_capacity);
  v_refill   double precision := greatest(0, p_refill);
  v_tokens   double precision;
  v_updated  bigint;
  v_elapsed  double precision;
begin
  -- Satırı kilitle; yoksa dolu kovayla oluştur.
  select tokens, updated_ms into v_tokens, v_updated
    from public.rate_limits where key = p_key for update;

  if not found then
    v_tokens := v_cap;
    v_updated := p_now_ms;
  end if;

  v_elapsed := greatest(0, (p_now_ms - v_updated)::double precision / 1000.0);
  v_tokens := least(v_cap, v_tokens + v_elapsed * v_refill);

  if v_tokens < 1 then
    insert into public.rate_limits (key, tokens, updated_ms)
      values (p_key, v_tokens, p_now_ms)
      on conflict (key) do update set tokens = excluded.tokens, updated_ms = excluded.updated_ms;
    return query select false,
      greatest(1, case when v_refill > 0 then ceil((1 - v_tokens) / v_refill)::integer else 3600 end);
    return;
  end if;

  insert into public.rate_limits (key, tokens, updated_ms)
    values (p_key, v_tokens - 1, p_now_ms)
    on conflict (key) do update set tokens = excluded.tokens, updated_ms = excluded.updated_ms;
  return query select true, 0;
end;
$$;

-- ── Satır Düzeyi Güvenlik (RLS) ──────────────────────────────────────────────
-- Tüm erişim SUNUCUDAN servis-rolü anahtarıyla yapılır (RLS'yi atlar). Yetki
-- denetimi uygulamada (NextAuth + resolveActiveTree) yapılır. anon/authenticated
-- rolleri doğrudan erişemesin diye RLS açık ve POLİTİKA YOK → varsayılan reddet.
alter table public.trees        enable row level security;
alter table public.people       enable row level security;
alter table public.tree_members enable row level security;
alter table public.tree_invites enable row level security;
alter table public.accounts     enable row level security;
alter table public.rate_limits  enable row level security;
