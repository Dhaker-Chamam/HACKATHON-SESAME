"""Supabase must hold exactly the catalog in data/. Opt-in: needs the network and .env.

Run with:  $env:BP_TEST_SUPABASE = "1"; .\\.venv\\Scripts\\python -m pytest -q tests/test_supabase_sync.py
"""

import os

import pytest

from app.datasource import COLLECTIONS, fetch_supabase, load_local, read_env_file
from app.engine import assess, validate_data

read_env_file()
pytestmark = pytest.mark.skipif(
    os.environ.get("BP_TEST_SUPABASE") != "1" or not os.environ.get("SUPABASE_URL"),
    reason="set BP_TEST_SUPABASE=1 and SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY in .env",
)


@pytest.fixture(scope="module")
def remote():
    return fetch_supabase(os.environ["SUPABASE_URL"], os.environ["SUPABASE_PUBLISHABLE_KEY"])


@pytest.mark.parametrize("name", COLLECTIONS)
def test_collection_matches_local_copy(remote, name):
    assert remote[name] == load_local()[name]


def test_every_assessment_is_identical(remote):
    local = load_local()
    a = validate_data(local["destinations"], local["devices"])
    b = validate_data(remote["destinations"], remote["devices"])
    for dest in [d["id"] for d in local["destinations"]["destinations"]]:
        for dev in local["devices"]["devices"]:
            mass = 80 if dev.get("body_mass_kg") else None
            for mit in (False, True):
                args = (dest, dev["id"], 30, mass, mit)
                # jsonb does not keep object key order, which JSON gives no meaning; list order must match
                assert assess(a, *args) == assess(b, *args), args
