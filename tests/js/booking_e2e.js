// End-to-end booking checks against the real Supabase project, through the public API with the
// publishable key, exactly like the browser. Run by tests/test_booking_e2e.py (opt-in), or:
//   node tests/js/booking_e2e.js            (reads SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY from .env)
// It creates and cancels bookings; run supabase/seed_booking.sql afterwards for a clean demo state.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..", "..");
const env = { ...process.env };
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
// static/vendor/supabase.js is a browser build that defines a global: load it the same way.
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "static", "vendor", "supabase.js"), "utf8"));
const { createClient } = globalThis.supabase;

const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_PUBLISHABLE_KEY;
const ACCOUNTS = {
  traveler: { email: "traveler@demo.test", password: "BionicTraveler-2030" },
  surgeon: { email: "surgeon@demo.test", password: "BionicSurgeon-2030" },
};
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail) });
const client = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function signedIn(who) {
  const c = client();
  const { error } = await c.auth.signInWithPassword(ACCOUNTS[who]);
  if (error) throw new Error(`sign-in ${who}: ${error.message}`);
  return c;
}

async function freeSlots(c, providerId, n) {
  const { data, error } = await c.from("slots").select("id, starts_at, is_booked")
    .eq("provider_id", providerId).eq("is_booked", false).gt("starts_at", new Date().toISOString())
    .order("starts_at").limit(n);
  if (error) throw error;
  return data;
}

async function slotBooked(c, id) {
  const { data } = await c.from("slots").select("is_booked").eq("id", id).single();
  return data.is_booked;
}

const book = (c, slotId, extra = {}) => c.rpc("book_slot", {
  p_slot_id: slotId, p_device_id: "powered_knee", p_reason: "E2E test: gravity recalibration",
  p_notes: "Automated test booking", p_service_id: "recalibration", ...extra,
});

async function main() {
  if (!URL || !KEY) throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required");

  // 1. Not signed in
  const anon = client();
  const anonBook = await anon.rpc("book_slot", { p_slot_id: "00000000-0000-0000-0000-000000000000", p_device_id: "powered_knee", p_reason: "x" });
  check("Anonymous user cannot book", anonBook.error, anonBook.error && `${anonBook.error.code} ${anonBook.error.message}`);
  const anonAppts = await anon.from("appointments").select("id");
  check("Anonymous user cannot read appointments", anonAppts.error || anonAppts.data.length === 0, anonAppts.error ? anonAppts.error.code : `${anonAppts.data.length} rows`);
  const anonServices = await anon.from("services").select("id");
  check("Services are public reference data", !anonServices.error && anonServices.data.length >= 5, anonServices.error ? anonServices.error.message : `${anonServices.data.length} services`);

  const traveler = await signedIn("traveler");
  const surgeon = await signedIn("surgeon");
  const travelerId = (await traveler.auth.getUser()).data.user.id;

  // 2. Seeded data
  const seeded = await traveler.from("appointments").select("id, type, status");
  const surgeonVisits = (seeded.data || []).filter((a) => a.type === "flight_surgeon");
  check("Traveler has seeded flight surgeon appointments", surgeonVisits.length >= 2, `${surgeonVisits.length} flight surgeon appointments`);

  // 3. Required services for a knee result on the Moon
  const req = await traveler.rpc("required_services", { p_device_id: "powered_knee", p_factors: ["gravity", "pressure", "oxygen", "dust"] });
  const reqIds = (req.data || []).map((s) => s.id);
  check("Knee mitigations require recalibration and seal replacement", reqIds.includes("recalibration") && reqIds.includes("seal_replacement"), reqIds.join(", "));

  // 4. Filter and sort at the Moon
  const moonBase = "moon-shackleton";
  const moon = await traveler.rpc("find_providers", { p_destination_id: "moon", p_type: "manufacturer_service", p_base_site_id: moonBase, p_device_id: "powered_knee", p_service_id: "recalibration" });
  const moonList = moon.data || [];
  const sorted = moonList.every((p, i) => i === 0 || moonList[i - 1].distance_km <= p.distance_km);
  const supports = moonList.every((p) => p.supported_devices.includes("powered_knee") && p.services.includes("recalibration"));
  check("Moon centers for knee recalibration: found, filtered, nearest first", moonList.length >= 1 && sorted && supports,
    moonList.map((p) => `${p.name} ${Math.round(p.distance_km)} km`).join(" | "));
  const seals = await traveler.rpc("find_providers", { p_destination_id: "moon", p_type: "manufacturer_service", p_base_site_id: moonBase, p_device_id: "powered_knee", p_service_id: "seal_replacement" });
  const sealIds = (seals.data || []).map((p) => p.provider_id).sort().join();
  check("Changing the service changes the list", sealIds !== moonList.map((p) => p.provider_id).sort().join(), `seal replacement: ${(seals.data || []).map((p) => p.name).join(", ")}`);

  // 5. Switching destination changes the list; orbit shows transfer time
  const mars = await traveler.rpc("find_providers", { p_destination_id: "mars", p_type: "manufacturer_service", p_base_site_id: "mars-jezero", p_device_id: "powered_knee", p_service_id: "recalibration" });
  const marsIds = new Set((mars.data || []).map((p) => p.provider_id));
  check("Switching to Mars gives a different provider list", marsIds.size >= 1 && moonList.every((p) => !marsIds.has(p.provider_id)),
    (mars.data || []).map((p) => `${p.name} ${Math.round(p.distance_km)} km`).join(" | "));
  const orbit = await traveler.rpc("find_providers", { p_destination_id: "orbit", p_type: "manufacturer_service", p_base_site_id: "orbit-meridian", p_device_id: "powered_knee", p_service_id: "recalibration" });
  check("Orbital Habitat shows transfer time instead of km", (orbit.data || []).length >= 1 && orbit.data.every((p) => p.transfer_hours !== null && p.distance_km === null),
    (orbit.data || []).map((p) => `${p.name} ${p.transfer_hours} h`).join(" | "));

  // 6. Book a slot
  const provider = moonList[0];
  const [slotA, slotB] = await freeSlots(traveler, provider.provider_id, 2);
  const first = await book(traveler, slotA.id);
  check("Traveler books a free slot", !first.error && first.data.status === "confirmed", first.error ? first.error.message : `${first.data.provider_name} at ${first.data.starts_at}`);
  check("Booked slot is marked taken", await slotBooked(traveler, slotA.id));

  // 7. Double booking must fail
  const again = await book(traveler, slotA.id);
  check("Booking the same slot again fails (slot_taken)", again.error && again.error.hint === "slot_taken", again.error && `${again.error.code} ${again.error.message}`);
  const other = await book(surgeon, slotA.id);
  check("Another user cannot take the booked slot", other.error && other.error.hint === "slot_taken", other.error && other.error.code);

  // 8. Two users race for the same slot at the same time: exactly one wins
  const race = await Promise.all([book(traveler, slotB.id), book(surgeon, slotB.id)]);
  const winners = race.filter((r) => !r.error);
  const losers = race.filter((r) => r.error && r.error.hint === "slot_taken");
  check("Concurrent booking: exactly one succeeds", winners.length === 1 && losers.length === 1,
    race.map((r) => (r.error ? r.error.hint : "booked")).join(" vs "));

  // 9. Isolation between users
  const seen = await surgeon.from("appointments").select("id, user_id");
  check("Surgeon cannot see the traveler's appointments", !seen.error && seen.data.every((a) => a.user_id !== travelerId), `surgeon sees ${seen.data ? seen.data.length : "?"} rows, none of the traveler's`);
  const steal = await surgeon.rpc("cancel_appointment", { p_appointment_id: first.data.id });
  check("Surgeon cannot cancel the traveler's appointment", steal.error && steal.error.hint === "appointment_not_found", steal.error && steal.error.code);
  const tamper = await surgeon.from("slots").update({ is_booked: false }).eq("id", slotA.id).select();
  check("Users cannot change slots directly", tamper.error || (tamper.data || []).length === 0, tamper.error ? tamper.error.code : "0 rows changed");
  check("Slot still booked after the attempt", await slotBooked(traveler, slotA.id));
  const forge = await surgeon.from("appointments").insert({ user_id: travelerId, provider_id: provider.provider_id, slot_id: slotA.id, type: "manufacturer_service", destination_id: "moon", reason: "forged" });
  check("Users cannot insert appointments directly", forge.error, forge.error && forge.error.code);
  const profiles = await surgeon.from("profiles").select("id");
  check("A user only sees their own profile", !profiles.error && profiles.data.length === 1, `${profiles.data ? profiles.data.length : "?"} profile rows`);

  // 10. Cancel frees the slot, atomically, and it can be booked again
  const cancel = await traveler.rpc("cancel_appointment", { p_appointment_id: first.data.id });
  check("Traveler cancels the appointment", !cancel.error && cancel.data.status === "cancelled", cancel.error && cancel.error.message);
  check("Cancelled slot is free again", !(await slotBooked(traveler, slotA.id)));
  const twice = await traveler.rpc("cancel_appointment", { p_appointment_id: first.data.id });
  check("Cancelling twice fails (already_cancelled)", twice.error && twice.error.hint === "already_cancelled", twice.error && twice.error.code);
  const rebook = await book(surgeon, slotA.id);
  check("The freed slot can be booked again", !rebook.error, rebook.error && rebook.error.message);

  // Clean up the bookings this test made.
  if (!rebook.error) await surgeon.rpc("cancel_appointment", { p_appointment_id: rebook.data.id });
  for (const [i, r] of race.entries()) {
    if (!r.error) await (i === 0 ? traveler : surgeon).rpc("cancel_appointment", { p_appointment_id: r.data.id });
  }
}

main()
  .catch((err) => check("Test run completed", false, err.stack || err.message))
  .finally(() => {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
    process.exitCode = results.every((r) => r.ok) ? 0 : 1;
  });
