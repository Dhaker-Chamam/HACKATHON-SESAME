"""Supabase Auth helpers for login, registration, and bearer-token sessions."""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import HTTPException, Request

from .datasource import read_env_file


def _settings() -> tuple[str, str]:
    read_env_file()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise HTTPException(status_code=503, detail="Authentication is not configured.")
    return url.rstrip("/"), key


def _request(method: str, path: str, *, key: str, token: str | None = None,
             json: dict[str, Any] | None = None) -> dict[str, Any]:
    url, _ = _settings()
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = httpx.request(method, f"{url}{path}", headers=headers, json=json, timeout=8)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Authentication service unavailable.") from exc
    if response.is_error:
        detail = response.json().get("msg") or response.json().get("error_description") or "Authentication failed."
        raise HTTPException(status_code=401 if response.status_code in (400, 401) else 502, detail=detail)
    return response.json()


def login(email: str, password: str) -> dict[str, Any]:
    _, key = _settings()
    return _request("POST", "/auth/v1/token?grant_type=password", key=key,
                    json={"email": email, "password": password})


def register(email: str, password: str, full_name: str) -> dict[str, Any]:
    _, key = _settings()
    return _request("POST", "/auth/v1/signup", key=key,
                    json={"email": email, "password": password,
                          "data": {"full_name": full_name}})


def current_user(request: Request) -> dict[str, Any]:
    authorization = request.headers.get("Authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    _, key = _settings()
    return _request("GET", "/auth/v1/user", key=key, token=token)
