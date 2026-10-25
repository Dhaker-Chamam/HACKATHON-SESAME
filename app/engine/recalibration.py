"""Gravity recalibration model for lower-limb prostheses.

Basis (see plan section 5.3):
- Over one steady gait cycle, mean vertical ground force equals supported weight.
- Stance joint moments are dominated by ground force times lever arm, and lever
  arms change only modestly in reduced gravity (Donelan & Kram 1997, S21).
- Swing moments are mostly inertial: not scaled.
- Pressurized suits partly or completely carry their own weight (Carr & McGee
  2009, S23): suit mass enters as a fraction f_s in [0, 1].
"""

from __future__ import annotations

import math

from ..models import Environment
from .policy import G0

# Walk-run transition Froude numbers: (value, level, source, note)
TRANSITION_FROUDE = {
    ("earth", False): (0.5, "E", "S22", "Humans switch to running near Fr = 0.5."),
    ("moon", False): (0.9, "E", "S23", "Interpolated unsuited value at 1/6 g."),
    ("moon", True): (0.36, "E", "S23", "Suited Apollo astronauts, 0.36 ± 0.11."),
    ("mars", False): (0.5, "A", "TEAM", "No Mars data; Earth value assumed."),
    ("mars", True): (0.36, "A", "S23", "No Mars data; suited Apollo value used as placeholder."),
}


def stance_scale(g_dest: float, m_body: float, m_carried: float = 0.0, f_s: float = 1.0) -> float:
    """Ratio of weight-driven stance load at destination to Earth. Never above 1."""
    if m_body <= 0:
        raise ValueError("body mass must be positive")
    return min(1.0, ((m_body + f_s * m_carried) / m_body) * (g_dest / G0))


def pendulum_period_ratio(g_dest: float) -> float:
    """How much slower a passive pendulum swings than on Earth."""
    return math.sqrt(G0 / g_dest)


def froude_equivalent_speed(v_earth: float, g_dest: float) -> float:
    return v_earth * math.sqrt(g_dest / G0)


def walk_run_speed(froude: float, g: float, leg_length: float) -> float:
    return math.sqrt(froude * g * leg_length)


def _num(inputs: dict, key: str, default: float) -> float:
    return float(inputs.get(key, default))


def recalibrate(env: Environment, device_id: str, inputs: dict) -> dict | None:
    """Return the recalibration block for a powered ankle or microprocessor knee.

    Returns None in microgravity, where walking settings do not apply.
    """
    g = float(env.p("gravity_ms2").value)
    if g <= 0:
        return None
    m_body = _num(inputs, "body_mass_kg", 80)
    suited = env.kind == "eva"
    if suited:
        m_carried = float(env.p("m_carried_kg").value)
        f_lo, f_hi = env.p("suit_self_support").lo, env.p("suit_self_support").hi
    else:
        m_carried, f_lo, f_hi = 0.0, 0.0, 0.0
    k_lo = stance_scale(g, m_body, m_carried, f_lo)
    k_hi = stance_scale(g, m_body, m_carried, f_hi)
    ratio = g / G0
    pend = pendulum_period_ratio(g)

    parameters: list[dict] = []
    if device_id == "powered_ankle":
        tau = _num(inputs, "push_off_nm", 120)
        parameters.append({
            "name": "Peak push-off assist", "unit": "N·m", "earth": tau,
            "start": k_lo * tau, "band": [k_lo * tau, k_hi * tau],
            "basis": "Start at the low end: too much push-off in low gravity risks launching the user off the ground.",
        })
    elif device_id == "mpk_knee":
        r = _num(inputs, "stance_resistance_pct", 100)
        parameters.append({
            "name": "Stance flexion resistance", "unit": "%", "earth": r,
            "start": k_hi * r, "band": [k_lo * r, k_hi * r],
            "basis": "Start at the high end: too little resistance risks the knee buckling.",
        })
        parameters.append({
            "name": "Load thresholds for swing release", "unit": "× Earth", "earth": 1.0,
            "start": None, "band": [k_lo, k_hi],
            "basis": "Band only. Recalibrate in place: set too high, swing never releases; too low, swing starts early.",
        })
    else:
        raise ValueError(f"no recalibration model for {device_id}")
    parameters.append({
        "name": "Swing-phase settings", "unit": "", "earth": None, "start": None, "band": None,
        "basis": f"Not scaled: swing is driven by leg inertia. A passive pendulum swings {pend:.2f}× slower, so swing extension damping tuned at 1 g will over-damp. Validate timing.",
    })

    v_earth = _num(inputs, "walking_speed_ms", 1.3)
    leg = _num(inputs, "leg_length_m", 0.9)
    fr, fr_level, fr_source, fr_note = TRANSITION_FROUDE[(env.body, suited)]
    walking = {
        "froude_equivalent_speed_ms": froude_equivalent_speed(v_earth, g),
        "walk_run_speed_ms": walk_run_speed(fr, g, leg),
        "walk_run_speed_earth_ms": walk_run_speed(0.5, G0, leg),
        "transition_froude": fr,
        "transition_froude_level": fr_level,
        "transition_froude_source": fr_source,
        "transition_froude_note": fr_note,
        "caveat": "Walking is not fully dynamically similar: relative stride length differed by up to 67% at equal Froude numbers (S21).",
    }

    block = {
        "device_id": device_id,
        "g_dest": g,
        "g_ratio": ratio,
        "suited": suited,
        "m_body_kg": m_body,
        "m_carried_kg": m_carried,
        "f_s": [f_lo, f_hi],
        "k_lo": k_lo,
        "k_hi": k_hi,
        "pendulum_ratio": pend,
        "equivalent_earth_load_kg": k_hi * m_body,
        "parameters": parameters,
        "walking": walking,
        "level": "A",
        "limits": [
            "Quasi-static model; peak forces may not scale exactly with gravity.",
            "Gait strategy changes in low gravity (loping, skipping) are not modeled.",
            "Suit joint torques add resistance and are not modeled.",
            "Not validated on any physical device.",
        ],
    }
    if device_id == "mpk_knee":
        block["body_mass_limit_kg"] = 136
        block["within_load_limit"] = k_hi * m_body <= 136
    return block
