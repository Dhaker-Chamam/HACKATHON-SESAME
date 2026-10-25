/* Bionic Passport assessment engine: browser fallback.
 * Same contract and same results as app/engine.py (checked by tests/test_parity.py).
 * Used only when POST /api/assess is unreachable. Reads data/destinations.json and data/devices.json.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BPEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const RANK = { compatible: 0, conditional: 1, not_compatible: 2 };
  const FACTOR_ORDER = ["gravity", "temperature", "pressure", "oxygen", "radiation", "dust", "light_delay"];
  const LABELS = {
    gravity: "Gravity", temperature: "Temperature", pressure: "Air pressure", oxygen: "Oxygen",
    radiation: "Radiation", dust: "Dust", light_delay: "Light delay to Earth",
  };

  class AssessError extends Error {
    constructor(message, notFound = false) { super(message); this.notFound = notFound; }
  }

  // ---------- number formatting (identical in app/engine.py) ----------
  const rnd = (x, d) => { const f = 10 ** d; return Math.floor(x * f + 0.5) / f; };
  function fmt(x, d = 1) {
    let s = rnd(x, d).toFixed(d);
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
    if (s === "-0") s = "0";
    return s.replace("-", "−");
  }
  const oneDelay = (s) => (s <= 1 ? "under 1 s" : s < 90 ? `${fmt(s, 1)} s` : `${fmt(s / 60, 1)} min`);
  function delayText(lo, hi) {
    if (hi <= 1) return "Under 1 s";
    if (hi < 90) return `${fmt(lo, 1)} to ${fmt(hi, 1)} s`;
    return `${fmt(lo / 60, 1)} to ${fmt(hi / 60, 1)} min`;
  }
  const worst = (statuses) => statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));

  // ---------- factors ----------
  function row(factor, value, limit, status, explanation, ref) {
    return {
      factor, label: LABELS[factor], destination_value: value, device_limit: limit, status, explanation,
      evidence_level: ref.evidence, verified: ref.verified === undefined ? true : ref.verified,
      source: { title: ref.source.title, url: ref.source.url },
    };
  }

  function gravity(ctx) {
    const { dest, dev, ratio } = ctx;
    const g = dest.gravity_ms2.value;
    const value = g === 0 ? "Microgravity" : `${fmt(g, 2)} m/s² (${fmt(ratio, 2)} g)`;
    const gf = dev.gravity_function;
    const pct = fmt(ratio * 100, 0);
    if (gf.value === "stance_assist") {
      const text = g === 0
        ? "In microgravity the knee carries no body weight, so walking settings do not apply. Leg volume also changes, which affects the socket fit."
        : `Stance support was tuned on Earth. Here you weigh ${pct}% of your Earth weight, so the knee will over-assist until it is recalibrated. Swing is mostly inertia and changes little.`;
      return row("gravity", value, "Tuned for Earth gravity (1 g)", "conditional", text, gf);
    }
    if (gf.value === "rate_response") {
      const text = g === 0
        ? "The heart-rate boost comes from a motion sensor. In microgravity, moving and exercising feel very different to the sensor, so the boost may be too weak."
        : `The heart-rate boost comes from a motion sensor. Walking at ${pct}% of Earth weight moves the body differently, so the boost may be too weak during effort.`;
      return row("gravity", value, "Motion sensor tuned on Earth", "conditional", text, gf);
    }
    if (gf.value === "bubble_removal") {
      const limit = "Priming relies on bubbles rising";
      if (g === 0) return row("gravity", value, limit, "conditional", "Air bubbles do not rise in microgravity, so normal priming steps may not remove them.", gf);
      return row("gravity", value, limit, "compatible", "Bubbles still rise, just more slowly. Allow extra time when priming.", gf);
    }
    return row("gravity", value, "No gravity-dependent function", "compatible", "Works the same at any gravity.", gf);
  }

  function temperature(ctx) {
    const { dest, dev, policy } = ctx;
    const cabin = dest.cabin_temp_c, outside = dest.outside_temp_c;
    const value = `${fmt(cabin.min, 0)} to ${fmt(cabin.max, 0)} °C inside`;
    const outsideTxt = `${fmt(outside.min, 0)} to ${fmt(outside.max, 0)} °C`;
    if (dev.worn === "implanted") {
      return row("temperature", value, "Body temperature (implanted)", "compatible",
        `Implanted devices stay at body temperature. The outside range (${outsideTxt}) never reaches them.`, cabin);
    }
    const op = dev.operating_temp_c;
    const ranges = [op].concat(dev.charging_temp_c ? [dev.charging_temp_c] : []);
    const margin = Math.min(...ranges.map((r) => Math.min(cabin.min - r.min, r.max - cabin.max)));
    let limit = `Works ${fmt(op.min, 0)} to ${fmt(op.max, 0)} °C`;
    if (dev.charging_temp_c) limit += `, charges ${fmt(dev.charging_temp_c.min, 0)} to ${fmt(dev.charging_temp_c.max, 0)} °C`;
    let status, text;
    if (margin < 0) { status = "not_compatible"; text = "The cabin range goes beyond the temperatures the device is rated for."; }
    else if (margin < policy.temperature_margin_c.value) { status = "conditional"; text = `Inside the base, the margin to the device's limit is only ${fmt(margin, 0)} °C.`; }
    else {
      status = "compatible";
      text = `Inside the base it stays within the device's range, with at least ${fmt(margin, 0)} °C to spare. The outside range (${outsideTxt}) never reaches a worn device.`;
    }
    return row("temperature", value, limit, status, text, op);
  }

  function pressure(ctx) {
    const { dest, dev, policy } = ctx;
    const p = dest.cabin_pressure_kpa.value;
    const value = `${fmt(p, 1)} kPa cabin`;
    if (dev.worn === "implanted") {
      const ref = policy.implant_reference_kpa;
      const limit = `Sealed implant; routinely exposed down to ${fmt(ref.value, 1)} kPa (airliner cabin)`;
      if (p >= ref.value) {
        return row("pressure", value, limit, "compatible",
          "Cabin pressure is at or above an airliner cabin, which people with implants experience routinely.", ref);
      }
      const pct = fmt((1 - p / ref.value) * 100, 0);
      return row("pressure", value, limit, "conditional",
        `Cabin pressure is ${pct}% below an airliner cabin, the lowest pressure implants routinely see. The sealed case is not expected to fail, but no test data was found.`, ref);
    }
    let rating = dev.pressure_rating_kpa;
    const presumed = rating === null || rating === undefined;
    let limit;
    if (presumed) {
      rating = policy.presumed_pressure_kpa;
      limit = `No published rating (assumed ${fmt(rating.min, 0)} to ${fmt(rating.max, 0)} kPa)`;
    } else {
      limit = `Rated ${fmt(rating.min, 1)} to ${fmt(rating.max, 1)} kPa`;
    }
    const lo = rating.min, hi = rating.max;
    let ratingStatus, text;
    if (lo <= p && p <= hi) { ratingStatus = "compatible"; text = "Cabin pressure is inside the device's rated range."; }
    else if (p > hi) { ratingStatus = "conditional"; text = "Cabin pressure is above the device's rated range."; }
    else if (p >= policy.not_compatible_fraction.value * lo) {
      ratingStatus = "conditional";
      text = `Cabin pressure is ${fmt((1 - p / lo) * 100, 0)}% below the lowest pressure the device is rated for. Outside the range means untested, not proven unsafe.`;
    } else { ratingStatus = "not_compatible"; text = "Cabin pressure is less than half the lowest pressure the device is rated for."; }
    if (presumed) text = "The maker publishes no pressure rating. " + text;

    let ref = rating, status = ratingStatus;
    if (dev.fluid_path) {
      const arrival = dest.arrival_pressure_kpa;
      const expansion = arrival.from / arrival.to;
      if (expansion > policy.gas_expansion_negligible.value) {
        const airliner = policy.gas_expansion_airliner;
        text += ` On arrival, air in the reservoir expands ${fmt(expansion, 2)} times; an airliner climb (${fmt(airliner.value, 2)} times) already causes unintended insulin delivery.`;
        status = worst([status, "conditional"]);
        if (ratingStatus === "compatible") ref = airliner;
      }
    }
    return row("pressure", value, limit, status, text, ref);
  }

  function oxygen(ctx) {
    const { dest, dev, policy } = ctx;
    const o2 = dest.oxygen_percent;
    const value = `${fmt(o2.value, 1)}% oxygen`;
    const battery = dev.battery;
    if (dev.worn === "implanted") {
      return row("oxygen", value, "Sealed inside the body", "compatible", "The battery is sealed inside the body, away from cabin air.", o2);
    }
    const limit = `Battery: ${battery.value}`;
    const threshold = policy.oxygen_enriched_percent;
    if (o2.value <= threshold.value) return row("oxygen", value, limit, "compatible", "Normal oxygen level.", o2);
    let text = `The air is ${fmt(o2.value, 1)}% oxygen, above the ${fmt(threshold.value, 1)}% limit for oxygen-enriched air, where materials ignite more easily. The battery needs a safety review.`;
    if (battery.evidence === "Manufacturer spec" && battery.note) text += " " + battery.note;
    return row("oxygen", value, limit, "conditional", text, threshold);
  }

  function radiation(ctx) {
    const { dest, dev, policy, stayDays } = ctx;
    const rate = dest.radiation_msv_day;
    const transitDays = dest.transit_days_each_way.value;
    const transitRate = dest.transit_radiation_msv_day ? dest.transit_radiation_msv_day.value : 0;
    const totalMsv = stayDays * rate.value + 2 * transitDays * transitRate;
    const maxGy = totalMsv / 1000;
    const value = `${fmt(rate.value, 2)} mSv/day; about ${fmt(totalMsv, 0)} mSv in total` + (transitDays ? " with travel" : "");
    const low = policy.dose_low_gy.value, high = policy.dose_high_gy.value;
    const limit = `Low-risk total dose: under ${fmt(low, 0)} Gy`;
    const critical = dev.life_critical === "yes" || dev.life_critical === "yes_with_backup";
    if (maxGy > high) return row("radiation", value, limit, "not_compatible", `The total dose could reach ${fmt(maxGy, 2)} Gy, above the high-risk level for electronics.`, rate);
    if (maxGy >= low) return row("radiation", value, limit, "conditional", `The total dose could reach ${fmt(maxGy, 2)} Gy, a medium-risk level for electronics.`, rate);
    if (critical) {
      return row("radiation", value, limit, "conditional",
        `The total dose is low (at most ${fmt(maxGy, 2)} Gy). The open question is rare memory errors from cosmic rays, and their rate for this device is unknown.`, rate);
    }
    return row("radiation", value, limit, "compatible",
      `The total dose is low (at most ${fmt(maxGy, 2)} Gy). A rare memory error would mean restoring settings, not a danger.`, rate);
  }

  function dust(ctx) {
    const { dest, dev } = ctx;
    const d = dest.dust, devDust = dev.dust;
    const value = d.value === "none" ? "None expected" : "Dust gets inside the base";
    const limit = devDust.limit_text;
    if (d.value === "none") return row("dust", value, limit, "compatible", "No dust exposure expected.", d);
    if (devDust.value === "sensitive") return row("dust", value, limit, "conditional", `${devDust.note} ${d.note}`, d);
    return row("dust", value, limit, "compatible", "No exposed moving parts or openings.", devDust);
  }

  function lightDelay(ctx) {
    const { dest, dev, policy } = ctx;
    const delay = dest.light_delay_s, blackout = dest.blackout.value;
    const hiTxt = oneDelay(delay.max);
    const value = delayText(delay.min, delay.max) + (blackout ? " each way; two-week blackouts" : " each way");
    const follow = dev.follow_up;
    const blackoutTxt = blackout ? ", and two-week blackouts" : "";
    if (follow.value === "optional_cloud") {
      return row("light_delay", value, "Works without a link", "compatible", "Therapy runs on the device. Data uploads can wait for the link.", delay);
    }
    if (follow.value === "local_programming") {
      const limit = "Settings changes need a specialist";
      if (delay.max <= policy.live_session_max_delay_s.value) {
        return row("light_delay", value, limit, "compatible", "A live video session with your specialist on Earth works at this delay.", delay);
      }
      return row("light_delay", value, limit, "conditional",
        `Settings changes need a specialist. With up to ${hiTxt} each way${blackoutTxt}, a live session with Earth is not possible.`, delay);
    }
    let text = "Remote monitoring sends data through a home transmitter on Earth networks. Here it needs a link through the base network.";
    if (delay.max > policy.live_session_max_delay_s.value) text += ` Alerts could reach your clinic up to ${hiTxt} late${blackoutTxt}.`;
    return row("light_delay", value, "Needs a remote monitoring link", "conditional", text, follow);
  }

  const BUILDERS = { gravity, temperature, pressure, oxygen, radiation, dust, light_delay: lightDelay };

  // ---------- assessment ----------
  function mitigation(dev, factor, ctx) {
    const table = dev.mitigations || {};
    let entry = null;
    if (factor === "gravity" && ctx.dest.gravity_ms2.value === 0) entry = table.gravity_microgravity || null;
    entry = entry || table[factor] || { text: `Ask the manufacturer and your clinician how to handle ${LABELS[factor].toLowerCase()}.`, resolves: false };
    const text = entry.text.replace("{pressure_kpa}", fmt(ctx.dest.cabin_pressure_kpa.value, 1));
    return { factor, text, resolves: entry.resolves ? [factor] : [], reduces: entry.resolves ? [] : [factor] };
  }

  function recalibration(dev, ratio, bodyMass) {
    const model = dev.torque_model;
    if (!model) return null;
    const share = model.swing_gravity_share.value;
    const earth = [bodyMass * model.stance_nm_per_kg.value, bodyMass * model.swing_nm_per_kg.value];
    const destination = [earth[0] * ratio, earth[1] * (1 - share + share * ratio)];
    return {
      phases: ["stance", "swing"],
      earth_nm: earth.map((v) => rnd(v, 1)),
      destination_nm: destination.map((v) => rnd(v, 1)),
      g_ratio: rnd(ratio, 3),
      body_mass_kg: bodyMass,
      evidence_level: "Placeholder",
      note: "Earth torque values are PLACEHOLDER, replace with sourced data. Stance torque scales with weight (gravity); swing torque is mostly inertia and barely changes.",
      source: model.scaling_source,
    };
  }

  function summary(status, nChanges, openLabels, dev, dest, mitigated) {
    const short = dev.short, where = dest.where;
    if (mitigated && nChanges) {
      if (status === "compatible") return `With these changes, your ${short} should work ${where}.`;
      if (status === "not_compatible") return `Even with these changes, your ${short} should not be used ${where}.`;
      const noun = openLabels.length === 1 ? "risk remains" : "risks remain";
      return `With these changes, ${openLabels.length} ${noun} to watch: ${openLabels.join(", ")}.`;
    }
    if (status === "compatible") return `Your ${short} should work ${where} as it is.`;
    if (status === "not_compatible") return `Your ${short} should not be used ${where} as it is.`;
    return `Your ${short} can work ${where} after ${nChanges} ${nChanges === 1 ? "change" : "changes"}.`;
  }

  function assess(data, req) {
    const dests = Object.fromEntries(data.destinations.destinations.map((d) => [d.id, d]));
    const devs = Object.fromEntries(data.devices.devices.map((d) => [d.id, d]));
    const { destination_id: destId, device_id: devId, stay_days: stayDays } = req;
    const withMitigations = Boolean(req.with_mitigations);
    if (!dests[destId]) throw new AssessError(`Unknown destination '${destId}'.`, true);
    if (!devs[devId]) throw new AssessError(`Unknown device '${devId}'.`, true);
    if (!Number.isInteger(stayDays) || stayDays < 1 || stayDays > 1500) throw new AssessError("Stay length must be between 1 and 1500 days.");
    const dest = dests[destId], dev = devs[devId];
    const massSpec = dev.body_mass_kg;
    let bodyMass = null;
    if (massSpec) {
      bodyMass = req.body_mass_kg === null || req.body_mass_kg === undefined ? massSpec.default : req.body_mass_kg;
      if (!(massSpec.min <= bodyMass && bodyMass <= massSpec.max)) {
        throw new AssessError(`Body mass must be between ${fmt(massSpec.min, 0)} and ${fmt(massSpec.max, 0)} kg for the ${dev.short}.`);
      }
    }
    const ratio = dest.gravity_ms2.value / data.destinations.standard_gravity_ms2.value;
    const ctx = { dest, dev, policy: data.devices.policy, ratio, stayDays };

    const factors = FACTOR_ORDER.map((name) => BUILDERS[name](ctx));
    factors.sort((a, b) => (RANK[b.status] - RANK[a.status]) || (FACTOR_ORDER.indexOf(a.factor) - FACTOR_ORDER.indexOf(b.factor)));
    const mitigations = factors.filter((f) => f.status !== "compatible").map((f) => mitigation(dev, f.factor, ctx));
    const resolved = new Set(mitigations.filter((m) => m.resolves.length).map((m) => m.factor));

    const status = worst(factors.map((f) => f.status));
    const after = Object.fromEntries(factors.map((f) => [f.factor, resolved.has(f.factor) ? "compatible" : f.status]));
    const mitigatedStatus = worst(Object.values(after));
    const openLabels = factors.filter((f) => after[f.factor] !== "compatible").map((f) => f.label.toLowerCase());

    if (withMitigations) {
      for (const f of factors) {
        f.status_before = f.status;
        f.status = after[f.factor];
        f.fixed = f.status_before !== f.status;
      }
    }
    const shown = withMitigations ? mitigatedStatus : status;
    return {
      status: shown,
      summary: summary(shown, mitigations.length, openLabels, dev, dest, withMitigations),
      factors,
      mitigations: mitigations.map((m) => ({ text: m.text, resolves: m.resolves, reduces: m.reduces })),
      mitigated_status: mitigatedStatus,
      recalibration: bodyMass !== null ? recalibration(dev, ratio, bodyMass) : null,
      destination: { id: dest.id, name: dest.name },
      device: { id: dev.id, name: dev.name },
      stay_days: stayDays,
      with_mitigations: withMitigations,
    };
  }

  return { assess, AssessError, fmt, delayText };
});
