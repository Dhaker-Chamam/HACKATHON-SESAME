"""Bionic Passport: FastAPI application.

Run locally:  .venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import chat
from .datasource import load_catalog, log
from .engine import AssessError, assess, validate_data
from .auth import current_user, login, register

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
VERSION = "2.0.0"

CATALOG, DATA_SOURCE = load_catalog()  # Supabase, or the offline copy in data/
DATA = validate_data(CATALOG["destinations"], CATALOG["devices"])  # the app does not start with unsourced values
log.info("Catalog loaded from %s", DATA_SOURCE)


def _public_supabase_config() -> tuple[str | None, str | None]:
    """Supabase URL and key for the browser, only if the key is a publishable (anon) key.

    The browser books appointments through supabase-js; Row Level Security protects the data.
    A secret or service_role key is never sent to the browser, even if it is put in .env by mistake.
    """
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
    if not url.startswith("https://") or not key:
        return None, None
    if key.startswith("sb_publishable_"):
        return url, key
    if key.count(".") == 2:  # legacy anon JWT: accept only role "anon"
        try:
            claims = json.loads(base64.urlsafe_b64decode(key.split(".")[1] + "=="))
        except ValueError:
            return None, None
        if claims.get("role") == "anon":
            return url, key
    log.warning("SUPABASE_PUBLISHABLE_KEY is not a publishable key; booking stays offline.")
    return None, None


SUPABASE_URL, SUPABASE_KEY = _public_supabase_config()
CONNECT_SRC = f"'self' {SUPABASE_URL}" if SUPABASE_URL else "'self'"

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


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=2000)


class ChatSelection(BaseModel):
    destination_id: str | None = None
    device_id: str | None = None
    stay_days: int = Field(30, ge=1, le=1500)
    body_mass_kg: float | None = Field(None, ge=20, le=300)
    with_mitigations: bool = False
    step: int = Field(1, ge=1, le=3)


class ChatRequest(BaseModel):
    persona_id: str
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    selection: ChatSelection | None = None

    @field_validator("messages")
    @classmethod
    def ends_with_user(cls, v: list[ChatMessage]) -> list[ChatMessage]:
        if v[-1].role != "user":
            raise ValueError("the last message must come from the user")
        return v


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        # style-src-attr: the UI sets gauge widths and colors in style attributes; <style> blocks stay blocked.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; style-src 'self'; style-src-attr 'unsafe-inline'; "
            "script-src 'self'; "
            f"connect-src {CONNECT_SRC}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        )
    if request.url.path.startswith(("/api/", "/data/")):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(AssessError)
async def _assess_error(_: Request, exc: AssessError):
    return JSONResponse(status_code=404 if exc.not_found else 422, content={"detail": str(exc)})


@app.get("/api/health")
def health():
    return {"status": "ok", "version": VERSION, "data_source": DATA_SOURCE, "chat": chat.api_key() is not None}


@app.get("/api/config")
def public_config():
    """Public settings for the browser: the Supabase URL and publishable key (never a secret key)."""
    return {"supabase_url": SUPABASE_URL, "supabase_publishable_key": SUPABASE_KEY}


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


@app.post("/api/chat")
async def post_chat(req: ChatRequest, request: Request):
    try:
        chat.check_rate(request.client.host if request.client else "unknown")
        selection = req.selection.model_dump() if req.selection else None
        messages = [m.model_dump() for m in req.messages]
        # The Gemini call blocks for seconds, so it runs off the event loop.
        return await run_in_threadpool(chat.run_chat, CATALOG, DATA, req.persona_id, messages, selection)
    except chat.ChatError as exc:
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)})


@app.get("/data/{name}.json")
def data_file(name: str):
    if name not in CATALOG:
        raise HTTPException(status_code=404, detail="Not found")
    return CATALOG[name]


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
