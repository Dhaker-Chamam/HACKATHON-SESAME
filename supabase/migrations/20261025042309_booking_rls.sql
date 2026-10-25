-- Booking and appointments: grants and Row Level Security.
-- New public tables are not exposed to the Data API by default, so every grant is explicit.
-- Writes to slots and appointments happen only through the RPC functions (next migration).

alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.site_transfers enable row level security;
alter table public.services enable row level security;
alter table public.service_rules enable row level security;
alter table public.providers enable row level security;
alter table public.slots enable row level security;
alter table public.appointments enable row level security;

revoke all on public.profiles, public.sites, public.site_transfers, public.services, public.service_rules,
  public.providers, public.slots, public.appointments from anon, authenticated;

-- Reference data used to decide whether to show "Book appointment" (also before login).
grant select on public.services, public.service_rules to anon, authenticated;
create policy "Services are readable by everyone" on public.services
  for select to anon, authenticated using (true);
create policy "Service rules are readable by everyone" on public.service_rules
  for select to anon, authenticated using (true);

-- Directory data: signed-in users only.
grant select on public.sites, public.site_transfers, public.providers, public.slots to authenticated;
create policy "Sites are readable by signed-in users" on public.sites
  for select to authenticated using (true);
create policy "Transfers are readable by signed-in users" on public.site_transfers
  for select to authenticated using (true);
create policy "Providers are readable by signed-in users" on public.providers
  for select to authenticated using (true);
create policy "Slots are readable by signed-in users" on public.slots
  for select to authenticated using (true);

-- Profiles: each user reads only their own row. No update grant: role cannot be self-assigned.
grant select on public.profiles to authenticated;
create policy "Users read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

-- Appointments: each user reads only their own. Inserts and cancellations go through RPC.
grant select on public.appointments to authenticated;
create policy "Users read their own appointments" on public.appointments
  for select to authenticated using ((select auth.uid()) = user_id);
