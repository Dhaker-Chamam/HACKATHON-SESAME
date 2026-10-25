"""Deterministic compatibility engine. No randomness, no network, no AI."""

from __future__ import annotations

from datetime import datetime, timezone

from ..data_loader import ReferenceData
from ..models import AssessRequest, DeviceReport, DeviceSelection, Environment, Report
from .rules import RULES, Ctx

ENGINE_VERSION = "1.0.0"
SEVERITY = {"green": 0, "amber": 1, "red": 2}
# Among findings of equal severity, the headline comes from the most consequential rule.
# Red: fire and pressure hazards first. Amber: the finding that changes what the user must do.
HEADLINE_PRIORITY = {
    "red": {rid: i for i, rid in enumerate(["R3", "R2", "R1", "R4", "R5", "R6", "R7", "R8", "R9"])},
    "amber": {rid: i for i, rid in enumerate(["R2", "R5", "R6", "R1", "R7", "R3", "R9", "R8", "R4"])},
    "green": {rid: i for i, rid in enumerate(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"])},
}

DISCLAIMER = (
    "Bionic Passport is a research prototype for decision support. It is not medical advice, "
    "not a medical device, and not a fitness-to-fly or device clearance. Results are based on "
    "published sources and stated assumptions, shown with each value. Do not change any device "
    "setting without your clinician and the manufacturer."
)


class UnknownIdError(KeyError):
    pass


def worst(statuses) -> str:
    statuses = list(statuses)
    return max(statuses, key=SEVERITY.__getitem__) if statuses else "green"


def _inputs_with_defaults(device, given: dict) -> dict:
    values = {i.key: i.default for i in device.inputs}
    for spec in device.inputs:
        if spec.key not in given:
            continue
        raw = given[spec.key]
        if spec.type == "bool":
            values[spec.key] = bool(raw)
        else:
            num = float(raw)
            if spec.min is not None and num < spec.min or spec.max is not None and num > spec.max:
                raise ValueError(f"{device.short}: {spec.label} must be between {spec.min:g} and {spec.max:g} {spec.unit}")
            values[spec.key] = num
    return values


def assess_device(env: Environment, device, inputs: dict, duration_days: int) -> DeviceReport:
    ctx = Ctx(env=env, device=device, inputs=inputs, duration_days=duration_days)
    findings = [f for rule in RULES if (f := rule.fn(ctx)) is not None]
    findings.sort(key=lambda f: (-SEVERITY[f.status], HEADLINE_PRIORITY[f.status][f.rule_id]))
    status = worst(f.status for f in findings)
    flagged = [f for f in findings if f.status == status and status != "green"]
    headline = flagged[0].title if flagged else "No issues found by the rules"
    return DeviceReport(device_id=device.id, name=device.name, short=device.short, category=device.category,
                        status=status, headline=headline, findings=findings,
                        recalibration=ctx.extras.get("recalibration"), inputs=inputs)


def _resolve(data: ReferenceData, env_id: str, selections: list[DeviceSelection]):
    if env_id not in data.environments:
        raise UnknownIdError(f"unknown destination '{env_id}'")
    resolved = []
    for sel in selections:
        if sel.device_id not in data.devices:
            raise UnknownIdError(f"unknown device '{sel.device_id}'")
        device = data.devices[sel.device_id]
        resolved.append((device, _inputs_with_defaults(device, sel.inputs)))
    return data.environments[env_id], resolved


def assess(data: ReferenceData, req: AssessRequest) -> Report:
    env, resolved = _resolve(data, req.env_id, req.devices)
    devices = [assess_device(env, dev, inputs, req.duration_days) for dev, inputs in resolved]
    counts = {s: sum(1 for d in devices if d.status == s) for s in ("green", "amber", "red")}
    return Report(env_id=env.id, env_name=env.name, duration_days=req.duration_days,
                  status=worst(d.status for d in devices), counts=counts, devices=devices,
                  engine_version=ENGINE_VERSION, data_version=data.version,
                  generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                  disclaimer=DISCLAIMER)


def matrix(data: ReferenceData, duration_days: int, selections: list[DeviceSelection]) -> dict:
    """Status of every selected device at every destination."""
    _, resolved = _resolve(data, next(iter(data.environments)), selections)
    rows = []
    for env in data.environments.values():
        cells = []
        for dev, inputs in resolved:
            rep = assess_device(env, dev, inputs, duration_days)
            cells.append({"device_id": dev.id, "status": rep.status, "headline": rep.headline})
        rows.append({"env_id": env.id, "env_name": env.name, "short": env.short, "cells": cells})
    return {"duration_days": duration_days, "rows": rows,
            "devices": [{"device_id": dev.id, "short": dev.short} for dev, _ in resolved]}
