"""Bionic Passport: FastAPI application.

Run locally:  .venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import storage
from .data_loader import get_data
from .engine import DISCLAIMER, ENGINE_VERSION, UnknownIdError, assess, matrix
from .engine.policy import G0, policy_list
from .engine.recalibration import recalibrate
from .engine.rules import RULES
from .models import AssessRequest, MatrixRequest, RecalibrateRequest

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
REPORT_ID = re.compile(r"^[A-Za-z0-9_-]{16,64}$")

EVIDENCE_LEGEND = [
    {"level": "F", "label": "Fact", "meaning": "Measured, written in a standard, or printed in the manufacturer's instructions."},
    {"level": "E", "label": "Estimate", "meaning": "Published by researchers, but an estimate or an interpretation."},
    {"level": "A", "label": "Assumption", "meaning": "Our modeling choice; the reasoning is in the note."},
    {"level": "VERIFY", "label": "Verify", "meaning": "Found, but not yet confirmed against the original document."},
    {"level": "INPUT", "label": "Input", "meaning": "Entered by the user."},
]

app = FastAPI(
    title="Bionic Passport API",
    version=ENGINE_VERSION,
    description="Deterministic compatibility checks for medical implants and prostheses off Earth. Research prototype, not medical advice.",
)

DATA = get_data()  # validated at import: the app does not start with unsourced values


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(UnknownIdError)
async def _unknown(_: Request, exc: UnknownIdError):
    return JSONResponse(status_code=404, content={"detail": str(exc.args[0])})


@app.exception_handler(ValueError)
async def _invalid(_: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/api/health")
def health():
    return {"status": "ok", "engine_version": ENGINE_VERSION, "data_version": DATA.version}


@app.get("/api/destinations")
def destinations():
    out = []
    for env in DATA.environments.values():
        item = env.model_dump()
        item["g_ratio"] = env.p("gravity_ms2").value / G0
        out.append(item)
    return out


@app.get("/api/devices")
def devices():
    return [d.model_dump() for d in DATA.devices.values()]


@app.get("/api/rules")
def rules():
    return {
        "engine_version": ENGINE_VERSION,
        "data_version": DATA.version,
        "rules": [{"id": r.id, "name": r.name, "checks": r.checks, "decision": r.decision, "sources": list(r.sources)} for r in RULES],
        "policies": policy_list(),
        "evidence_legend": EVIDENCE_LEGEND,
        "disclaimer": DISCLAIMER,
    }


@app.get("/api/sources")
def sources():
    return [s.model_dump() for s in DATA.sources.values()]


@app.post("/api/assess")
def post_assess(req: AssessRequest):
    report = assess(DATA, req)
    if req.save:
        storage.save(report)
    return report


@app.post("/api/matrix")
def post_matrix(req: MatrixRequest):
    return matrix(DATA, req.duration_days, req.devices)


@app.post("/api/recalibrate")
def post_recalibrate(req: RecalibrateRequest):
    env = DATA.environments.get(req.env_id)
    if env is None:
        raise UnknownIdError(f"unknown destination '{req.env_id}'")
    block = recalibrate(env, req.device_id, req.inputs)
    if block is None:
        raise HTTPException(status_code=422, detail="No walking load in microgravity: recalibration does not apply.")
    return block


@app.get("/api/reports/{report_id}")
def get_report(report_id: str):
    if not REPORT_ID.match(report_id):
        raise HTTPException(status_code=404, detail="report not found")
    report = storage.load(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found or expired")
    return report


@app.delete("/api/reports/{report_id}", status_code=204)
def delete_report(report_id: str):
    if not REPORT_ID.match(report_id) or not storage.delete(report_id):
        raise HTTPException(status_code=404, detail="report not found")


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
