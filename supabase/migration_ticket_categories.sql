-- Run once in Supabase → SQL Editor (safe to re-run)

-- 1. Event poster + ticket categories
alter table public.events add column if not exists poster_url text;
alter table public.events add column if not exists ticket_categories jsonb not null default '[]'::jsonb;
alter table public.events add column if not exists promo_codes jsonb not null default '[]'::jsonb;

-- 2. Remember which category each order was for
alter table public.orders add column if not exists ticket_category text;

-- 3. Public bucket for posters (anyone can view, only admins can upload)
insert into storage.buckets (id, name, public)
values ('event-posters', 'event-posters', true)
on conflict (id) do nothing;

drop policy if exists "Posters are public" on storage.objects;
create policy "Posters are public" on storage.objects
  for select using (bucket_id = 'event-posters');

drop policy if exists "Admins upload posters" on storage.objects;
create policy "Admins upload posters" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-posters' and (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)));

drop policy if exists "Admins update posters" on storage.objects;
create policy "Admins update posters" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-posters' and (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)));

drop policy if exists "Admins delete posters" on storage.objects;
create policy "Admins delete posters" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-posters' and (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)));
