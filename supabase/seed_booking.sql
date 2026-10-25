-- Bionic Passport booking demo data. Run after the four booking migrations.
-- Re-runnable: it resets all booking data and creates slots for the next 14 days from now().
--
-- ALL PROVIDERS AND PEOPLE BELOW ARE FICTIONAL. Site names are real places; coordinates are
-- approximate published values, used only to compute demo distances.
--
-- Demo accounts (Supabase Auth, email + password):
--   traveler@demo.test   BionicTraveler-2030   (role traveler, has 3 seeded appointments)
--   surgeon@demo.test    BionicSurgeon-2030    (role surgeon, no appointments)

begin;

-- 1. Demo accounts and profiles ------------------------------------------------------------
do $$
declare
  u record;
  v_id uuid;
begin
  for u in
    select * from (values
      ('traveler@demo.test', 'BionicTraveler-2030', 'Alex Mercer', 'traveler', 'alex'),
      ('surgeon@demo.test', 'BionicSurgeon-2030', 'Dr. Lina Okafor', 'surgeon', null)
    ) as t (email, password, full_name, role, persona_id)
  loop
    select id into v_id from auth.users where email = u.email;
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, phone_change, phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email,
        extensions.crypt(u.password, extensions.gen_salt('bf')), now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', u.full_name), now(), now(),
        '', '', '', '', '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true),
              'email', now(), now(), now());
    else
      update auth.users
      set encrypted_password = extensions.crypt(u.password, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = v_id;
    end if;
    insert into public.profiles (id, full_name, role, persona_id) values (v_id, u.full_name, u.role, u.persona_id)
    on conflict (id) do update
      set full_name = excluded.full_name, role = excluded.role, persona_id = excluded.persona_id;
  end loop;
end $$;

-- 2. Destination type and mean radius (NASA fact sheets: Moon 1737.4 km, Mars 3389.5 km) ---
update public.destinations d
set type = v.type, mean_radius_km = v.radius
from (values
  ('orbit', 'orbital', null::double precision),
  ('moon', 'moon', 1737.4),
  ('mars', 'planet', 3389.5),
  ('mercury', 'planet', null), ('venus', 'planet', null),
  ('ceres', 'dwarf_planet', null), ('pluto', 'dwarf_planet', null),
  ('europa', 'moon', null), ('titan', 'moon', null), ('ganymede', 'moon', null),
  ('callisto', 'moon', null), ('enceladus', 'moon', null),
  ('proxima_b', 'exoplanet', null), ('trappist_1e', 'exoplanet', null), ('kepler_452b', 'exoplanet', null)
) as v (id, type, radius)
where d.id = v.id;

-- 3. Reset booking data (demo project only) ---------------------------------------------------
delete from public.appointments;
delete from public.slots;
delete from public.providers;
delete from public.site_transfers;
delete from public.sites;
delete from public.service_rules;
delete from public.services;

-- 4. Services and the rules that link mitigations to them ------------------------------------
insert into public.services (id, name, description, sort_order) values
  ('recalibration', 'Gravity recalibration', 'Retune weight-dependent settings for the destination''s gravity.', 1),
  ('battery_swap', 'Battery safety check and swap', 'Battery review for oxygen-rich cabin air and a certified spare battery.', 2),
  ('seal_replacement', 'Dust seal replacement', 'New joint seals, covers and a cleaning kit against fine dust.', 3),
  ('pressure_test', 'Low-pressure chamber test', 'Test the device at the habitat''s cabin pressure.', 4),
  ('device_check', 'Device check-up', 'Device interrogation, log review and a check of the backup mode.', 5),
  ('reprogramming', 'Settings programming', 'Program trip presets and hand over the programming tools.', 6);

-- Derived from the device catalog, so every device gets rules that match its own data.
insert into public.service_rules (factor, device_id, service_id)
select r.factor, d.id, r.service_id
from public.devices d
cross join lateral (values
  ('gravity', case d.data->'gravity_function'->>'value'
                when 'stance_assist' then 'recalibration'
                when 'rate_response' then 'reprogramming' end),
  ('pressure', case when d.data->>'worn' = 'implanted' then 'device_check' else 'pressure_test' end),
  ('oxygen', case when d.data->>'worn' <> 'implanted'
                   and coalesce(d.data->'battery'->>'value', 'none') <> 'none' then 'battery_swap' end),
  ('dust', case when d.data->'dust'->>'value' = 'sensitive' then 'seal_replacement' end),
  ('radiation', case when d.data->>'life_critical' in ('yes', 'yes_with_backup') then 'device_check' end),
  ('light_delay', case d.data->'follow_up'->>'value'
                    when 'local_programming' then 'reprogramming'
                    when 'remote_monitoring' then 'device_check' end)
) as r (factor, service_id)
where r.service_id is not null;

-- 5. Sites --------------------------------------------------------------------------------------
insert into public.sites (id, destination_id, name, kind, lat, lon, sort_order) values
  ('orbit-meridian', 'orbit', 'Meridian Station', 'station', null, null, 1),
  ('orbit-halcyon', 'orbit', 'Halcyon Ring', 'station', null, null, 2),
  ('orbit-kestrel', 'orbit', 'Kestrel Outpost', 'station', null, null, 3),
  ('moon-shackleton', 'moon', 'Shackleton rim', 'surface', -89.90, 0.00, 1),
  ('moon-malapert', 'moon', 'Malapert Massif', 'surface', -85.99, -2.93, 2),
  ('moon-mouton', 'moon', 'Mons Mouton', 'surface', -84.60, 31.30, 3),
  ('moon-degerlache', 'moon', 'de Gerlache rim', 'surface', -88.50, -87.10, 4),
  ('mars-jezero', 'mars', 'Jezero Crater', 'surface', 18.38, 77.58, 1),
  ('mars-gale', 'mars', 'Gale Crater', 'surface', -5.40, 137.80, 2),
  ('mars-arcadia', 'mars', 'Arcadia Planitia', 'surface', 47.20, -175.70, 3),
  ('mars-utopia', 'mars', 'Utopia Planitia', 'surface', 46.70, 117.50, 4);

-- Fictional transfer times between the fictional stations, both directions.
insert into public.site_transfers (from_site_id, to_site_id, transfer_hours)
select a, b, h from (values
  ('orbit-meridian', 'orbit-halcyon', 3.5),
  ('orbit-meridian', 'orbit-kestrel', 7.0),
  ('orbit-halcyon', 'orbit-kestrel', 5.0)
) as v (a, b, h)
union all
select b, a, h from (values
  ('orbit-meridian', 'orbit-halcyon', 3.5),
  ('orbit-meridian', 'orbit-kestrel', 7.0),
  ('orbit-halcyon', 'orbit-kestrel', 5.0)
) as v (a, b, h);

-- 6. Providers (fictional companies and doctors) ----------------------------------------------
insert into public.providers (id, type, name, organization, site_id, supported_devices, services) values
  -- Orbital Habitat
  ('orbit-svc-northwind', 'manufacturer_service', 'Northwind Mobility Service', 'Northwind Mobility (fictional)', 'orbit-halcyon',
     '{powered_knee,bionic_ankle,passive_knee}', '{recalibration,battery_swap,pressure_test}'),
  ('orbit-svc-corvane', 'manufacturer_service', 'Corvane Cardiac Care', 'Corvane Medical (fictional)', 'orbit-meridian',
     '{pacemaker,icd,leadless_pacemaker}', '{device_check,reprogramming}'),
  ('orbit-svc-glucora', 'manufacturer_service', 'Glucora Pump Service', 'Glucora (fictional)', 'orbit-kestrel',
     '{insulin_pump,cgm}', '{battery_swap,pressure_test,device_check}'),
  ('orbit-svc-sonivia', 'manufacturer_service', 'Sonivia Hearing Works', 'Sonivia (fictional)', 'orbit-halcyon',
     '{cochlear_implant}', '{battery_swap,pressure_test,reprogramming}'),
  ('orbit-svc-arcline', 'manufacturer_service', 'Arcline Bionics Depot', 'Arcline Bionics (fictional)', 'orbit-kestrel',
     '{powered_knee,cochlear_implant,dbs,vns}', '{recalibration,reprogramming,device_check}'),
  ('orbit-doc-takahashi', 'flight_surgeon', 'Dr. Mei Takahashi', 'Meridian Station Medical Bay', 'orbit-meridian',
     '{}', '{Pre-flight medical review,Device clearance consult}'),
  ('orbit-doc-haddad', 'flight_surgeon', 'Dr. Samir Haddad', 'Halcyon Ring Clinic', 'orbit-halcyon',
     '{}', '{Pre-flight medical review,Radiation briefing}'),
  -- Moon
  ('moon-svc-northwind', 'manufacturer_service', 'Northwind Mobility Service', 'Northwind Mobility (fictional)', 'moon-degerlache',
     '{powered_knee,bionic_ankle,passive_knee}', '{recalibration,seal_replacement,battery_swap,pressure_test}'),
  ('moon-svc-corvane', 'manufacturer_service', 'Corvane Cardiac Care', 'Corvane Medical (fictional)', 'moon-malapert',
     '{pacemaker,icd,leadless_pacemaker}', '{device_check,reprogramming}'),
  ('moon-svc-glucora', 'manufacturer_service', 'Glucora Pump Service', 'Glucora (fictional)', 'moon-mouton',
     '{insulin_pump,cgm}', '{battery_swap,pressure_test,device_check}'),
  ('moon-svc-sonivia', 'manufacturer_service', 'Sonivia Hearing Works', 'Sonivia (fictional)', 'moon-shackleton',
     '{cochlear_implant}', '{seal_replacement,battery_swap,pressure_test,reprogramming}'),
  ('moon-svc-arcline', 'manufacturer_service', 'Arcline Bionics Depot', 'Arcline Bionics (fictional)', 'moon-malapert',
     '{powered_knee,bionic_ankle,cochlear_implant,insulin_pump}', '{recalibration,battery_swap,pressure_test,reprogramming}'),
  ('moon-svc-halden', 'manufacturer_service', 'Halden Neuro Systems', 'Halden (fictional)', 'moon-mouton',
     '{dbs,vns,vp_shunt,cpap}', '{device_check,reprogramming,battery_swap,pressure_test,recalibration}'),
  ('moon-doc-osei', 'flight_surgeon', 'Dr. Imani Osei', 'Shackleton Aeromedical Clinic', 'moon-shackleton',
     '{}', '{Pre-flight medical review,Device clearance consult}'),
  ('moon-doc-varga', 'flight_surgeon', 'Dr. Tomas Varga', 'Malapert Flight Medicine', 'moon-malapert',
     '{}', '{Pre-flight medical review,Rehabilitation review}'),
  -- Mars
  ('mars-svc-northwind', 'manufacturer_service', 'Northwind Mobility Service', 'Northwind Mobility (fictional)', 'mars-jezero',
     '{powered_knee,bionic_ankle,passive_knee,ortho_implant}', '{recalibration,seal_replacement,battery_swap,pressure_test}'),
  ('mars-svc-redline', 'manufacturer_service', 'Redline Prosthetics Lab', 'Redline Labs (fictional)', 'mars-gale',
     '{powered_knee,bionic_ankle}', '{recalibration,seal_replacement}'),
  ('mars-svc-corvane', 'manufacturer_service', 'Corvane Cardiac Care', 'Corvane Medical (fictional)', 'mars-utopia',
     '{pacemaker,icd,leadless_pacemaker,heart_valve}', '{device_check,reprogramming}'),
  ('mars-svc-glucora', 'manufacturer_service', 'Glucora Pump Service', 'Glucora (fictional)', 'mars-arcadia',
     '{insulin_pump,cgm}', '{battery_swap,pressure_test,device_check}'),
  ('mars-svc-sonivia', 'manufacturer_service', 'Sonivia Hearing Works', 'Sonivia (fictional)', 'mars-jezero',
     '{cochlear_implant,iol}', '{seal_replacement,battery_swap,pressure_test,reprogramming}'),
  ('mars-svc-halden', 'manufacturer_service', 'Halden Neuro Systems', 'Halden (fictional)', 'mars-gale',
     '{dbs,vns,vp_shunt,cpap}', '{device_check,reprogramming,battery_swap,pressure_test,recalibration}'),
  ('mars-doc-brandt', 'flight_surgeon', 'Dr. Lea Brandt', 'Jezero Base Medical', 'mars-jezero',
     '{}', '{Pre-flight medical review,Radiation briefing}'),
  ('mars-doc-duarte', 'flight_surgeon', 'Dr. Rafael Duarte', 'Gale Crater Clinic', 'mars-gale',
     '{}', '{Pre-flight medical review,Device clearance consult}');

-- 7. Slots: 4 per day for the next 14 days (UTC), about one in four already booked -------------
insert into public.slots (provider_id, starts_at, ends_at, is_booked)
select p.id, t.ts, t.ts + interval '45 minutes', abs(hashtext(p.id || t.ts::text)) % 4 = 0
from public.providers p
cross join generate_series(date_trunc('day', now()) + interval '1 day',
                           date_trunc('day', now()) + interval '14 days', interval '1 day') as day
cross join unnest(array[interval '8 hours', interval '10 hours', interval '13 hours', interval '15 hours']) as h (offs)
cross join lateral (select day + h.offs as ts) as t;

-- One past slot for the completed appointment below.
insert into public.slots (provider_id, starts_at, ends_at, is_booked)
values ('moon-doc-osei', date_trunc('day', now()) - interval '12 days' + interval '10 hours',
        date_trunc('day', now()) - interval '12 days' + interval '10 hours 45 minutes', true);

-- 8. The traveler's flight surgeon appointments (1 past, 2 upcoming) ---------------------------
with traveler as (select id from auth.users where email = 'traveler@demo.test'),
picked as (
  update public.slots s set is_booked = true
  from (values
    ('moon-doc-osei', date_trunc('day', now()) - interval '12 days' + interval '10 hours'),
    ('moon-doc-varga', date_trunc('day', now()) + interval '3 days 10 hours'),
    ('mars-doc-brandt', date_trunc('day', now()) + interval '9 days 13 hours')
  ) as v (provider_id, starts_at)
  where s.provider_id = v.provider_id and s.starts_at = v.starts_at
  returning s.id, s.provider_id
)
insert into public.appointments (user_id, provider_id, slot_id, type, device_id, destination_id, reason, status, notes)
select traveler.id, picked.provider_id, picked.id, 'flight_surgeon', 'powered_knee', a.destination_id, a.reason, a.status, a.notes
from traveler, picked
join (values
  ('moon-doc-osei', 'moon', 'Pre-flight medical review for a 30-day lunar stay', 'completed',
   'Fit for the lunar stay. Follow up on the knee recalibration plan.'),
  ('moon-doc-varga', 'moon', 'Review of the knee recalibration plan before departure', 'confirmed',
   'Bring the prosthetist''s settings report.'),
  ('mars-doc-brandt', 'mars', 'Radiation and long-stay briefing before the Mars transfer', 'requested', null)
) as a (provider_id, destination_id, reason, status, notes) on a.provider_id = picked.provider_id;

commit;
