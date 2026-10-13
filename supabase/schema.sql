-- =====================================================================
-- LEGACY/REFERENCE ONLY — DO NOT USE FOR PRODUCTION
-- ---------------------------------------------------------------------
-- Production schema source of truth is now:
-- supabase/migrations/202607080001_initial_production_schema.sql
--
-- This v1 file is kept as historical reference only.
-- =====================================================================

-- =====================================================================
-- Portal Warga Palm Village — Skema Database & RLS (v1)
-- ---------------------------------------------------------------------
-- Jalankan di Supabase SQL Editor (dashboard) atau via `supabase db push`.
-- Sesuai PLAN.md. RBAC 4 level: admin, bendahara, pengurus, warga.
-- =====================================================================

-- 1. ENUM & EXTENSIONS -------------------------------------------------

create type user_role as enum ('admin', 'bendahara', 'pengurus', 'warga');
create type bill_status as enum ('pending', 'paid', 'overdue', 'cancelled');
create type payment_status as enum ('pending', 'completed', 'failed', 'refunded');
create type payment_method as enum ('qris', 'bank_transfer', 'cash', 'other');
create type rsvp_status as enum ('attending', 'maybe', 'declined');

create extension if not exists "pgcrypto";   -- untuk gen_random_uuid()

-- 2. PROFILES (extend auth.users) --------------------------------------
--    Satu baris per pengguna, terhubung ke auth.users via id (uuid).

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text        not null,
  phone       text,
  role        user_role   not null default 'warga',
  unit_id     bigint      references public.units(id) on delete set null,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create baris profile saat user baru register di auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. UNITS -------------------------------------------------------------

create table if not exists public.units (
  id           bigint generated always as identity primary key,
  block        text        not null,
  unit_number  text        not null,
  floor        int,
  size         numeric(8,2),
  is_occupied  boolean     not null default true,
  created_at   timestamptz not null default now(),
  unique (block, unit_number)
);

create index if not exists idx_units_block_number on public.units(block, unit_number);

-- 4. IPL BILLS ---------------------------------------------------------

create table if not exists public.ipl_bills (
  id            uuid        primary key default gen_random_uuid(),
  unit_id       bigint      not null references public.units(id) on delete cascade,
  resident_id   uuid        references public.profiles(id) on delete set null,
  period        text        not null,                 -- format YYYY-MM
  amount        numeric(12,2) not null,                -- dihitung dari total ipl_components saat generate
  late_fee      numeric(12,2) not null default 0,
  due_date      date        not null,
  status        bill_status not null default 'pending',
  qris_ref      text,                                 -- reference QRIS dari payment gateway (Edge Function)
  payment_id    uuid        references public.payments(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (unit_id, period)
);

create index if not exists idx_iplbills_resident_status on public.ipl_bills(resident_id, status);
create index if not exists idx_iplbills_period         on public.ipl_bills(period);
create index if not exists idx_iplbills_due_date       on public.ipl_bills(due_date);

-- 5. PAYMENTS ----------------------------------------------------------

create table if not exists public.payments (
  id             uuid            primary key default gen_random_uuid(),
  ipl_bill_id    uuid            not null references public.ipl_bills(id) on delete cascade,
  resident_id    uuid            references public.profiles(id) on delete set null,
  amount         numeric(12,2)   not null,
  method         payment_method  not null default 'qris',
  transaction_id text,                                   -- ID transaksi dari payment gateway
  status         payment_status  not null default 'pending',
  paid_at        timestamptz,
  metadata       jsonb           not null default '{}'::jsonb,
  created_at     timestamptz     not null default now()
);

create index if not exists idx_payments_resident      on public.payments(resident_id);
create index if not exists idx_payments_iplbill       on public.payments(ipl_bill_id);
create index if not exists idx_payments_transaction   on public.payments(transaction_id);

-- 6. EVENTS (Phase 2) --------------------------------------------------

create table if not exists public.events (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  event_date  timestamptz not null,
  location    text,
  created_by  uuid        not null references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_events_date on public.events(event_date);

-- 7. RSVP (Phase 2) ----------------------------------------------------

create table if not exists public.rsvp (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events(id) on delete cascade,
  resident_id uuid        not null references public.profiles(id) on delete cascade,
  status      rsvp_status not null default 'attending',
  created_at  timestamptz not null default now(),
  unique (event_id, resident_id)
);

-- 8. FORUM (Phase 2) ---------------------------------------------------

create table if not exists public.forum_categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.forum_threads (
  id          uuid        primary key default gen_random_uuid(),
  category_id uuid        references public.forum_categories(id) on delete set null,
  title       text        not null,
  author_id   uuid        not null references public.profiles(id) on delete cascade,
  is_pinned   boolean     not null default false,
  is_locked   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_threads_category on public.forum_threads(category_id);

create table if not exists public.forum_posts (
  id          uuid        primary key default gen_random_uuid(),
  thread_id   uuid        not null references public.forum_threads(id) on delete cascade,
  author_id   uuid        not null references public.profiles(id) on delete cascade,
  parent_id   uuid        references public.forum_posts(id) on delete cascade, -- nested comment
  content     text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_posts_thread on public.forum_posts(thread_id);
create index if not exists idx_posts_parent on public.forum_posts(parent_id);

-- 9. updated_at TRIGGERS ----------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_profiles_updated  on public.profiles;
create trigger trg_profiles_updated  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_iplbills_updated  on public.ipl_bills;
create trigger trg_iplbills_updated  before update on public.ipl_bills
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_threads_updated  on public.forum_threads;
create trigger trg_threads_updated  before update on public.forum_threads
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- Prinsip: akses data di-enforce di level database, bukan hanya frontend.
-- Helper function membaca role dari profiles berdasarkan auth.uid().
-- =====================================================================

alter table public.profiles        enable row level security;
alter table public.units           enable row level security;
alter table public.ipl_bills       enable row level security;
alter table public.payments        enable row level security;
alter table public.events          enable row level security;
alter table public.rsvp            enable row level security;
alter table public.forum_categories enable row level security;
alter table public.forum_threads   enable row level security;
alter table public.forum_posts     enable row level security;

-- Helper: role user yang sedang login.
create or replace function public.current_role()
returns user_role
language sql
security definer set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Helper: apakah user login adalah staff (admin/bendahara/pengurus).
create or replace function public.is_staff()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.current_role() in ('admin', 'bendahara', 'pengurus');
$$;

-- ---- PROFILES ----
-- Setiap user hanya bisa baca/mutasi profilnya sendiri; staff bisa baca semua.
create policy "profiles_select_self_or_staff"
  on public.profiles for select
  using (id = auth.uid() or public.is_staff());

create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_insert_self"
  on public.profiles for insert
  with check (id = auth.uid());

-- ---- UNITS ----
-- Semua warga bisa lihat daftar unit (info blok); hanya admin yang ubah.
create policy "units_select_all"
  on public.units for select
  using (true);

create policy "units_modify_admin"
  on public.units for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ---- IPL BILLS ----
-- Warga hanya lihat tagihannya sendiri; staff lihat semua.
create policy "iplbills_select_own_or_staff"
  on public.ipl_bills for select
  using (resident_id = auth.uid() or public.is_staff());

create policy "iplbills_modify_staff_only"
  on public.ipl_bills for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---- PAYMENTS ----
create policy "payments_select_own_or_staff"
  on public.payments for select
  using (resident_id = auth.uid() or public.is_staff());

create policy "payments_insert_own_or_staff"
  on public.payments for insert
  with check (resident_id = auth.uid() or public.is_staff());

create policy "payments_update_staff_only"
  on public.payments for update
  using (public.is_staff())
  with check (public.is_staff());

-- ---- EVENTS ----
-- Semua warga bisa lihat acara; hanya admin/rt_rw yang buat/ubah/hapus.
create policy "events_select_all"
  on public.events for select
  using (true);

create policy "events_modify_staff"
  on public.events for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---- RSVP ----
-- Warga kelola RSVP-nya sendiri; semua warga bisa lihat siapa hadir.
create policy "rsvp_select_all"
  on public.rsvp for select
  using (true);

create policy "rsvp_modify_own"
  on public.rsvp for all
  using (resident_id = auth.uid())
  with check (resident_id = auth.uid());

-- ---- FORUM CATEGORIES ----
create policy "forum_cat_select_all"
  on public.forum_categories for select
  using (true);

create policy "forum_cat_modify_staff"
  on public.forum_categories for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---- FORUM THREADS ----
-- Warga bisa baca semua thread & buat thread; moderasi (pin/lock) staff.
create policy "forum_threads_select_all"
  on public.forum_threads for select
  using (true);

create policy "forum_threads_insert_auth"
  on public.forum_threads for insert
  with check (author_id = auth.uid());

create policy "forum_threads_update_owner_or_staff"
  on public.forum_threads for update
  using (author_id = auth.uid() or public.is_staff())
  with check (author_id = auth.uid() or public.is_staff());

create policy "forum_threads_delete_owner_or_staff"
  on public.forum_threads for delete
  using (author_id = auth.uid() or public.is_staff());

-- ---- FORUM POSTS ----
create policy "forum_posts_select_all"
  on public.forum_posts for select
  using (true);

create policy "forum_posts_insert_auth"
  on public.forum_posts for insert
  with check (author_id = auth.uid());

create policy "forum_posts_update_owner_or_staff"
  on public.forum_posts for update
  using (author_id = auth.uid() or public.is_staff())
  with check (author_id = auth.uid() or public.is_staff());

create policy "forum_posts_delete_owner_or_staff"
  on public.forum_posts for delete
  using (author_id = auth.uid() or public.is_staff());

-- =====================================================================
-- SEED (opsional) — kategori forum awal & unit contoh
-- =====================================================================

insert into public.forum_categories (name, description) values
  ('Umum', 'Diskusi umum warga'),
  ('Fasilitas', 'Laporan & saran fasilitas kompleks'),
  ('Keamanan', 'Informasi & laporan keamanan'),
  ('Saran', 'Saran untuk pengelola')
on conflict (name) do nothing;

-- Catatan: data unit & penghuni awal sebaiknya diimpor via CSV
-- (lihat PLAN.md T10). Buat admin awal manual di Supabase Auth,
-- lalu set role = 'admin' pada baris profile-nya.
