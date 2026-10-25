-- Create a booking profile automatically for every Supabase Auth user.
-- The booking RPC requires a public.profiles row, while auth.users is managed by Supabase.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    left(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Traveler'
      ),
      120
    ),
    'traveler'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Repair accounts created before this trigger was installed.
insert into public.profiles (id, full_name, role)
select
  u.id,
  left(
    coalesce(
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name',
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Traveler'
    ),
    120
  ),
  'traveler'
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
);
