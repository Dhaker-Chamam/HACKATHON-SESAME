"""The browser fallback (static/engine.js) must return exactly what the server returns."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.engine import DATA_DIR, assess, load_data

ROOT = Path(__file__).resolve().parent.parent
RUNNER = Path(__file__).resolve().parent / "js" / "parity_runner.js"


def _cases():
    cases = []
    for dest in ["orbit", "moon", "mars"]:
        for dev in ["powered_knee", "pacemaker", "insulin_pump", "cochlear_implant"]:
            for days in [7, 30, 182, 365, 1500]:
                for mit in [False, True]:
                    masses = [50, 80, 116] if dev == "powered_knee" else [None]
                    for mass in masses:
                        cases.append({"destination_id": dest, "device_id": dev, "stay_days": days,
                                      "body_mass_kg": mass, "with_mitigations": mit})
    return cases


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not installed")
def test_js_fallback_matches_python(tmp_path):
    cases = _cases()
    case_file = tmp_path / "cases.json"
    case_file.write_text(json.dumps(cases), encoding="utf-8")
    out = subprocess.run(["node", str(RUNNER), str(DATA_DIR), str(case_file)], capture_output=True, check=True,
                         cwd=ROOT, timeout=60)
    js_results = json.loads(out.stdout.decode("utf-8"))
    data = load_data()
    assert len(js_results) == len(cases)
    for case, js in zip(cases, js_results):
        py = assess(data, case["destination_id"], case["device_id"], case["stay_days"],
                    case["body_mass_kg"], case["with_mitigations"])
        assert json.loads(json.dumps(py)) == js, case
