"""Bionic Passport assessment engine.

Pure, deterministic functions over data/destinations.json and data/devices.json.
static/engine.js implements the same contract for the browser fallback, and
tests/test_parity.py checks that both return identical results.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

RANK = {"compatible": 0, "conditional": 1, "not_compatible": 2}
FACTOR_ORDER = ["gravity", "temperature", "pressure", "oxygen", "radiation", "dust", "light_delay"]
LABELS = {
    "gravity": "Gravity", "temperature": "Temperature", "pressure": "Air pressure", "oxygen": "Oxygen",
    "radiation": "Radiation", "dust": "Dust", "light_delay": "Light delay to Earth",
}
EVIDENCE = {"Spaceflight data", "Aviation data", "Manufacturer spec", "Standard", "Research study",
            "Physics", "Team assumption", "Placeholder"}


class AssessError(ValueError):
    """Invalid request: unknown id or out-of-range input."""

    def __init__(self, message: str, not_found: bool = False):
        super().__init__(message)
        self.not_found = not_found


# ---------- number formatting (identical in static/engine.js) ----------

def rnd(x: float, d: int) -> float:
    f = 10 ** d
    return math.floor(x * f + 0.5) / f


def fmt(x: float, d: int = 1) -> str:
    s = f"{rnd(x, d):.{d}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    if s == "-0":
        s = "0"
    return s.replace("-", "−")


def one_delay(s: float) -> str:
    if s <= 1:
        return "under 1 s"
    return f"{fmt(s, 1)} s" if s < 90 else f"{fmt(s / 60, 1)} min"


def delay_text(lo: float, hi: float) -> str:
    if hi <= 1:
        return "Under 1 s"
    if hi < 90:
        return f"{fmt(lo, 1)} to {fmt(hi, 1)} s"
    return f"{fmt(lo / 60, 1)} to {fmt(hi / 60, 1)} min"


def worst(statuses) -> str:
    return max(statuses, key=lambda s: RANK[s])


# ---------- data ----------

def _check_value(path: str, obj: dict) -> None:
    if obj.get("evidence") not in EVIDENCE:
        raise ValueError(f"{path}: evidence must be one of {sorted(EVIDENCE)}")
    src = obj.get("source")
    if not isinstance(src, dict) or "title" not in src or "url" not in src:
        raise ValueError(f"{path}: source needs a title and a url (url may be null)")
    if obj["evidence"] == "Placeholder" and "PLACEHOLDER" not in obj.get("note", ""):
        raise ValueError(f"{path}: placeholder values must say PLACEHOLDER in their note")


def _walk(path: str, node) -> None:
    if isinstance(node, dict):
        if "evidence" in node:
            _check_value(path, node)
        for key, child in node.items():
            _walk(f"{path}.{key}", child)
    elif isinstance(node, list):
        for i, child in enumerate(node):
            _walk(f"{path}[{i}]", child)


def load_data(data_dir: Path = DATA_DIR) -> dict:
    dests = json.loads((data_dir / "destinations.json").read_text(encoding="utf-8"))
    devs = json.loads((data_dir / "devices.json").read_text(encoding="utf-8"))
    _walk("destinations", dests)
    _walk("devices", devs)
    return {"destinations": dests, "devices": devs}


# ---------- factors ----------

def _row(factor, dest_value, limit, status, explanation, ref) -> dict:
    return {
        "factor": factor,
        "label": LABELS[factor],
        "destination_value": dest_value,
        "device_limit": limit,
        "status": status,
        "explanation": explanation,
        "evidence_level": ref["evidence"],
        "verified": ref.get("verified", True),
        "source": {"title": ref["source"]["title"], "url": ref["source"]["url"]},
    }


def _gravity(ctx) -> dict:
    dest, dev, ratio = ctx["dest"], ctx["dev"], ctx["ratio"]
    g = dest["gravity_ms2"]["value"]
    value = "Microgravity" if g == 0 else f"{fmt(g, 2)} m/s² ({fmt(ratio, 2)} g)"
    gf = dev["gravity_function"]
    pct = fmt(ratio * 100, 0)
    kind = gf["value"]
    if kind == "stance_assist":
        limit = "Tuned for Earth gravity (1 g)"
        if g == 0:
            text = ("In microgravity the knee carries no body weight, so walking settings do not apply. "
                    "Leg volume also changes, which affects the socket fit.")
        else:
            text = (f"Stance support was tuned on Earth. Here you weigh {pct}% of your Earth weight, so the knee "
                    "will over-assist until it is recalibrated. Swing is mostly inertia and changes little.")
        return _row("gravity", value, limit, "conditional", text, gf)
    if kind == "rate_response":
        limit = "Motion sensor tuned on Earth"
        if g == 0:
            text = ("The heart-rate boost comes from a motion sensor. In microgravity, moving and exercising "
                    "feel very different to the sensor, so the boost may be too weak.")
        else:
            text = (f"The heart-rate boost comes from a motion sensor. Walking at {pct}% of Earth weight moves "
                    "the body differently, so the boost may be too weak during effort.")
        return _row("gravity", value, limit, "conditional", text, gf)
    if kind == "bubble_removal":
        limit = "Priming relies on bubbles rising"
        if g == 0:
            return _row("gravity", value, limit, "conditional",
                        "Air bubbles do not rise in microgravity, so normal priming steps may not remove them.", gf)
        return _row("gravity", value, limit, "compatible",
                    "Bubbles still rise, just more slowly. Allow extra time when priming.", gf)
    return _row("gravity", value, "No gravity-dependent function", "compatible",
                "Works the same at any gravity.", gf)


def _temperature(ctx) -> dict:
    dest, dev, policy = ctx["dest"], ctx["dev"], ctx["policy"]
    cabin, outside = dest["cabin_temp_c"], dest["outside_temp_c"]
    value = f"{fmt(cabin['min'], 0)} to {fmt(cabin['max'], 0)} °C inside"
    outside_txt = f"{fmt(outside['min'], 0)} to {fmt(outside['max'], 0)} °C"
    if dev["worn"] == "implanted":
        return _row("temperature", value, "Body temperature (implanted)", "compatible",
                    f"Implanted devices stay at body temperature. The outside range ({outside_txt}) never reaches them.",
                    cabin)
    op = dev["operating_temp_c"]
    ranges = [op] + ([dev["charging_temp_c"]] if dev.get("charging_temp_c") else [])
    margin = min(min(cabin["min"] - r["min"], r["max"] - cabin["max"]) for r in ranges)
    limit = f"Works {fmt(op['min'], 0)} to {fmt(op['max'], 0)} °C"
    if dev.get("charging_temp_c"):
        ch = dev["charging_temp_c"]
        limit += f", charges {fmt(ch['min'], 0)} to {fmt(ch['max'], 0)} °C"
    if margin < 0:
        status, text = "not_compatible", "The cabin range goes beyond the temperatures the device is rated for."
    elif margin < policy["temperature_margin_c"]["value"]:
        status, text = "conditional", f"Inside the base, the margin to the device's limit is only {fmt(margin, 0)} °C."
    else:
        status = "compatible"
        text = (f"Inside the base it stays within the device's range, with at least {fmt(margin, 0)} °C to spare. "
                f"The outside range ({outside_txt}) never reaches a worn device.")
    return _row("temperature", value, limit, status, text, op)


def _pressure(ctx) -> dict:
    dest, dev, policy = ctx["dest"], ctx["dev"], ctx["policy"]
    p = dest["cabin_pressure_kpa"]["value"]
    value = f"{fmt(p, 1)} kPa cabin"
    if dev["worn"] == "implanted":
        ref = policy["implant_reference_kpa"]
        limit = f"Sealed implant; routinely exposed down to {fmt(ref['value'], 1)} kPa (airliner cabin)"
        if p >= ref["value"]:
            return _row("pressure", value, limit, "compatible",
                        "Cabin pressure is at or above an airliner cabin, which people with implants experience routinely.",
                        ref)
        pct = fmt((1 - p / ref["value"]) * 100, 0)
        return _row("pressure", value, limit, "conditional",
                    f"Cabin pressure is {pct}% below an airliner cabin, the lowest pressure implants routinely see. "
                    "The sealed case is not expected to fail, but no test data was found.", ref)

    rating = dev.get("pressure_rating_kpa")
    presumed = rating is None
    if presumed:
        rating = policy["presumed_pressure_kpa"]
        limit = f"No published rating (assumed {fmt(rating['min'], 0)} to {fmt(rating['max'], 0)} kPa)"
    else:
        limit = f"Rated {fmt(rating['min'], 1)} to {fmt(rating['max'], 1)} kPa"
    lo, hi = rating["min"], rating["max"]
    if lo <= p <= hi:
        rating_status, text = "compatible", "Cabin pressure is inside the device's rated range."
    elif p > hi:
        rating_status, text = "conditional", "Cabin pressure is above the device's rated range."
    elif p >= policy["not_compatible_fraction"]["value"] * lo:
        rating_status = "conditional"
        text = (f"Cabin pressure is {fmt((1 - p / lo) * 100, 0)}% below the lowest pressure the device is rated for. "
                "Outside the range means untested, not proven unsafe.")
    else:
        rating_status = "not_compatible"
        text = "Cabin pressure is less than half the lowest pressure the device is rated for."
    if presumed:
        text = "The maker publishes no pressure rating. " + text

    ref, status = rating, rating_status
    if dev.get("fluid_path"):
        arrival = dest["arrival_pressure_kpa"]
        expansion = arrival["from"] / arrival["to"]
        if expansion > policy["gas_expansion_negligible"]["value"]:
            airliner = policy["gas_expansion_airliner"]
            text += (f" On arrival, air in the reservoir expands {fmt(expansion, 2)} times; an airliner climb "
                     f"({fmt(airliner['value'], 2)} times) already causes unintended insulin delivery.")
            status = worst([status, "conditional"])
            if rating_status == "compatible":
                ref = airliner
    return _row("pressure", value, limit, status, text, ref)


def _oxygen(ctx) -> dict:
    dest, dev, policy = ctx["dest"], ctx["dev"], ctx["policy"]
    o2 = dest["oxygen_percent"]
    value = f"{fmt(o2['value'], 1)}% oxygen"
    battery = dev["battery"]
    if dev["worn"] == "implanted":
        return _row("oxygen", value, "Sealed inside the body", "compatible",
                    "The battery is sealed inside the body, away from cabin air.", o2)
    limit = f"Battery: {battery['value']}"
    threshold = policy["oxygen_enriched_percent"]
    if o2["value"] <= threshold["value"]:
        return _row("oxygen", value, limit, "compatible", "Normal oxygen level.", o2)
    text = (f"The air is {fmt(o2['value'], 1)}% oxygen, above the {fmt(threshold['value'], 1)}% limit for "
            "oxygen-enriched air, where materials ignite more easily. The battery needs a safety review.")
    if battery["evidence"] == "Manufacturer spec" and battery.get("note"):
        text += " " + battery["note"]
    return _row("oxygen", value, limit, "conditional", text, threshold)


def _radiation(ctx) -> dict:
    dest, dev, policy, days = ctx["dest"], ctx["dev"], ctx["policy"], ctx["stay_days"]
    rate = dest["radiation_msv_day"]
    transit_days = dest["transit_days_each_way"]["value"]
    transit_rate = dest["transit_radiation_msv_day"]["value"] if dest.get("transit_radiation_msv_day") else 0
    total_msv = days * rate["value"] + 2 * transit_days * transit_rate
    max_gy = total_msv / 1000
    value = f"{fmt(rate['value'], 2)} mSv/day; about {fmt(total_msv, 0)} mSv in total" + (" with travel" if transit_days else "")
    low, high = policy["dose_low_gy"]["value"], policy["dose_high_gy"]["value"]
    limit = f"Low-risk total dose: under {fmt(low, 0)} Gy"
    critical = dev["life_critical"] in ("yes", "yes_with_backup")
    if max_gy > high:
        return _row("radiation", value, limit, "not_compatible",
                    f"The total dose could reach {fmt(max_gy, 2)} Gy, above the high-risk level for electronics.", rate)
    if max_gy >= low:
        return _row("radiation", value, limit, "conditional",
                    f"The total dose could reach {fmt(max_gy, 2)} Gy, a medium-risk level for electronics.", rate)
    if critical:
        return _row("radiation", value, limit, "conditional",
                    f"The total dose is low (at most {fmt(max_gy, 2)} Gy). The open question is rare memory errors "
                    "from cosmic rays, and their rate for this device is unknown.", rate)
    return _row("radiation", value, limit, "compatible",
                f"The total dose is low (at most {fmt(max_gy, 2)} Gy). A rare memory error would mean restoring "
                "settings, not a danger.", rate)


def _dust(ctx) -> dict:
    dest, dev = ctx["dest"], ctx["dev"]
    dust, dev_dust = dest["dust"], dev["dust"]
    value = "None expected" if dust["value"] == "none" else "Dust gets inside the base"
    limit = dev_dust["limit_text"]
    if dust["value"] == "none":
        return _row("dust", value, limit, "compatible", "No dust exposure expected.", dust)
    if dev_dust["value"] == "sensitive":
        return _row("dust", value, limit, "conditional", f"{dev_dust['note']} {dust['note']}", dust)
    return _row("dust", value, limit, "compatible", "No exposed moving parts or openings.", dev_dust)


def _light_delay(ctx) -> dict:
    dest, dev, policy = ctx["dest"], ctx["dev"], ctx["policy"]
    delay, blackout = dest["light_delay_s"], dest["blackout"]["value"]
    hi_txt = one_delay(delay["max"])
    value = delay_text(delay["min"], delay["max"]) + (" each way; two-week blackouts" if blackout else " each way")
    follow = dev["follow_up"]
    blackout_txt = ", and two-week blackouts" if blackout else ""
    if follow["value"] == "optional_cloud":
        return _row("light_delay", value, "Works without a link", "compatible",
                    "Therapy runs on the device. Data uploads can wait for the link.", delay)
    if follow["value"] == "local_programming":
        limit = "Settings changes need a specialist"
        if delay["max"] <= policy["live_session_max_delay_s"]["value"]:
            return _row("light_delay", value, limit, "compatible",
                        "A live video session with your specialist on Earth works at this delay.", delay)
        return _row("light_delay", value, limit, "conditional",
                    f"Settings changes need a specialist. With up to {hi_txt} each way{blackout_txt}, "
                    "a live session with Earth is not possible.", delay)
    text = ("Remote monitoring sends data through a home transmitter on Earth networks. "
            "Here it needs a link through the base network.")
    if delay["max"] > policy["live_session_max_delay_s"]["value"]:
        text += f" Alerts could reach your clinic up to {hi_txt} late{blackout_txt}."
    return _row("light_delay", value, "Needs a remote monitoring link", "conditional", text, follow)


BUILDERS = {"gravity": _gravity, "temperature": _temperature, "pressure": _pressure, "oxygen": _oxygen,
            "radiation": _radiation, "dust": _dust, "light_delay": _light_delay}


# ---------- assessment ----------

def _mitigation(dev: dict, factor: str, ctx) -> dict:
    table = dev.get("mitigations", {})
    entry = None
    if factor == "gravity" and ctx["dest"]["gravity_ms2"]["value"] == 0:
        entry = table.get("gravity_microgravity")
    entry = entry or table.get(factor)
    if entry is None:
        entry = {"text": f"Ask the manufacturer and your clinician how to handle {LABELS[factor].lower()}.", "resolves": False}
    text = entry["text"].replace("{pressure_kpa}", fmt(ctx["dest"]["cabin_pressure_kpa"]["value"], 1))
    return {"factor": factor, "text": text,
            "resolves": [factor] if entry["resolves"] else [],
            "reduces": [] if entry["resolves"] else [factor]}


def _recalibration(dev: dict, ratio: float, body_mass: float) -> dict | None:
    model = dev.get("torque_model")
    if not model:
        return None
    share = model["swing_gravity_share"]["value"]
    earth = [body_mass * model["stance_nm_per_kg"]["value"], body_mass * model["swing_nm_per_kg"]["value"]]
    destination = [earth[0] * ratio, earth[1] * (1 - share + share * ratio)]
    return {
        "phases": ["stance", "swing"],
        "earth_nm": [rnd(v, 1) for v in earth],
        "destination_nm": [rnd(v, 1) for v in destination],
        "g_ratio": rnd(ratio, 3),
        "body_mass_kg": body_mass,
        "evidence_level": "Placeholder",
        "note": ("Earth torque values are PLACEHOLDER, replace with sourced data. Stance torque scales with weight "
                 "(gravity); swing torque is mostly inertia and barely changes."),
        "source": model["scaling_source"],
    }


def _summary(status: str, n_changes: int, open_labels: list[str], dev: dict, dest: dict, mitigated: bool) -> str:
    short, where = dev["short"], dest["where"]
    if mitigated and n_changes:
        if status == "compatible":
            return f"With these changes, your {short} should work {where}."
        if status == "not_compatible":
            return f"Even with these changes, your {short} should not be used {where}."
        noun = "risk remains" if len(open_labels) == 1 else "risks remain"
        return f"With these changes, {len(open_labels)} {noun} to watch: {', '.join(open_labels)}."
    if status == "compatible":
        return f"Your {short} should work {where} as it is."
    if status == "not_compatible":
        return f"Your {short} should not be used {where} as it is."
    noun = "change" if n_changes == 1 else "changes"
    return f"Your {short} can work {where} after {n_changes} {noun}."


def assess(data: dict, destination_id: str, device_id: str, stay_days: int,
           body_mass_kg: float | None = None, with_mitigations: bool = False) -> dict:
    dests = {d["id"]: d for d in data["destinations"]["destinations"]}
    devs = {d["id"]: d for d in data["devices"]["devices"]}
    if destination_id not in dests:
        raise AssessError(f"Unknown destination '{destination_id}'.", not_found=True)
    if device_id not in devs:
        raise AssessError(f"Unknown device '{device_id}'.", not_found=True)
    if not isinstance(stay_days, int) or isinstance(stay_days, bool) or not 1 <= stay_days <= 1500:
        raise AssessError("Stay length must be between 1 and 1500 days.")
    dest, dev = dests[destination_id], devs[device_id]
    mass_spec = dev.get("body_mass_kg")
    body_mass = None
    if mass_spec:
        body_mass = mass_spec["default"] if body_mass_kg is None else body_mass_kg
        if not mass_spec["min"] <= body_mass <= mass_spec["max"]:
            raise AssessError(f"Body mass must be between {fmt(mass_spec['min'], 0)} and {fmt(mass_spec['max'], 0)} kg "
                              f"for the {dev['short']}.")
    ratio = dest["gravity_ms2"]["value"] / data["destinations"]["standard_gravity_ms2"]["value"]
    ctx = {"dest": dest, "dev": dev, "policy": data["devices"]["policy"], "ratio": ratio, "stay_days": stay_days}

    factors = [BUILDERS[name](ctx) for name in FACTOR_ORDER]
    factors.sort(key=lambda f: (-RANK[f["status"]], FACTOR_ORDER.index(f["factor"])))
    mitigations = [_mitigation(dev, f["factor"], ctx) for f in factors if f["status"] != "compatible"]
    resolved = {m["factor"] for m in mitigations if m["resolves"]}

    status = worst([f["status"] for f in factors])
    after = {f["factor"]: ("compatible" if f["factor"] in resolved else f["status"]) for f in factors}
    mitigated_status = worst(after.values())
    open_labels = [f["label"].lower() for f in factors if after[f["factor"]] != "compatible"]

    if with_mitigations:
        for f in factors:
            f["status_before"] = f["status"]
            f["status"] = after[f["factor"]]
            f["fixed"] = f["status_before"] != f["status"]

    shown = mitigated_status if with_mitigations else status
    return {
        "status": shown,
        "summary": _summary(shown, len(mitigations), open_labels, dev, dest, with_mitigations),
        "factors": factors,
        "mitigations": [{"text": m["text"], "resolves": m["resolves"], "reduces": m["reduces"]} for m in mitigations],
        "mitigated_status": mitigated_status,
        "recalibration": _recalibration(dev, ratio, body_mass) if body_mass is not None else None,
        "destination": {"id": dest["id"], "name": dest["name"]},
        "device": {"id": dev["id"], "name": dev["name"]},
        "stay_days": stay_days,
        "with_mitigations": with_mitigations,
    }
