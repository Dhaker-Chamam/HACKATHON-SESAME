"""Pydantic models for reference data, API requests and reports."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Level = Literal["F", "E", "A", "VERIFY"]
Status = Literal["green", "amber", "red"]

# Weakest-evidence ordering: a derived value inherits the weakest level of its inputs.
LEVEL_RANK: dict[str, int] = {"F": 0, "E": 1, "A": 2, "VERIFY": 3}


def weakest(*levels: str) -> str:
    return max(levels, key=lambda lv: LEVEL_RANK[lv])


class Param(BaseModel):
    """One sourced value. Either `value` or a `min`/`max` range."""

    value: float | str | bool | None = None
    min: float | None = None
    max: float | None = None
    unit: str = ""
    level: Level
    source: str
    note: str = ""

    @model_validator(mode="after")
    def _has_value(self) -> "Param":
        if self.value is None and self.min is None and self.max is None:
            raise ValueError("parameter needs a value or a min/max range")
        return self

    @property
    def lo(self) -> float:
        return float(self.min if self.min is not None else self.value)

    @property
    def hi(self) -> float:
        return float(self.max if self.max is not None else self.value)


class Transition(BaseModel):
    label: str
    from_kpa: float
    to_kpa: float
    connected_required: bool
    level: Level
    source: str


class TransitLeg(BaseModel):
    label: str
    days: Param
    h_rate_msv_day: Param


class Environment(BaseModel):
    id: str
    name: str
    short: str
    kind: Literal["station", "habitat", "eva"]
    body: Literal["leo", "moon", "mars"]
    summary: str
    params: dict[str, Param]
    transitions: list[Transition] = []
    transit_legs: list[TransitLeg] = []
    context: dict[str, Param] = {}

    def p(self, key: str) -> Param | None:
        return self.params.get(key)


class DeviceInput(BaseModel):
    key: str
    label: str
    type: Literal["number", "bool"]
    default: float | bool
    min: float | None = None
    max: float | None = None
    unit: str = ""
    help: str = ""


class Device(BaseModel):
    id: str
    name: str
    short: str
    category: str
    summary: str
    params: dict[str, Param]
    inputs: list[DeviceInput] = []
    mitigations: dict[str, str] = {}

    def p(self, key: str) -> Param | None:
        return self.params.get(key)

    def val(self, key: str, default=None):
        param = self.params.get(key)
        return default if param is None else param.value

    def flag(self, key: str) -> bool:
        return bool(self.val(key, False))


class Source(BaseModel):
    id: str
    kind: str
    author_org: str
    title: str
    year: int | None = None
    url: str | None = None
    verified: bool
    note: str = ""


# ---------- API requests ----------


class DeviceSelection(BaseModel):
    device_id: str
    inputs: dict[str, float | bool] = {}


class AssessRequest(BaseModel):
    env_id: str
    duration_days: int = Field(30, ge=1, le=1500)
    devices: list[DeviceSelection] = Field(..., min_length=1, max_length=12)
    save: bool = False


class MatrixRequest(BaseModel):
    duration_days: int = Field(30, ge=1, le=1500)
    devices: list[DeviceSelection] = Field(..., min_length=1, max_length=12)


class RecalibrateRequest(BaseModel):
    env_id: str
    device_id: Literal["powered_ankle", "mpk_knee"]
    inputs: dict[str, float | bool] = {}


# ---------- Report ----------


class Value(BaseModel):
    """A number shown in the report, with its evidence badge."""

    label: str
    display: str
    level: Literal["F", "E", "A", "VERIFY", "INPUT"]
    source: str
    note: str = ""


class Finding(BaseModel):
    rule_id: str
    rule_name: str
    status: Status
    title: str
    explanation: str
    mitigation: str
    values: list[Value] = []
    sources: list[str] = []


class DeviceReport(BaseModel):
    device_id: str
    name: str
    short: str
    category: str
    status: Status
    headline: str
    findings: list[Finding]
    recalibration: dict | None = None
    inputs: dict[str, float | bool] = {}


class Report(BaseModel):
    report_id: str | None = None
    env_id: str
    env_name: str
    duration_days: int
    status: Status
    counts: dict[str, int]
    devices: list[DeviceReport]
    engine_version: str
    data_version: str
    generated_at: str
    disclaimer: str
