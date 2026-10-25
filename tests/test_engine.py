"""Engine behavior: statuses, torque model, mitigations and data rules."""

import json

import pytest

from app.engine import DATA_DIR, AssessError, assess, load_data

DATA = load_data()
DESTS = ["orbit", "moon", "mars"]
DEVICES = ["powered_knee", "pacemaker", "insulin_pump", "cochlear_implant"]

# (destination, device) -> (status, status with mitigations), for a 30-day stay
EXPECTED = {
    ("orbit", "powered_knee"): ("conditional", "compatible"),
    ("orbit", "pacemaker"): ("conditional", "conditional"),
    ("orbit", "insulin_pump"): ("conditional", "compatible"),
    ("orbit", "cochlear_implant"): ("compatible", "compatible"),
    ("moon", "powered_knee"): ("conditional", "conditional"),
    ("moon", "pacemaker"): ("conditional", "conditional"),
    ("moon", "insulin_pump"): ("conditional", "compatible"),
    ("moon", "cochlear_implant"): ("conditional", "compatible"),
    ("mars", "powered_knee"): ("conditional", "conditional"),
    ("mars", "pacemaker"): ("conditional", "conditional"),
    ("mars", "insulin_pump"): ("conditional", "compatible"),
    ("mars", "cochlear_implant"): ("conditional", "compatible"),
}


@pytest.mark.parametrize("dest,dev", list(EXPECTED))
def test_expected_statuses(dest, dev):
    r = assess(DATA, dest, dev, 30)
    assert (r["status"], r["mitigated_status"]) == EXPECTED[(dest, dev)]


def test_contract_shape():
    r = assess(DATA, "moon", "powered_knee", 30, 80)
    assert set(r) >= {"status", "summary", "factors", "mitigations", "mitigated_status", "recalibration"}
    for f in r["factors"]:
        assert set(f) >= {"factor", "destination_value", "device_limit", "status", "explanation", "evidence_level", "source"}
        assert set(f["source"]) == {"title", "url"}
    for m in r["mitigations"]:
        assert set(m) >= {"text", "resolves"}
    assert set(r["recalibration"]) >= {"phases", "earth_nm", "destination_nm"}


def test_factors_sorted_worst_first():
    for dest in DESTS:
        for dev in DEVICES:
            ranks = [{"compatible": 0, "conditional": 1, "not_compatible": 2}[f["status"]]
                     for f in assess(DATA, dest, dev, 30)["factors"]]
            assert ranks == sorted(ranks, reverse=True)


@pytest.mark.parametrize("dest,stance,swing", [("orbit", 0.0, 16.0), ("moon", 6.6, 16.7), ("mars", 15.2, 17.5)])
def test_knee_torque(dest, stance, swing):
    rc = assess(DATA, dest, "powered_knee", 30, 80)["recalibration"]
    assert rc["phases"] == ["stance", "swing"]
    assert rc["earth_nm"] == [40.0, 20.0]
    assert rc["destination_nm"] == [stance, swing]
    assert rc["evidence_level"] == "Placeholder"


def test_recalibration_only_for_knee():
    for dev in ["pacemaker", "insulin_pump", "cochlear_implant"]:
        assert assess(DATA, "moon", dev, 30)["recalibration"] is None


def test_body_mass_limits():
    assert assess(DATA, "moon", "powered_knee", 30)["recalibration"]["body_mass_kg"] == 80
    with pytest.raises(AssessError):
        assess(DATA, "moon", "powered_knee", 30, 130)


def test_with_mitigations_marks_fixed_rows():
    r = assess(DATA, "moon", "insulin_pump", 30, with_mitigations=True)
    assert r["status"] == "compatible"
    assert all(f["status"] == "compatible" for f in r["factors"])
    assert any(f["fixed"] for f in r["factors"])
    knee = assess(DATA, "moon", "powered_knee", 30, 80, with_mitigations=True)
    assert knee["status"] == "conditional" and "dust" in knee["summary"]


def test_mars_radiation_includes_travel():
    row = next(f for f in assess(DATA, "mars", "pacemaker", 365)["factors"] if f["factor"] == "radiation")
    assert "893 mSv" in row["destination_value"]  # 365 x 0.67 + 2 x 180 x 1.8


def test_temperature_uses_cabin_not_surface():
    row = next(f for f in assess(DATA, "moon", "insulin_pump", 30)["factors"] if f["factor"] == "temperature")
    assert row["status"] == "compatible" and "18 to 27" in row["destination_value"]


def test_invalid_inputs():
    with pytest.raises(AssessError):
        assess(DATA, "venus", "pacemaker", 30)
    with pytest.raises(AssessError):
        assess(DATA, "moon", "toaster", 30)
    with pytest.raises(AssessError):
        assess(DATA, "moon", "pacemaker", 0)


def test_every_placeholder_is_labeled(tmp_path):
    bad = json.loads((DATA_DIR / "devices.json").read_text(encoding="utf-8"))
    bad["devices"][0]["torque_model"]["stance_nm_per_kg"]["note"] = "a number"
    (tmp_path / "devices.json").write_text(json.dumps(bad), encoding="utf-8")
    (tmp_path / "destinations.json").write_text((DATA_DIR / "destinations.json").read_text(encoding="utf-8"), encoding="utf-8")
    with pytest.raises(ValueError, match="PLACEHOLDER"):
        load_data(tmp_path)


def test_no_em_dashes_in_output():
    for dest in DESTS:
        for dev in DEVICES:
            for mit in (False, True):
                text = json.dumps(assess(DATA, dest, dev, 30, with_mitigations=mit), ensure_ascii=False)
                assert "—" not in text and "–" not in text
