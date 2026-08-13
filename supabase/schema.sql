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

-- ── Satır Düzeyi Güvenlik (RLS) ──────────────────────────────────────────────
-- Tüm erişim SUNUCUDAN servis-rolü anahtarıyla yapılır (RLS'yi atlar). Yetki
-- denetimi uygulamada (NextAuth + resolveActiveTree) yapılır. anon/authenticated
-- rolleri doğrudan erişemesin diye RLS açık ve POLİTİKA YOK → varsayılan reddet.
alter table public.trees        enable row level security;
alter table public.people       enable row level security;
alter table public.tree_members enable row level security;
alter table public.tree_invites enable row level security;
alter table public.accounts     enable row level security;
