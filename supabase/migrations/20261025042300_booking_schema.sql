-- Booking and appointments: schema.
-- Builds on supabase/schema.sql (catalog tables). The existing public.destinations table is the
-- catalog the engine reads, so we extend it instead of creating a second destinations table.

-- 1. Destinations: body type and mean radius (used by the haversine distance).
alter table public.destinations
  add column if not exists type text
    check (type in ('planet', 'moon', 'orbital', 'dwarf_planet', 'exoplanet')),
  add column if not exists mean_radius_km double precision
    check (mean_radius_km is null or mean_radius_km > 0);

comment on column public.destinations.mean_radius_km is
  'Volumetric mean radius (NASA fact sheets). Null for orbital destinations, which use transfer times.';

-- 2. Profiles: one row per auth user. Role is set by the seed or an admin, never by the user.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  role text not null default 'traveler' check (role in ('traveler', 'surgeon', 'provider')),
  -- Optional link to a catalog persona, so persona-based features follow the signed-in user.
  persona_id text references public.personas (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists profiles_persona_id_idx on public.profiles (persona_id);

-- 3. Sites: user bases and provider locations. Surface sites have coordinates; stations do not.
create table if not exists public.sites (
  id text primary key,
  destination_id text not null references public.destinations (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('surface', 'station')),
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  sort_order integer not null default 0,
  check ((kind = 'surface') = (lat is not null and lon is not null))
);
create index if not exists sites_destination_id_idx on public.sites (destination_id);

-- Transfer times between orbital stations (no meaningful surface distance in orbit).
create table if not exists public.site_transfers (
  from_site_id text not null references public.sites (id) on delete cascade,
  to_site_id text not null references public.sites (id) on delete cascade,
  transfer_hours numeric(5, 1) not null check (transfer_hours >= 0),
  primary key (from_site_id, to_site_id)
);
create index if not exists site_transfers_to_site_id_idx on public.site_transfers (to_site_id);

-- 4. Services that a mitigation can require, and the rules that link them.
create table if not exists public.services (
  id text primary key,
  name text not null,
  description text not null,
  sort_order integer not null default 0
);

create table if not exists public.service_rules (
  id bigint generated always as identity primary key,
  factor text not null
    check (factor in ('gravity', 'temperature', 'pressure', 'oxygen', 'radiation', 'dust', 'light_delay')),
  device_id text not null references public.devices (id) on delete cascade,
  service_id text not null references public.services (id) on delete cascade,
  unique (device_id, factor, service_id)
);
create index if not exists service_rules_service_id_idx on public.service_rules (service_id);

-- 5. Providers: manufacturer service centers and flight surgeons.
create table if not exists public.providers (
  id text primary key,
  type text not null check (type in ('manufacturer_service', 'flight_surgeon')),
  name text not null,
  organization text,
  site_id text not null references public.sites (id) on delete cascade,
  supported_devices text[] not null default '{}',
  services text[] not null default '{}',
  is_demo boolean not null default true
);
create index if not exists providers_site_id_idx on public.providers (site_id);
create index if not exists providers_supported_devices_idx on public.providers using gin (supported_devices);

-- 6. Slots: bookable times. One provider cannot have two slots starting at the same time.
create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.providers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_booked boolean not null default false,
  check (ends_at > starts_at),
  unique (provider_id, starts_at)  -- also serves as the (provider_id, starts_at) index
);

-- 7. Appointments.
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider_id text not null references public.providers (id),
  slot_id uuid not null references public.slots (id),
  type text not null check (type in ('flight_surgeon', 'manufacturer_service')),
  device_id text references public.devices (id),
  destination_id text not null references public.destinations (id),
  service_id text references public.services (id),
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'cancelled', 'completed')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

-- Safety net for double booking: at most one active (non-cancelled) appointment per slot.
-- A plain unique(slot_id) would stop a cancelled slot from ever being booked again.
create unique index if not exists appointments_active_slot_uidx
  on public.appointments (slot_id) where status <> 'cancelled';
create index if not exists appointments_user_id_idx on public.appointments (user_id);
create index if not exists appointments_provider_id_idx on public.appointments (provider_id);
create index if not exists appointments_slot_id_idx on public.appointments (slot_id);
create index if not exists appointments_device_id_idx on public.appointments (device_id);
create index if not exists appointments_destination_id_idx on public.appointments (destination_id);
create index if not exists appointments_service_id_idx on public.appointments (service_id);
