"""Bionic Passport: FastAPI application.

Run locally:  .venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .engine import DATA_DIR, AssessError, assess, load_data

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
VERSION = "2.0.0"

DATA = load_data()  # validated at import: the app does not start with unsourced values

app = FastAPI(
    title="Bionic Passport API",
    version=VERSION,
    description="Checks whether a medical device will work in an orbital habitat, a lunar base or a Mars base. "
                "Decision support only, not medical advice.",
)


class AssessRequest(BaseModel):
    destination_id: str
    device_id: str
    stay_days: int = Field(30, ge=1, le=1500)
    body_mass_kg: float | None = Field(None, ge=20, le=300)
    with_mitigations: bool = False


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
    if request.url.path.startswith(("/api/", "/data/")):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(AssessError)
async def _assess_error(_: Request, exc: AssessError):
    return JSONResponse(status_code=404 if exc.not_found else 422, content={"detail": str(exc)})


@app.get("/api/health")
def health():
    return {"status": "ok", "version": VERSION}


@app.post("/api/assess")
def post_assess(req: AssessRequest):
    return assess(DATA, req.destination_id, req.device_id, req.stay_days, req.body_mass_kg, req.with_mitigations)


app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
