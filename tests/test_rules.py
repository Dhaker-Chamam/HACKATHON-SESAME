"""Expected demo outcomes (plan section 5.5) and rule edge cases."""

import pytest

from app.data_loader import get_data
from app.engine import assess
from app.models import AssessRequest, DeviceSelection

DATA = get_data()


def _report(env_id, days, *device_ids, **inputs):
    devices = [DeviceSelection(device_id=d, inputs=inputs.get(d, {})) for d in device_ids]
    return assess(DATA, AssessRequest(env_id=env_id, duration_days=days, devices=devices))


def _rules(device_report):
    return {f.rule_id: f.status for f in device_report.findings}


def test_powered_ankle_lunar_habitat_is_amber():
    dev = _report("moon_habitat", 30, "powered_ankle").devices[0]
    assert dev.status == "amber"
    assert _rules(dev) == {"R1": "amber", "R3": "amber", "R4": "green", "R5": "green", "R6": "amber",
                           "R7": "green", "R8": "amber", "R9": "amber"}


def test_powered_ankle_lunar_eva_is_red_led_by_oxygen():
    dev = _report("moon_eva", 30, "powered_ankle").devices[0]
    assert dev.status == "red"
    assert dev.findings[0].rule_id == "R3"
    assert _rules(dev)["R9"] == "amber"  # 8 h battery < 1.25 x 7 h EVA


def test_insulin_pump_lunar_eva_three_independent_reds():
    rules = _rules(_report("moon_eva", 30, "insulin_pump").devices[0])
    assert rules["R1"] == rules["R2"] == rules["R3"] == "red"


def test_insulin_pump_habitat_transition_is_amber_not_red():
    rules = _rules(_report("moon_habitat", 30, "insulin_pump").devices[0])
    assert rules["R2"] == "amber"


def test_mars_dose_bound_is_low_band():
    dev = _report("mars_habitat", 500, "pacemaker").devices[0]
    r5 = next(f for f in dev.findings if f.rule_id == "R5")
    assert "983 mSv" in r5.explanation
    assert "at most 0.98 Gy" in r5.explanation


def test_pacing_dependence_drives_upset_flag():
    dependent = _report("moon_habitat", 30, "pacemaker", pacemaker={"pacing_dependent": True}).devices[0]
    independent = _report("moon_habitat", 30, "pacemaker", pacemaker={"pacing_dependent": False}).devices[0]
    assert _rules(dependent)["R5"] == "amber"
    assert _rules(independent)["R5"] == "green"


def test_implants_never_red_on_pressure():
    for env_id in DATA.environments:
        for dev_id in ("pacemaker", "icd"):
            assert _rules(_report(env_id, 30, dev_id).devices[0])["R1"] != "red"


def test_endoprosthesis_bone_threshold():
    assert _report("moon_habitat", 30, "endoprosthesis").devices[0].status == "green"
    assert _report("moon_habitat", 31, "endoprosthesis").devices[0].status == "amber"


def test_mars_followup_amber_for_local_programming():
    assert _rules(_report("moon_habitat", 30, "cochlear_implant").devices[0])["R7"] == "green"
    assert _rules(_report("mars_habitat", 30, "cochlear_implant").devices[0])["R7"] == "amber"


def test_unknown_never_green_eva_temperature():
    rules = _rules(_report("moon_eva", 30, "powered_ankle").devices[0])
    assert rules["R4"] == "amber"  # suit microclimate is an assumption


def test_determinism():
    a = _report("mars_eva", 200, *DATA.devices)
    b = _report("mars_eva", 200, *DATA.devices)
    assert a.model_dump(exclude={"generated_at"}) == b.model_dump(exclude={"generated_at"})


def test_input_out_of_range_rejected():
    with pytest.raises(ValueError):
        _report("moon_habitat", 30, "powered_ankle", powered_ankle={"body_mass_kg": 5})


def test_every_value_has_known_source_and_level():
    for dev_id in DATA.devices:
        for env_id in DATA.environments:
            for f in _report(env_id, 100, dev_id).devices[0].findings:
                assert f.sources, f"{dev_id}/{f.rule_id} has no sources"
                for src in f.sources:
                    assert src in DATA.sources, src
                for v in f.values:
                    assert v.level in {"F", "E", "A", "VERIFY", "INPUT"}
                    assert v.source in DATA.sources or v.source == "INPUT"
