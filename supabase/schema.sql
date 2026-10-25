-- Bionic Passport catalog on Supabase (Postgres 17).
-- Reference data only: anyone may read it through the Data API, nobody may write through it.
-- Each row keeps the full JSON record from data/*.json in `data`, so the engine reads exactly
-- what the offline copy holds (jsonb drops object key order; nothing depends on it).
-- Load or refresh rows with: python scripts/export_supabase_seed.py

create table public.destinations (
  id text primary key,
  sort_order integer not null,
  name text not null,
  data jsonb not null check (data->>'id' = id)
);

create table public.devices (
  id text primary key,
  sort_order integer not null,
  name text not null,
  data jsonb not null check (data->>'id' = id)
);

create table public.personas (
  id text primary key,
  sort_order integer not null,
  name text not null,
  data jsonb not null check (data->>'id' = id)
);

create table public.dossiers (
  id text primary key,
  sort_order integer not null,
  persona_id text not null references public.personas (id),
  destination_id text not null references public.destinations (id),
  device_id text not null references public.devices (id),
  data jsonb not null check (data->>'id' = id)
);

create index dossiers_persona_id_idx on public.dossiers (persona_id);
create index dossiers_destination_id_idx on public.dossiers (destination_id);
create index dossiers_device_id_idx on public.dossiers (device_id);

-- The other top-level keys of each JSON file: _readme, standard_gravity_ms2, policy.
create table public.catalog_settings (
  collection text not null check (collection in ('destinations', 'devices', 'personas', 'dossiers')),
  key text not null,
  value jsonb not null,
  primary key (collection, key)
);

-- Read-only Data API access: explicit grants, RLS on, one select policy per table.
alter table public.destinations enable row level security;
alter table public.devices enable row level security;
alter table public.personas enable row level security;
alter table public.dossiers enable row level security;
alter table public.catalog_settings enable row level security;

revoke all on public.destinations, public.devices, public.personas, public.dossiers, public.catalog_settings
  from anon, authenticated;
grant select on public.destinations, public.devices, public.personas, public.dossiers, public.catalog_settings
  to anon, authenticated;

create policy "Catalog is readable by everyone" on public.destinations for select to anon, authenticated using (true);
create policy "Catalog is readable by everyone" on public.devices for select to anon, authenticated using (true);
create policy "Catalog is readable by everyone" on public.personas for select to anon, authenticated using (true);
create policy "Catalog is readable by everyone" on public.dossiers for select to anon, authenticated using (true);
create policy "Catalog is readable by everyone" on public.catalog_settings for select to anon, authenticated using (true);
