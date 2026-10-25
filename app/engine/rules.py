"""Compatibility rules R1 to R9.

Each rule is a pure function of (environment, device, user inputs, duration).
It returns a Finding, or None when the rule does not apply to the device.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from ..models import Device, Environment, Finding, Param, Value, weakest
from .policy import G0, POLICY
from .recalibration import recalibrate


@dataclass
class Ctx:
    env: Environment
    device: Device
    inputs: dict
    duration_days: int
    extras: dict = field(default_factory=dict)  # e.g. recalibration block from R6


@dataclass(frozen=True)
class Rule:
    id: str
    name: str
    checks: str
    decision: str
    sources: tuple[str, ...]
    fn: Callable[[Ctx], Finding | None]


# ---------- helpers ----------

def _g(x: float, digits: int = 3) -> str:
    return f"{x:.{digits}g}"


def pv(label: str, param: Param, display: str | None = None) -> Value:
    if display is None:
        if param.min is not None and param.max is not None and param.min != param.max:
            display = f"{param.min:g} to {param.max:g} {param.unit}".strip()
        else:
            v = param.value if param.value is not None else param.min
            display = f"{v:g} {param.unit}".strip() if isinstance(v, (int, float)) and not isinstance(v, bool) else str(v)
    return Value(label=label, display=display, level=param.level, source=param.source, note=param.note)


def polv(key: str, display: str | None = None) -> Value:
    p = POLICY[key]
    return Value(label=p.label, display=display or f"{p.value:g} {p.unit}".strip(), level=p.level, source=p.source, note=p.note)


def derived(label: str, display: str, level: str, note: str) -> Value:
    return Value(label=label, display=display, level=level, source="DERIVED", note=note)


def user(label: str, display: str) -> Value:
    return Value(label=label, display=display, level="INPUT", source="INPUT")


def _finding(rule: str, status: str, title: str, explanation: str, mitigation: str,
             values: list[Value], sources: list[str]) -> Finding:
    return Finding(rule_id=rule, rule_name=RULE_NAMES[rule], status=status, title=title,
                   explanation=explanation, mitigation=mitigation, values=values,
                   sources=list(dict.fromkeys(sources)))


def _powered(d: Device) -> bool:
    return d.val("battery_chem") not in (None, "none")


def _life_critical(c: Ctx) -> bool:
    crit = c.device.val("life_critical")
    pacing = bool(c.inputs.get("pacing_dependent", False))
    return crit in ("yes", "yes_with_backup") or (crit == "conditional" and pacing)


def _delay_text(seconds: float) -> str:
    return f"{seconds:.1f} s" if seconds < 90 else f"{seconds / 60:.1f} min"


CHEM_LABEL = {"li_ion": "lithium-ion", "li_primary": "lithium", "zinc_air": "zinc-air",
              "alkaline": "alkaline", "unknown": "unverified"}

RULE_NAMES = {
    "R1": "Pressure envelope",
    "R2": "Gas expansion in fluid path",
    "R3": "Oxygen-enriched air and battery",
    "R4": "Temperature envelope",
    "R5": "Radiation",
    "R6": "Gravity-dependent function",
    "R7": "Follow-up and communications",
    "R8": "Dust and exposed mechanics",
    "R9": "Power and charging",
}


# ---------- R1 ----------

def r1_pressure(c: Ctx) -> Finding | None:
    d, e = c.device, c.env
    if not (_powered(d) or d.flag("fluid_path")):
        return None
    P = e.p("p_kpa")
    vals = [pv("Pressure at the device", P)]
    if d.val("location") == "implanted":
        ref = POLICY["implant_ref_kpa"]
        vals.append(polv("implant_ref_kpa"))
        if P.value >= ref.value:
            return _finding("R1", "green", f"{P.value:g} kPa is within routine implant experience",
                            f"Implants sit at tissue pressure, which follows cabin pressure. {P.value:g} kPa is at or above an airliner cabin (about {ref.value:g} kPa), which implant carriers experience routinely.",
                            "None needed for pressure.", vals, [P.source, ref.source])
        pct = (1 - P.value / ref.value) * 100
        return _finding("R1", "amber", f"{P.value:g} kPa is below routine implant experience",
                        f"Implants sit at tissue pressure, which follows cabin pressure. {P.value:g} kPa is {pct:.0f}% below an airliner cabin, the lowest pressure implant carriers routinely experience. The housing is hermetic, but we found no published test data at this pressure.",
                        "Ask the manufacturer for low-pressure test data (ISO 14708 test envelope). Interrogate the device after the first pressure change.",
                        vals, [P.source, ref.source, "S29"])

    rating = d.p("p_rating_kpa")
    if rating is not None:
        p_min, p_max = rating.lo, rating.hi
        vals.append(pv("Rated operating pressure", rating))
        basis = f"rated {p_min:g} to {p_max:g} kPa"
        srcs = [P.source, rating.source]
    else:
        p_min, p_max = POLICY["presumed_p_min_kpa"].value, POLICY["presumed_p_max_kpa"].value
        vals.append(polv("presumed_p_min_kpa"))
        basis = f"not rated for pressure by the manufacturer; we presume the common {p_min:g} to {p_max:g} kPa range"
        srcs = [P.source, "S28", "S24", "S26"]
    red_floor = POLICY["red_fraction"].value * p_min
    vals.append(derived("Red threshold", f"{red_floor:g} kPa", "A", "Half the rated minimum."))

    if p_min <= P.value <= p_max:
        return _finding("R1", "green", f"{P.value:g} kPa is inside the rated range",
                        f"The device is {basis}. {e.short} exposes it to {P.value:g} kPa.",
                        "None needed for pressure.", vals, srcs)
    if P.value > p_max:
        return _finding("R1", "amber", f"{P.value:g} kPa is above the rated range",
                        f"The device is {basis}. {e.short} exposes it to {P.value:g} kPa.",
                        "Request the manufacturer's high-pressure test data.", vals, srcs)
    pct = (1 - P.value / p_min) * 100
    if P.value >= red_floor:
        return _finding("R1", "amber", f"{P.value:g} kPa is {pct:.0f}% below the rated minimum",
                        f"The device is {basis}. {e.short} exposes it to {P.value:g} kPa, outside the tested range. Outside the range means untested, not proven unsafe.",
                        f"Request the manufacturer's low-pressure test data, or run a hypobaric chamber test at {P.value:g} kPa before flight.",
                        vals, srcs)
    return _finding("R1", "red", f"{P.value:g} kPa is less than half the rated minimum",
                    f"The device is {basis}. {e.short} exposes it to {P.value:g} kPa, {pct:.0f}% below the rated minimum and below half of it.",
                    f"Do not use at this pressure without test evidence. Run a hypobaric chamber test at {P.value:g} kPa with the manufacturer, or use an alternative for this environment.",
                    vals, srcs)


# ---------- R2 ----------

def r2_gas(c: Ctx) -> Finding | None:
    d, e = c.device, c.env
    if not d.flag("fluid_path"):
        return None
    studied = POLICY["boyle_studied"]
    green_max = POLICY["boyle_green"].value
    rank = {"green": 0, "amber": 1, "red": 2}
    worst: tuple | None = None
    vals = [pv("Fluid path", d.p("fluid_path"), "reservoir and tubing")]
    for t in e.transitions:
        b = t.from_kpa / t.to_kpa
        if b <= green_max:
            s = "green"
        elif b <= studied.value or not t.connected_required:
            s = "amber"
        else:
            s = "red"
        vals.append(derived(f"Expansion: {t.label}", f"{b:.2f}× ({t.from_kpa:g} to {t.to_kpa:g} kPa)",
                            weakest(t.level, "F"), "Boyle's law: gas volume scales with 1/pressure."))
        if worst is None or rank[s] > rank[worst[0]] or (rank[s] == rank[worst[0]] and b > worst[1]):
            worst = (s, b, t)
    vals.append(polv("boyle_studied"))
    s, b, t = worst
    base = (f"Gas dissolved in insulin and bubbles in the reservoir expand {b:.2f}× on '{t.label}'. "
            f"An airliner climb (about {studied.value:g}×) already causes unintended delivery of about 0.62% of cartridge volume.")
    if s == "green":
        return _finding("R2", "green", "No significant pressure change", base, "None needed.", vals, ["S13"])
    if s == "amber":
        extra = " This is a one-time change; the pump can be disconnected while it happens." if not t.connected_required else ""
        return _finding("R2", "amber", f"Gas expands {b:.2f}× during {t.label.lower()}", base + extra,
                        "Disconnect during the pressure change. Check for bubbles and re-prime afterwards. Refill the cartridge at the new pressure.",
                        vals, ["S13"])
    return _finding("R2", "red", f"Gas expands {b:.2f}× while the pump stays connected",
                    base + " Here the pump stays worn and connected through the change, beyond the studied range.",
                    d.mitigations.get("R2_red", "Do not stay connected through this pressure change. A clinician must design an alternative plan."),
                    vals, ["S13"])


# ---------- R3 ----------

def r3_oxygen(c: Ctx) -> Finding | None:
    d, e = c.device, c.env
    chem = d.val("battery_chem")
    if chem in (None, "none") or d.val("location") == "implanted":
        return None
    o2 = e.p("o2_fraction")
    oea = POLICY["oea_o2"]
    in_suit = e.kind == "eva" and d.flag("inside_suit_on_eva")
    vals = [pv("Oxygen fraction", o2, f"{o2.value * 100:g}%"), polv("oea_o2", "23.5%"),
            pv("Battery", d.p("battery_chem"), CHEM_LABEL.get(chem, chem))]
    label = CHEM_LABEL.get(chem, chem)
    if o2.value <= oea.value:
        return _finding("R3", "green", "Normal oxygen level",
                        f"{e.short} air is {o2.value * 100:g}% oxygen, not oxygen-enriched.",
                        "None needed.", vals, [o2.source, "S35"])
    if in_suit and o2.value >= POLICY["pure_o2"].value:
        return _finding("R3", "red", f"{label.capitalize()} battery in pure oxygen",
                        f"Inside the suit the device sits in {o2.value * 100:g}% oxygen at {e.p('p_kpa').value:g} kPa. A battery-powered device is an ignition source in pure oxygen. No flight certification is known for this device.",
                        d.mitigations.get("R3_red", "Do not wear inside the suit unless the device passes flight certification."),
                        vals, [o2.source, "S35", "S36", "S37"])
    return _finding("R3", "amber", f"Oxygen-enriched air ({o2.value * 100:g}%)",
                    f"{e.short} air is {o2.value * 100:g}% oxygen, above the 23.5% oxygen-enriched threshold. Materials burn more easily, and a {label} battery needs a crewed-vehicle battery safety assessment.",
                    "Battery safety assessment under NASA JSC 20793 and a materials check under NASA-STD-6001. Charge only in designated, monitored areas.",
                    vals, [o2.source, "S35", "S36", "S37"])


# ---------- R4 ----------

def r4_temperature(c: Ctx) -> Finding | None:
    d, e = c.device, c.env
    op = d.p("op_temp_c")
    if op is None:
        return None
    t = e.p("temp_c")
    margin = POLICY["temp_margin_c"].value
    checks = [("Operation", op)]
    if d.p("charge_temp_c") is not None and e.kind != "eva":
        checks.append(("Charging", d.p("charge_temp_c")))
    rank = {"green": 0, "amber": 1, "red": 2}
    status, parts = "green", []
    vals = [pv("Temperature at the device", t)]
    for label, r in checks:
        m = min(t.lo - r.lo, r.hi - t.hi)
        s = "red" if m < 0 else "amber" if m < margin else "green"
        status = s if rank[s] > rank[status] else status
        parts.append(f"{label} range {r.lo:g} to {r.hi:g} °C, margin {m:g} °C")
        vals.append(pv(f"{label} range", r))
    vals.append(polv("temp_margin_c"))
    unverified = t.level in ("A", "VERIFY")
    if unverified and status == "green":
        status = "amber"
    titles = {"green": "Inside rated temperatures with margin",
              "amber": "Unverified microclimate" if unverified else "Narrow temperature margin",
              "red": "Environment exceeds rated temperature"}
    explanation = f"{e.short} microclimate {t.lo:g} to {t.hi:g} °C. " + "; ".join(parts) + "."
    if unverified:
        explanation += " The microclimate itself is an assumption, not a published value."
    mitigation = {"green": "None needed.",
                  "amber": "Confirm the real temperature at the device location before flight.",
                  "red": "Keep the device inside its rated range, or use an alternative."}[status]
    return _finding("R4", status, titles[status], explanation, mitigation, vals, [t.source] + [r.source for _, r in checks])


# ---------- R5 ----------

def r5_radiation(c: Ctx) -> Finding | None:
    d, e = c.device, c.env
    if not d.flag("memory_electronics"):
        return None
    rate = e.p("h_rate_msv_day")
    stay = c.duration_days * rate.hi
    transit = sum(leg.days.value * leg.h_rate_msv_day.value for leg in e.transit_legs)
    h_total = stay + transit
    d_max = h_total / 1000.0
    low, high = POLICY["tid_low_gy"].value, POLICY["tid_high_gy"].value
    band = "low" if d_max < low else "medium" if d_max <= high else "high"
    tid_status = {"low": "green", "medium": "amber", "high": "red"}[band]
    critical = _life_critical(c)
    status = "red" if tid_status == "red" else "amber" if (critical or tid_status == "amber") else "green"

    levels = [rate.level] + [leg.days.level for leg in e.transit_legs] + [leg.h_rate_msv_day.level for leg in e.transit_legs]
    vals = [pv("Dose-equivalent rate at destination", rate), user("Stay", f"{c.duration_days} days")]
    for leg in e.transit_legs:
        vals.append(pv(f"{leg.label}: duration", leg.days))
        vals.append(pv(f"{leg.label}: rate", leg.h_rate_msv_day))
    vals.append(derived("Mission dose equivalent", f"{h_total:.0f} mSv", weakest(*levels), "Sum of rate × days over stay and transit."))
    vals.append(derived("Absorbed dose upper bound", f"≤ {d_max:.2f} Gy", weakest(*levels),
                        "Dose equivalent = absorbed dose × quality factor, and the factor is at least 1, so Gy ≤ Sv."))
    vals.append(polv("tid_low_gy"))

    transit_txt = f", plus {transit:.0f} mSv in transit" if transit else ""
    explanation = (f"Mission dose equivalent about {h_total:.0f} mSv ({c.duration_days} days at up to {rate.hi:g} mSv/day{transit_txt}). "
                   f"Absorbed dose is at most {d_max:.2f} Gy: the {band} band of cardiac-device radiotherapy guidance, used here as an analogy. "
                   "Total dose is not the main concern. Neutrons and heavy ions can flip memory bits (single-event upsets); their rate for this device in space is unknown.")
    if critical:
        title = "Memory upsets possible in a life-critical device"
        mitigation = "Interrogate the device before launch, after any solar particle event, and on a fixed schedule. Know its reset (backup) mode. Keep an onboard way to reprogram it."
        if d.val("life_critical") == "yes_with_backup":
            mitigation = "Check settings and delivery history on a fixed schedule and after any solar particle event. Carry a spare pump and the backup route (insulin pens)."
    else:
        title = f"Total dose low (≤ {d_max:.2f} Gy)" if band == "low" else f"Total dose in the {band} band"
        mitigation = "A memory upset would be an inconvenience here, not a danger. Check settings after solar particle events and carry the settings file to restore them."
    return _finding("R5", status, title, explanation, mitigation, vals,
                    [rate.source] + [leg.h_rate_msv_day.source for leg in e.transit_legs] + ["S11", "S12"])


# ---------- R6 ----------

def r6_gravity(c: Ctx) -> Finding | None:
    d, e = c.device, c.env
    gf = d.val("gravity_function")
    if gf in (None, "none"):
        return None
    g = e.p("gravity_ms2")
    ratio = g.value / G0
    vals = [pv("Gravity", g), derived("Ratio to Earth", f"{ratio:.3f}", g.level, f"{g.value:g} / {G0} m/s²")]

    if gf in ("prosthesis_powered", "prosthesis_passive_mpk"):
        if g.value <= 0:
            return _finding("R6", "amber", "No walking load in microgravity",
                            "In microgravity the prosthesis carries no body weight, so walking settings do not apply. Residual-limb volume changes with fluid shifts and can affect socket fit; ESA's Fly! study examined this for an amputee astronaut.",
                            "Plan socket and liner adjustments for limb-volume change. Switch powered modes off when not walking. Recalibrate on return to gravity.",
                            vals, [g.source, "S39"])
        block = recalibrate(e, d.id, c.inputs)
        c.extras["recalibration"] = block
        k_lo, k_hi = block["k_lo"], block["k_hi"]
        k_txt = f"{k_lo:.3f}×" if abs(k_hi - k_lo) < 1e-9 else f"{k_lo:.3f}× to {k_hi:.3f}×"
        suit_txt = (f" Inside the suit, {block['m_carried_kg']:g} kg of suit is carried partly or fully by the suit itself, so the result is a band."
                    if block["suited"] else "")
        vals.append(user("Body mass", f"{block['m_body_kg']:g} kg"))
        if block["suited"]:
            vals.append(pv("Suit mass", e.p("m_carried_kg")))
            vals.append(pv("Suit weight carried by the legs", e.p("suit_self_support"), "0 to 100%"))
        vals.append(derived("Stance load ratio", k_txt, "A", "((m_body + f_s·m_suit) / m_body) × g / g0. Model output."))
        first = block["parameters"][0]
        if d.id == "powered_ankle":
            vals.insert(2, user("Earth push-off setting", f"{first['earth']:g} N·m"))
            lo, hi = first["band"]
            band_txt = f" (upper bound {hi:.1f} N·m)" if hi - lo > 1e-9 else ""
            detail = (f"Peak push-off assist of {first['earth']:g} N·m becomes a starting value of {first['start']:.1f} N·m{band_txt}. "
                      "Swing settings are not scaled because swing is driven by leg inertia.")
            srcs = [g.source, "S21", "S23", "S25", "S44"]
        else:
            vals.insert(2, user("Earth stance resistance", f"{first['earth']:g}%"))
            detail = (f"Stance flexion resistance starts at {first['start']:.0f}% of the Earth setting (high end, to protect against buckling). "
                      "Load thresholds for switching to swing must be recalibrated in place; the IFU warns that wrong calibration makes swing start too early or too late.")
            srcs = [g.source, "S21", "S23", "S24", "S44"]
        return _finding("R6", "amber", f"Recalibrate: stance load is {k_txt} Earth",
                        f"The prosthesis was tuned at 1 g. At {g.value:g} m/s² the weight-driven stance load is {k_txt} Earth.{suit_txt} " + detail,
                        "Use these values only as starting points with a prosthetist. Validate under supervision in a reduced-gravity analog: parabolic flights fly 0.16 g for about 23 s and 0.38 g for about 30 s.",
                        vals, srcs)

    if gf == "rate_response":
        walking = "Walking in microgravity produces almost no body acceleration" if g.value <= 0 else f"Walking at {g.value:g} m/s² produces different body accelerations than on Earth"
        return _finding("R6", "amber", "Check rate response in reduced gravity",
                        f"The pacemaker raises the heart rate from accelerometer signals of body motion. {walking}, so the rate response may under-react during exertion such as EVA. This is our inference from how the sensor works; no flight data was found.",
                        "Ask the cardiologist to test and, if needed, reprogram rate-response settings or a second sensor before flight. Check the response during exercise in the habitat.",
                        vals, [g.source, "S51"])

    if gf == "bubble_mgmt":
        if g.value <= 0:
            return _finding("R6", "amber", "Bubbles do not rise in microgravity",
                            "Removing air from the reservoir and tubing relies on bubbles rising. In microgravity they stay where they are, so priming steps learned on Earth may not work.",
                            "Train a microgravity priming and bubble-check procedure before flight. Fill without trapped air.",
                            vals, [g.source])
        return _finding("R6", "green", f"Bubbles still rise ({ratio:.2f}× Earth buoyancy)",
                        "Buoyancy scales with gravity. Bubbles still rise, only more slowly.",
                        "Allow extra time when priming.", vals, [g.source])

    if gf == "bone_load":
        days = c.duration_days
        limit = POLICY["bone_days"]
        vals += [user("Stay", f"{days} days"), polv("bone_days")]
        if ratio < 1 and days > limit.value:
            return _finding("R6", "amber", "Bone around the implant may weaken",
                            f"Bone around a load-bearing implant depends on loading. Long-duration microgravity caused measurable bone loss on Mir missions of 4 to 14.4 months. {days} days at {ratio:.2f} g exceeds our {limit.value:g}-day review threshold. The effect of partial gravity is not well known.",
                            "Bone density scan before and after. Resistance exercise countermeasures. Orthopedic review of implant fixation before flight.",
                            vals, [g.source, "S30", "S38"])
        return _finding("R6", "green", "Short stay: bone loss not significant",
                        f"{days} days is within our {limit.value:g}-day review threshold for bone loss around the implant.",
                        "Bone density scan before and after the mission.", vals, [g.source, "S30"])
    return None


# ---------- R7 ----------

def r7_followup(c: Ctx) -> Finding | None:
    d, e = c.device, c.env
    fu = d.val("followup")
    if fu in (None, "none"):
        return None
    delay = e.p("delay_s")
    blackout_p = e.p("blackout")
    blackout = bool(blackout_p.value) if blackout_p else False
    dmax = delay.hi
    vals = [pv("Follow-up model", d.p("followup"), fu.replace("_", " ")), pv("One-way delay", delay,
            f"{_delay_text(delay.lo)} to {_delay_text(dmax)}")]
    if blackout_p:
        vals.append(pv("Conjunction blackout", blackout_p, "yes, about 2 weeks" if blackout else "no"))
    srcs = [delay.source] + ([blackout_p.source] if blackout_p else [])
    blackout_txt = ", with blackouts of about two weeks at solar conjunction" if blackout else ""

    if fu == "optional_cloud":
        return _finding("R7", "green", "Works without a link",
                        "Therapy runs locally; uploading data is optional.",
                        "Sync data when the link allows.", vals, srcs)
    if fu == "local_programming":
        if dmax <= POLICY["comm_local_ok_s"].value:
            return _finding("R7", "green", "Remote specialist session is practical",
                            f"Changing settings needs a specialist with programming software. With up to {_delay_text(dmax)} of delay, a live remote session with Earth is practical.",
                            "Schedule remote sessions with the specialist before and during the stay.", vals, srcs)
        return _finding("R7", "amber", "No live specialist session possible",
                        f"Changing settings needs a specialist with programming software. At up to {_delay_text(dmax)} one-way delay{blackout_txt}, a live remote session is impractical.",
                        "Train a crew member and carry the programming software. Agree setting presets with the specialist before departure.",
                        vals, srcs + ["S24"])
    # remote_monitoring
    critical = _life_critical(c)
    late = dmax > POLICY["comm_critical_s"].value or blackout
    text = (f"Remote monitoring sends device data through a home transmitter over Earth networks. Off Earth it needs integration with the vehicle network. "
            f"One-way delay is up to {_delay_text(dmax)}{blackout_txt}.")
    if critical and late:
        text += " This device is life-critical: an alert would reach clinicians only after that delay."
    return _finding("R7", "amber", "Remote monitoring needs an off-Earth path" + (" (alerts delayed)" if critical and late else ""),
                    text,
                    "Onboard programmer and a trained crew medical officer. Store-and-forward data plan. Vendor support schedule agreed before flight.",
                    vals, srcs + ["S52"])


# ---------- R8 ----------

def r8_dust(c: Ctx) -> Finding | None:
    d, e = c.device, c.env
    if not (d.flag("exposed_mechanics") or d.flag("dust_prohibited") or d.flag("dust_sensitive")):
        return None
    dust = e.p("dust_class")
    vals = [pv("Dust exposure", dust, dust.value.replace("_", " "))]
    for key in ("dust_prohibited", "exposed_mechanics", "dust_sensitive"):
        if d.flag(key):
            vals.append(pv({"dust_prohibited": "IFU dust warning", "exposed_mechanics": "Exposed mechanics",
                            "dust_sensitive": "Open ports"}[key], d.p(key), "yes"))
    if dust.value == "none":
        return _finding("R8", "green", "No dust exposure", "No dust exposure expected.", "None needed.", vals, [dust.source])
    what = ("The manufacturer's instructions say the device must not contact sand or dust. " if d.flag("dust_prohibited")
            else "Microphone ports can be blocked by fine dust. " if d.flag("dust_sensitive")
            else "The device has moving parts and seals. ")
    if dust.value == "high":
        where = "On EVA the device is inside the suit, but Apollo dust damaged suit seals and mechanisms."
    else:
        where = "Apollo crews carried dust into the cabin, where it clogged mechanisms, abraded surfaces and damaged seals; ground tests underestimated the problem."
    if e.body == "mars":
        where += " Martian soil also contains perchlorate."
    mitigation = ("Microphone covers. Clean and inspect the processor regularly. Carry a spare processor." if d.flag("dust_sensitive")
                  else "Sealed cover over the joint. Cleaning protocol. Inspect after every EVA and weekly in the habitat. Carry a spare unit.")
    title = "IFU prohibits dust contact" if d.flag("dust_prohibited") else "Dust can reach the device"
    return _finding("R8", "amber", title, what + where, mitigation, vals,
                    [dust.source, "S14"] + (["S15"] if e.body == "mars" else []) + ([d.p("dust_prohibited").source] if d.flag("dust_prohibited") else []))


# ---------- R9 ----------

def r9_power(c: Ctx) -> Finding | None:
    d, e = c.device, c.env
    if not (d.flag("rechargeable") and d.val("battery_chem") == "li_ion"):
        return None
    if e.kind == "eva":
        runtime = d.p("runtime_h")
        eva = e.p("eva_h")
        need = POLICY["battery_reserve"].value * eva.value
        vals = [pv("EVA duration", eva), polv("battery_reserve")]
        if runtime is None:
            return _finding("R9", "amber", "Battery runtime unknown", "No published runtime for this device.",
                            "Measure runtime under realistic load before planning EVAs.", vals, [eva.source])
        vals.insert(0, pv("Battery runtime", runtime))
        if runtime.value < need:
            return _finding("R9", "amber", f"Battery reserve below 25% for a {eva.value:g} h EVA",
                            f"Battery lasts up to {runtime.value:g} h. A {eva.value:g} h EVA with 25% reserve needs {need:g} h.",
                            "Shorten the EVA to the battery, or certify a spare battery that can be swapped safely.",
                            vals, [runtime.source, eva.source])
        return _finding("R9", "green", "Battery covers the EVA with reserve",
                        f"Battery lasts at least {runtime.value:g} h; a {eva.value:g} h EVA with 25% reserve needs {need:g} h.",
                        "None needed.", vals, [runtime.source, eva.source])
    P = e.p("p_kpa")
    charger = d.p("charger_p_rating_kpa")
    if charger is not None:
        c_lo, c_hi, srcs = charger.lo, charger.hi, [charger.source]
        vals = [pv("Charger rated pressure", charger)]
        presumed = ""
    else:
        c_lo, c_hi, srcs = POLICY["presumed_p_min_kpa"].value, POLICY["presumed_p_max_kpa"].value, ["S28"]
        vals = [polv("presumed_p_min_kpa")]
        presumed = " (no published rating; common range presumed)"
    vals.insert(0, pv("Cabin pressure", P))
    if P.value < c_lo:
        return _finding("R9", "amber", f"Charger rated only down to {c_lo:g} kPa",
                        f"The charger's power supply is rated {c_lo:g} to {c_hi:g} kPa{presumed}. The cabin is {P.value:g} kPa. Lower air pressure reduces cooling and lowers the voltage at which air breaks down.",
                        f"Use a flight-certified charger, or test this charger at {P.value:g} kPa. Plan the habitat power interface (voltage, plug).",
                        vals, [P.source] + srcs)
    return _finding("R9", "green", "Charger within its rated pressure",
                    f"The charger is rated {c_lo:g} to {c_hi:g} kPa{presumed}; the cabin is {P.value:g} kPa.",
                    "Use a flight-certified charger interface.", vals, [P.source] + srcs)


RULES: list[Rule] = [
    Rule("R1", RULE_NAMES["R1"], "Pressure at the device vs. its rated operating range.",
         "Green inside the rating. Amber below the minimum but at least half of it. Red below half. No rating: 70 to 106 kPa presumed. Implants: amber below airliner cabin pressure, never red.",
         ("S24", "S26", "S28", "S29", "S50"), r1_pressure),
    Rule("R2", RULE_NAMES["R2"], "Gas expansion (Boyle's law) in reservoirs and tubing during pressure changes.",
         "Green ≤ 1.05×. Amber up to the studied 1.36×, or beyond it if the pump can be disconnected. Red beyond 1.36× while connected.",
         ("S13",), r2_gas),
    Rule("R3", RULE_NAMES["R3"], "Battery-powered devices in oxygen-enriched air.",
         "Green ≤ 23.5% O2. Amber above it. Red in pure oxygen inside the suit.",
         ("S35", "S36", "S37"), r3_oxygen),
    Rule("R4", RULE_NAMES["R4"], "Device microclimate vs. operating and charging ranges.",
         "Green with ≥ 5 °C margin. Amber under 5 °C margin or if the microclimate is an assumption. Red outside the range.",
         ("S16", "S24", "S25", "S26", "S27"), r4_temperature),
    Rule("R5", RULE_NAMES["R5"], "Total dose bound and memory upsets from neutrons and heavy ions.",
         "Absorbed dose ≤ dose equivalent. Bands below 2 Gy, 2 to 5 Gy, above 5 Gy. Amber upset flag for life-critical devices.",
         ("S05", "S06", "S07", "S09", "S11", "S12"), r5_radiation),
    Rule("R6", RULE_NAMES["R6"], "Functions that depend on gravity: prosthesis control, rate response, bubble removal, bone loading.",
         "Prostheses: amber with recalibration values. Rate response: amber. Bubbles: amber in microgravity. Bone: amber beyond 30 days.",
         ("S21", "S23", "S24", "S25", "S30", "S39", "S51"), r6_gravity),
    Rule("R7", RULE_NAMES["R7"], "Dependence on clinicians or remote monitoring vs. light delay and blackouts.",
         "Green for local therapy, or specialist sessions with ≤ 2 s delay. Amber otherwise; stronger wording for life-critical devices.",
         ("S01", "S02", "S20", "S52"), r7_followup),
    Rule("R8", RULE_NAMES["R8"], "Dust exposure for devices with moving parts, seals or open ports.",
         "Green with no dust. Amber with habitat or EVA dust.",
         ("S14", "S15", "S25"), r8_dust),
    Rule("R9", RULE_NAMES["R9"], "Battery runtime over an EVA, and charger pressure rating in the cabin.",
         "Amber if runtime < 1.25 × EVA duration, or if the cabin is below the charger rating.",
         ("S24", "S25", "S28"), r9_power),
]
