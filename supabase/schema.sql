-- ============================================================
-- AnuRAAGAM — Supabase schema
-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- PROFILES — one row per user, extends Supabase's built-in auth.users
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up (OTP or Google OAuth).
-- Google populates raw_user_meta_data with 'full_name'/'name'; OTP signups
-- have neither yet — the login page collects the name right after and
-- updates this row, so a null here is expected and handled by the frontend.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- EVENTS — managed entirely from the admin panel
-- ---------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tagline text not null default 'Open Jam Night',
  event_date timestamptz not null,
  venue text not null,
  price integer not null check (price >= 0),
  description text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;

-- Anyone (including logged-out visitors) can see published events
create policy "Published events are public"
  on public.events for select
  using (is_published = true);

-- Admins can see every event, published or not
create policy "Admins can view all events"
  on public.events for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create policy "Admins can insert events"
  on public.events for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create policy "Admins can update events"
  on public.events for update
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create policy "Admins can delete events"
  on public.events for delete
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- ORDERS — one row per ticket booking
-- ---------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,

  -- snapshot of the event at time of booking, so later edits to the
  -- event (or even deletion) never change a user's past order history
  event_name text not null,
  event_date timestamptz not null,
  event_venue text not null,

  price_per_seat integer not null,
  quantity integer not null check (quantity between 1 and 10),
  subtotal integer not null,
  fee integer not null,
  total integer not null,

  attendee_name text,
  attendee_email text,
  attendee_phone text,

  razorpay_order_id text unique,
  razorpay_payment_id text,
  status text not null default 'pending' check (status in ('pending','paid','failed')),

  created_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Users can view their own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "Admins can view all orders"
  on public.orders for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- Inserts/updates to orders happen only from the server (service role key),
-- which bypasses RLS entirely — so no insert/update policy is needed here
-- for regular users. This keeps payment records tamper-proof.

-- ---------------------------------------------------------------
-- Make yourself an admin after your first login:
--   update public.profiles set is_admin = true where id = 'YOUR-USER-UUID';
-- (find your UUID in Authentication → Users in the Supabase dashboard)
-- ---------------------------------------------------------------
