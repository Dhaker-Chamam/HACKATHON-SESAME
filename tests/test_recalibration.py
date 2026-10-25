"""Golden values from plan section 5.3 (worked example)."""

import math

import pytest

from app.data_loader import get_data
from app.engine.policy import G0
from app.engine.recalibration import pendulum_period_ratio, recalibrate, stance_scale, walk_run_speed

DATA = get_data()
INPUTS = {"body_mass_kg": 80, "push_off_nm": 120}


def _push_off(env_id):
    block = recalibrate(DATA.environments[env_id], "powered_ankle", INPUTS)
    lo, hi = block["parameters"][0]["band"]
    return block["parameters"][0]["start"], lo, hi


def test_stance_scale_earth_is_one():
    assert stance_scale(G0, 80) == pytest.approx(1.0)


def test_stance_scale_never_exceeds_earth():
    assert stance_scale(G0, 80, m_carried=96, f_s=1.0) == 1.0


@pytest.mark.parametrize("env_id, start, lo, hi", [
    ("moon_habitat", 19.82, 19.82, 19.82),
    ("moon_eva", 19.82, 19.82, 43.61),
    ("mars_habitat", 45.64, 45.64, 45.64),
    ("mars_eva", 45.64, 45.64, 100.41),
])
def test_push_off_worked_example(env_id, start, lo, hi):
    got = _push_off(env_id)
    assert got == pytest.approx((start, lo, hi), abs=0.01)


def test_mpk_starts_at_high_end_of_band():
    block = recalibrate(DATA.environments["moon_eva"], "mpk_knee", {"body_mass_kg": 80, "stance_resistance_pct": 100})
    stance = block["parameters"][0]
    assert stance["start"] == pytest.approx(stance["band"][1])
    assert stance["start"] == pytest.approx(36.34, abs=0.01)


def test_microgravity_returns_none():
    assert recalibrate(DATA.environments["leo_station"], "powered_ankle", INPUTS) is None


def test_pendulum_and_walk_run():
    assert pendulum_period_ratio(1.62) == pytest.approx(2.46, abs=0.01)
    assert pendulum_period_ratio(3.73) == pytest.approx(1.62, abs=0.01)
    assert walk_run_speed(0.5, G0, 0.9) == pytest.approx(2.10, abs=0.01)
    assert walk_run_speed(0.36, 1.62, 0.9) == pytest.approx(0.72, abs=0.01)


def test_invalid_mass():
    with pytest.raises(ValueError):
        stance_scale(1.62, 0)
    assert not math.isnan(stance_scale(1.62, 1))
