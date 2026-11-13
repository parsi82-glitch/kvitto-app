-- =====================================================================
-- Kvitto-app – fas 2: databas, behörigheter och fotolagring
-- Körs en gång i Supabase: SQL Editor → klistra in → Run.
-- Filen går att köra igen utan att något går sönder.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Medlemmar i hushållet
--    Bara konton som finns i den här listan får se och ändra kvitton.
--    Även om någon lyckas skapa ett konto ser den alltså ingenting.
-- ---------------------------------------------------------------------
create table if not exists public.household_members (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.household_members enable row level security;

-- Hjälpfunktion: är den inloggade användaren medlem?
-- "security definer" behövs för att funktionen ska kunna läsa medlemslistan
-- oberoende av listans egna regler. search_path = '' skyddar mot kapning.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m where m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

drop policy if exists "Medlemmar kan se medlemslistan" on public.household_members;
create policy "Medlemmar kan se medlemslistan"
  on public.household_members for select
  to authenticated
  using ((select public.is_member()));

-- Medlemslistan ändras bara av dig i Supabase (SQL Editor), aldrig från appen.
revoke all on public.household_members from anon, authenticated;
grant select on public.household_members to authenticated;

-- ---------------------------------------------------------------------
-- 2. Kvitton
-- ---------------------------------------------------------------------
create table if not exists public.receipts (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  store          text not null check (char_length(btrim(store)) between 1 and 200),
  amount         numeric(12, 2) not null check (amount > 0),
  category       text not null check (char_length(category) between 1 and 100),
  classification text not null check (classification in ('grund', 'reparation', 'drift')),
  comment        text not null default '' check (char_length(comment) <= 2000),
  photo_path     text check (photo_path is null or char_length(photo_path) <= 300),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists receipts_date_idx on public.receipts (date desc);

alter table public.receipts enable row level security;

-- Uppdatera updated_at automatiskt vid varje ändring.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists receipts_touch_updated_at on public.receipts;
create trigger receipts_touch_updated_at
  before update on public.receipts
  for each row execute function public.touch_updated_at();

-- Regler: medlemmar får läsa, skapa, ändra och ta bort alla hushållets kvitton.
drop policy if exists "Medlemmar kan läsa kvitton" on public.receipts;
create policy "Medlemmar kan läsa kvitton"
  on public.receipts for select to authenticated
  using ((select public.is_member()));

drop policy if exists "Medlemmar kan skapa kvitton" on public.receipts;
create policy "Medlemmar kan skapa kvitton"
  on public.receipts for insert to authenticated
  with check ((select public.is_member()));

drop policy if exists "Medlemmar kan ändra kvitton" on public.receipts;
create policy "Medlemmar kan ändra kvitton"
  on public.receipts for update to authenticated
  using ((select public.is_member()))
  with check ((select public.is_member()));

drop policy if exists "Medlemmar kan ta bort kvitton" on public.receipts;
create policy "Medlemmar kan ta bort kvitton"
  on public.receipts for delete to authenticated
  using ((select public.is_member()));

-- Uttrycklig åtkomst (vi stängde av "Automatically expose new tables").
-- Utloggade (anon) får ingenting.
revoke all on public.receipts from anon, authenticated;
grant select, insert, update, delete on public.receipts to authenticated;

-- ---------------------------------------------------------------------
-- 3. Fotolagring
--    Privat lagringsplats: foton kan bara hämtas av inloggade medlemmar.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipt-photos', 'receipt-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Medlemmar kan se kvittofoton" on storage.objects;
create policy "Medlemmar kan se kvittofoton"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipt-photos' and (select public.is_member()));

drop policy if exists "Medlemmar kan ladda upp kvittofoton" on storage.objects;
create policy "Medlemmar kan ladda upp kvittofoton"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipt-photos' and (select public.is_member()));

drop policy if exists "Medlemmar kan ersätta kvittofoton" on storage.objects;
create policy "Medlemmar kan ersätta kvittofoton"
  on storage.objects for update to authenticated
  using (bucket_id = 'receipt-photos' and (select public.is_member()))
  with check (bucket_id = 'receipt-photos' and (select public.is_member()));

drop policy if exists "Medlemmar kan ta bort kvittofoton" on storage.objects;
create policy "Medlemmar kan ta bort kvittofoton"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipt-photos' and (select public.is_member()));
