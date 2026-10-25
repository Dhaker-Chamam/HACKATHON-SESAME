"""Booking end to end against the real Supabase project. Opt-in: needs the network, Node.js and .env.

Run with:  $env:BP_TEST_SUPABASE = "1"; .\\.venv\\Scripts\\python -m pytest -q tests/test_booking_e2e.py
It creates and cancels bookings; run supabase/seed_booking.sql afterwards for a clean demo state.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from app.datasource import read_env_file

read_env_file()
ROOT = Path(__file__).resolve().parent.parent
pytestmark = pytest.mark.skipif(
    os.environ.get("BP_TEST_SUPABASE") != "1" or not os.environ.get("SUPABASE_URL") or shutil.which("node") is None,
    reason="set BP_TEST_SUPABASE=1, SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in .env, and install Node.js",
)


def test_booking_checklist():
    out = subprocess.run(["node", str(ROOT / "tests" / "js" / "booking_e2e.js")], capture_output=True,
                         cwd=ROOT, timeout=120)
    results = json.loads(out.stdout.decode("utf-8"))
    failed = [r for r in results if not r["ok"]]
    assert results and not failed, json.dumps(failed, indent=2)
