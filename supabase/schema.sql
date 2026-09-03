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
  created_at    timestamptz not null default now()
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
  joined_at     timestamptz not null default now()
);
create index if not exists tree_members_tree_idx on public.tree_members (tree_id);

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
