"""Where the catalog comes from.

Supabase is the source of truth when SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set, in the
environment or in .env. If Supabase cannot be reached, the server falls back to the JSON copy in
data/, so the demo still runs offline. BP_DATA_SOURCE=local forces the copy (the tests use it).
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import httpx

from .engine import DATA_DIR

ROOT = Path(__file__).resolve().parent.parent
COLLECTIONS = ("destinations", "devices", "personas", "dossiers")
TIMEOUT_S = 4.0

log = logging.getLogger("uvicorn.error")


def read_env_file(path: Path = ROOT / ".env") -> None:
    """KEY=VALUE lines from .env. Real environment variables win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def load_local(data_dir: Path = DATA_DIR) -> dict:
    return {name: json.loads((data_dir / f"{name}.json").read_text(encoding="utf-8")) for name in COLLECTIONS}


def fetch_supabase(url: str, key: str) -> dict:
    """Rebuild the four JSON documents from the Supabase tables (see supabase/schema.sql)."""
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    with httpx.Client(base_url=f"{url.rstrip('/')}/rest/v1", headers=headers, timeout=TIMEOUT_S) as client:
        def rows(table: str, params: dict) -> list:
            r = client.get(f"/{table}", params=params)
            r.raise_for_status()
            return r.json()

        catalog = {name: {} for name in COLLECTIONS}
        for s in rows("catalog_settings", {"select": "collection,key,value", "order": "collection,key"}):
            catalog[s["collection"]][s["key"]] = s["value"]
        for name in COLLECTIONS:
            catalog[name][name] = [r["data"] for r in rows(name, {"select": "data", "order": "sort_order,id"})]
            if not catalog[name][name]:
                raise ValueError(f"Supabase table {name} is empty")
    return catalog


def load_catalog() -> tuple[dict, str]:
    """Return (catalog, source), source being "supabase" or "local"."""
    read_env_file()
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if os.environ.get("BP_DATA_SOURCE", "").lower() != "local" and url and key:
        try:
            return fetch_supabase(url, key), "supabase"
        except (httpx.HTTPError, httpx.InvalidURL, KeyError, TypeError, ValueError) as exc:
            log.warning("Supabase unavailable (%s). Using the local copy in data/.", exc)
    return load_local(), "local"
