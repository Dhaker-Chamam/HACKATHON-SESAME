-- Booking and appointments: functions called by the browser through supabase.rpc().
--
-- Errors use PostgREST custom codes (PTxxx sets the HTTP status) with a machine-readable hint:
--   PT401 not_authenticated | PT404 slot_not_found, appointment_not_found
--   PT409 slot_taken, already_cancelled | PT400 slot_in_past, device_not_supported, ...
--
-- book_slot and cancel_appointment must change slots that users cannot write directly, so the
-- privileged part lives in a non-exposed schema (private) as SECURITY DEFINER with an explicit
-- auth.uid() check. The public wrappers are SECURITY INVOKER and only signed-in users may call them.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Great-circle distance between two points on a sphere of the given radius.
create or replace function public.haversine_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision,
  radius_km double precision
) returns double precision
language sql immutable parallel safe
set search_path = ''
as $$
  select 2 * radius_km * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ))
$$;

-- Services required by the mitigations of an assessment (factor names from POST /api/assess).
create or replace function public.required_services(p_device_id text, p_factors text[])
returns setof public.services
language sql stable security invoker
set search_path = ''
as $$
  select distinct s.*
  from public.service_rules r
  join public.services s on s.id = r.service_id
  where r.device_id = p_device_id and r.factor = any (p_factors)
  order by s.sort_order, s.id
$$;

-- Providers of one type at a destination, filtered by device and service, nearest first.
-- Surface sites: haversine distance on the destination's mean radius.
-- Orbital stations: transfer time from the user's base station instead of a distance.
create or replace function public.find_providers(
  p_destination_id text,
  p_type text,
  p_base_site_id text,
  p_device_id text default null,
  p_service_id text default null
) returns table (
  provider_id text, name text, organization text, provider_type text,
  site_id text, site_name text, supported_devices text[], services text[],
  distance_km double precision, transfer_hours numeric,
  next_slot_at timestamptz, free_slots bigint, is_demo boolean
)
language sql stable security invoker
set search_path = ''
as $$
  select p.id, p.name, p.organization, p.type,
         s.id, s.name, p.supported_devices, p.services,
         case when s.kind = 'surface' and b.kind = 'surface' and d.mean_radius_km is not null
              then public.haversine_km(b.lat, b.lon, s.lat, s.lon, d.mean_radius_km) end,
         case when s.kind = 'station' then case when s.id = b.id then 0 else t.transfer_hours end end,
         ns.next_slot_at, ns.free_slots, p.is_demo
  from public.providers p
  join public.sites s on s.id = p.site_id
  join public.destinations d on d.id = s.destination_id
  join public.sites b on b.id = p_base_site_id and b.destination_id = s.destination_id
  left join public.site_transfers t on t.from_site_id = b.id and t.to_site_id = s.id
  left join lateral (
    select min(sl.starts_at) as next_slot_at, count(*) as free_slots
    from public.slots sl
    where sl.provider_id = p.id and not sl.is_booked and sl.starts_at > now()
  ) ns on true
  where s.destination_id = p_destination_id
    and p.type = p_type
    and (p_device_id is null or p_device_id = any (p.supported_devices))
    and (p_service_id is null or p_service_id = any (p.services))
  order by 9 nulls last, 10 nulls last, 2
$$;

-- Atomic booking. The slot row is locked, so two concurrent calls for the same slot are
-- serialized: the second one sees is_booked = true and fails with slot_taken. The partial
-- unique index on appointments(slot_id) is the safety net behind the lock.
create or replace function private.book_slot(
  p_slot_id uuid, p_device_id text, p_reason text, p_notes text, p_service_id text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_slot public.slots%rowtype;
  v_provider public.providers%rowtype;
  v_destination_id text;
  v_appt public.appointments%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = 'PT401', message = 'Please log in to book an appointment.', hint = 'not_authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception using errcode = 'PT403', message = 'This account has no traveler profile.', hint = 'no_profile';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode = 'PT400', message = 'Please give a reason for the appointment.', hint = 'invalid_reason';
  end if;
  if char_length(p_reason) > 500 or char_length(coalesce(p_notes, '')) > 500 then
    raise exception using errcode = 'PT400', message = 'Reason and notes can be at most 500 characters each.', hint = 'too_long';
  end if;

  select * into v_slot from public.slots where id = p_slot_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'This time slot no longer exists.', hint = 'slot_not_found';
  end if;
  if v_slot.is_booked then
    raise exception using errcode = 'PT409',
      message = 'This time slot was just booked by someone else. Please pick another time.', hint = 'slot_taken';
  end if;
  if v_slot.starts_at <= now() then
    raise exception using errcode = 'PT400', message = 'This time slot has already started.', hint = 'slot_in_past';
  end if;

  select * into v_provider from public.providers where id = v_slot.provider_id;
  if p_device_id is not null and not exists (select 1 from public.devices where id = p_device_id) then
    raise exception using errcode = 'PT400', message = 'Unknown device.', hint = 'unknown_device';
  end if;
  if v_provider.type = 'manufacturer_service' then
    if p_device_id is null or not (p_device_id = any (v_provider.supported_devices)) then
      raise exception using errcode = 'PT400', message = 'This service center does not support your device.', hint = 'device_not_supported';
    end if;
    if p_service_id is null or not (p_service_id = any (v_provider.services)) then
      raise exception using errcode = 'PT400', message = 'This service center does not offer that service.', hint = 'service_not_offered';
    end if;
  end if;
  select s.destination_id into v_destination_id from public.sites s where s.id = v_provider.site_id;

  update public.slots set is_booked = true where id = v_slot.id;
  insert into public.appointments
    (user_id, provider_id, slot_id, type, device_id, destination_id, service_id, reason, status, notes)
  values
    (v_uid, v_provider.id, v_slot.id, v_provider.type, p_device_id, v_destination_id,
     case when v_provider.type = 'manufacturer_service' then p_service_id end,
     btrim(p_reason),
     case when v_provider.type = 'manufacturer_service' then 'confirmed' else 'requested' end,
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning * into v_appt;

  return jsonb_build_object(
    'id', v_appt.id, 'status', v_appt.status, 'type', v_appt.type,
    'provider_id', v_provider.id, 'provider_name', v_provider.name,
    'starts_at', v_slot.starts_at, 'ends_at', v_slot.ends_at
  );
exception
  when unique_violation then
    raise exception using errcode = 'PT409',
      message = 'This time slot was just booked by someone else. Please pick another time.', hint = 'slot_taken';
end;
$$;

-- Atomic cancellation: marks the appointment cancelled and frees its slot in one transaction.
create or replace function private.cancel_appointment(p_appointment_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_appt public.appointments%rowtype;
  v_slot public.slots%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = 'PT401', message = 'Please log in to manage appointments.', hint = 'not_authenticated';
  end if;
  -- Someone else's appointment looks exactly like a missing one: nothing leaks.
  select * into v_appt from public.appointments where id = p_appointment_id and user_id = v_uid for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'Appointment not found.', hint = 'appointment_not_found';
  end if;
  if v_appt.status = 'cancelled' then
    raise exception using errcode = 'PT409', message = 'This appointment is already cancelled.', hint = 'already_cancelled';
  end if;
  if v_appt.status = 'completed' then
    raise exception using errcode = 'PT400', message = 'A completed appointment cannot be cancelled.', hint = 'already_completed';
  end if;
  select * into v_slot from public.slots where id = v_appt.slot_id for update;
  if v_slot.starts_at <= now() then
    raise exception using errcode = 'PT400', message = 'This appointment has already started.', hint = 'appointment_started';
  end if;

  update public.appointments set status = 'cancelled', cancelled_at = now() where id = v_appt.id;
  update public.slots set is_booked = false where id = v_slot.id;
  return jsonb_build_object('id', v_appt.id, 'status', 'cancelled', 'slot_id', v_slot.id);
end;
$$;

create or replace function public.book_slot(
  p_slot_id uuid, p_device_id text, p_reason text, p_notes text default null, p_service_id text default null
) returns jsonb
language sql security invoker
set search_path = ''
as $$
  select private.book_slot(p_slot_id, p_device_id, p_reason, p_notes, p_service_id)
$$;

create or replace function public.cancel_appointment(p_appointment_id uuid)
returns jsonb
language sql security invoker
set search_path = ''
as $$
  select private.cancel_appointment(p_appointment_id)
$$;

-- Execute rights: nothing is callable by default; grant exactly what each role needs.
revoke all on function public.haversine_km(double precision, double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.required_services(text, text[]) from public, anon, authenticated;
revoke all on function public.find_providers(text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.book_slot(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function private.cancel_appointment(uuid) from public, anon, authenticated;
revoke all on function public.book_slot(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cancel_appointment(uuid) from public, anon, authenticated;

grant execute on function public.required_services(text, text[]) to anon, authenticated;
grant execute on function public.haversine_km(double precision, double precision, double precision, double precision, double precision) to authenticated;
grant execute on function public.find_providers(text, text, text, text, text) to authenticated;
grant execute on function private.book_slot(uuid, text, text, text, text) to authenticated;
grant execute on function private.cancel_appointment(uuid) to authenticated;
grant execute on function public.book_slot(uuid, text, text, text, text) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
