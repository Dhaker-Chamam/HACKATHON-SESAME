"""Loads the versioned JSON reference data and enforces the provenance rule.

Startup fails if any value lacks a known source or an evidence level, so an
unsourced number can never reach a report.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .models import Device, Environment, Param, Source

DATA_DIR = Path(__file__).parent / "data"
FILES = ("sources.json", "environments.json", "devices.json")


class DataError(ValueError):
    pass


@dataclass(frozen=True)
class ReferenceData:
    sources: dict[str, Source]
    environments: dict[str, Environment]
    devices: dict[str, Device]
    version: str


def _check_param(owner: str, key: str, param: Param, sources: dict[str, Source]) -> None:
    if param.source not in sources:
        raise DataError(f"{owner}.{key}: unknown source '{param.source}'")


def validate(sources: dict[str, Source], envs: dict[str, Environment], devices: dict[str, Device]) -> None:
    for env in envs.values():
        for key, param in {**env.params, **env.context}.items():
            _check_param(env.id, key, param, sources)
        for t in env.transitions:
            if t.source not in sources:
                raise DataError(f"{env.id}.transition '{t.label}': unknown source '{t.source}'")
        for leg in env.transit_legs:
            _check_param(env.id, leg.label + ".days", leg.days, sources)
            _check_param(env.id, leg.label + ".rate", leg.h_rate_msv_day, sources)
        for required in ("gravity_ms2", "p_kpa", "o2_fraction", "temp_c", "h_rate_msv_day", "delay_s", "dust_class"):
            if required not in env.params:
                raise DataError(f"{env.id}: missing required parameter '{required}'")
        if env.kind == "eva":
            for required in ("m_carried_kg", "suit_self_support", "eva_h"):
                if required not in env.params:
                    raise DataError(f"{env.id}: EVA profile missing '{required}'")
    for dev in devices.values():
        for key, param in dev.params.items():
            _check_param(dev.id, key, param, sources)
        for required in ("location", "battery_chem", "memory_electronics", "followup", "gravity_function", "life_critical"):
            if required not in dev.params:
                raise DataError(f"{dev.id}: missing required parameter '{required}'")


def load(data_dir: Path = DATA_DIR) -> ReferenceData:
    raw = {name: (data_dir / name).read_text(encoding="utf-8") for name in FILES}
    sources = {s["id"]: Source(**s) for s in json.loads(raw["sources.json"])}
    envs = {e["id"]: Environment(**e) for e in json.loads(raw["environments.json"])}
    devices = {d["id"]: Device(**d) for d in json.loads(raw["devices.json"])}
    validate(sources, envs, devices)
    digest = hashlib.sha256("".join(raw[name] for name in FILES).encode("utf-8")).hexdigest()[:10]
    return ReferenceData(sources=sources, environments=envs, devices=devices, version=digest)


@lru_cache(maxsize=1)
def get_data() -> ReferenceData:
    return load()
