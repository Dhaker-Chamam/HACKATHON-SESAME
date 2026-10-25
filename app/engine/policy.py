"""Thresholds used by the rules, each with its evidence level and source.

Values marked "A" are team policy choices. They are listed on the Methods page
so the jury and clinicians can see and challenge them.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

G0 = 9.80665  # m/s², standard gravity (S04)


@dataclass(frozen=True)
class Policy:
    key: str
    label: str
    value: float
    unit: str
    level: str
    source: str
    note: str


_POLICIES = [
    Policy("g0", "Standard gravity", G0, "m/s²", "F", "S04", "Reference for all gravity ratios."),
    Policy("presumed_p_min_kpa", "Presumed minimum pressure when no rating is published", 70.0, "kPa", "A", "S28",
           "IEC 60601-1 default operating range starts at 70 kPa (to verify); the 780G pump and the C-Leg charger publish the same limit."),
    Policy("presumed_p_max_kpa", "Presumed maximum pressure when no rating is published", 106.0, "kPa", "A", "S28", "Upper end of the same default range."),
    Policy("red_fraction", "Red below this fraction of the rated minimum", 0.5, "", "A", "TEAM",
           "Below half the tested minimum we treat the device as untested and high-risk."),
    Policy("implant_ref_kpa", "Lowest pressure implants routinely experience", 74.7, "kPa", "A", "S50",
           "Airliner cabins are pressurised to about 560 mmHg (74.7 kPa); people with implants fly routinely."),
    Policy("boyle_green", "Gas expansion treated as negligible", 1.05, "×", "A", "TEAM", "Weather-scale pressure change."),
    Policy("boyle_studied", "Largest gas expansion studied for insulin pumps", 1.36, "×", "E", "S13",
           "Airliner climb, about 760 to 560 mmHg. It caused unintended delivery of about 0.62% of cartridge volume."),
    Policy("oea_o2", "Oxygen-enriched atmosphere threshold", 0.235, "", "F", "S35", "More than 23.5% oxygen by volume."),
    Policy("pure_o2", "Pure-oxygen threshold", 0.95, "", "A", "TEAM", "Suit atmosphere is 100% oxygen."),
    Policy("temp_margin_c", "Minimum temperature margin", 5.0, "°C", "A", "TEAM", "Margin to device limits before we flag amber."),
    Policy("tid_low_gy", "Upper end of low dose band", 2.0, "Gy", "VERIFY", "S11",
           "Cardiac-device radiotherapy guidance, used as an analogy only."),
    Policy("tid_high_gy", "Lower end of high dose band", 5.0, "Gy", "VERIFY", "S11", "Same guidance, used as an analogy only."),
    Policy("comm_local_ok_s", "Delay that still allows a live remote session", 2.0, "s", "A", "TEAM", "About the Earth-Moon light time."),
    Policy("comm_critical_s", "Delay beyond which life-critical alerts are delayed", 60.0, "s", "A", "TEAM", "One minute one way."),
    Policy("battery_reserve", "Battery reserve required over an EVA", 1.25, "×", "A", "TEAM", "25% reserve above planned EVA duration."),
    Policy("bone_days", "Stay length that triggers bone review", 30.0, "days", "A", "TEAM", "Short stays cause little bone loss."),
]

POLICY: dict[str, Policy] = {p.key: p for p in _POLICIES}


def policy_list() -> list[dict]:
    return [asdict(p) for p in _POLICIES]
