"""Bionic Passport: FastAPI application.

Run locally:  .venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .datasource import load_catalog, log
from .engine import AssessError, assess, validate_data
from .auth import current_user, login, register

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
VERSION = "2.0.0"

CATALOG, DATA_SOURCE = load_catalog()  # Supabase, or the offline copy in data/
DATA = validate_data(CATALOG["destinations"], CATALOG["devices"])  # the app does not start with unsourced values
log.info("Catalog loaded from %s", DATA_SOURCE)

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


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=2, max_length=100)


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
    return {"status": "ok", "version": VERSION, "data_source": DATA_SOURCE}


@app.post("/api/auth/login")
def auth_login(req: LoginRequest):
    return login(req.email, req.password)


@app.post("/api/auth/register")
def auth_register(req: RegisterRequest):
    return register(req.email, req.password, req.full_name)


@app.get("/api/auth/me")
def auth_me(request: Request):
    user = current_user(request)
    metadata = user.get("user_metadata") or {}
    name = metadata.get("full_name") or user.get("email", "").split("@")[0]
    return {"id": user["id"], "email": user.get("email"), "full_name": name}


@app.post("/api/assess")
def post_assess(req: AssessRequest, _: dict = Depends(current_user)):
    return assess(DATA, req.destination_id, req.device_id, req.stay_days, req.body_mass_kg, req.with_mitigations)


@app.get("/data/{name}.json")
def data_file(name: str):
    if name not in CATALOG:
        raise HTTPException(status_code=404, detail="Not found")
    return CATALOG[name]


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
