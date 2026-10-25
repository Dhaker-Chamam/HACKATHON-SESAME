"""Opt-in storage of reports in SQLite.

Nothing is stored unless the user asks to save. Saved reports contain device
archetypes, settings and findings only: no names or identifiers. They expire
after RETENTION_DAYS and can be deleted at any time.
"""

from __future__ import annotations

import json
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .models import Report

DB_PATH = Path(__file__).resolve().parent.parent / "var" / "reports.sqlite3"
RETENTION_DAYS = 7

SCHEMA = """
CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    env_id TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    engine_version TEXT NOT NULL,
    data_version TEXT NOT NULL,
    report_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assessment_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    user_inputs_json TEXT NOT NULL,
    status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_device_id INTEGER NOT NULL REFERENCES assessment_devices(id) ON DELETE CASCADE,
    rule_id TEXT NOT NULL,
    status TEXT NOT NULL,
    explanation TEXT NOT NULL,
    mitigation TEXT NOT NULL,
    source_ids TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assessments_expires ON assessments(expires_at);
"""


@contextmanager
def _db(path: Path | None):
    path = path or DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(SCHEMA)
        with conn:
            yield conn
    finally:
        conn.close()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def purge_expired(path: Path | None = None) -> int:
    with _db(path) as conn:
        return conn.execute("DELETE FROM assessments WHERE expires_at < ?", (_now().isoformat(),)).rowcount


def save(report: Report, path: Path | None = None) -> str:
    purge_expired(path)
    report_id = secrets.token_urlsafe(16)
    report.report_id = report_id
    created = _now()
    with _db(path) as conn:
        conn.execute(
            "INSERT INTO assessments VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (report_id, created.isoformat(), (created + timedelta(days=RETENTION_DAYS)).isoformat(),
             report.env_id, report.duration_days, report.engine_version, report.data_version,
             report.model_dump_json()),
        )
        for dev in report.devices:
            cur = conn.execute(
                "INSERT INTO assessment_devices (assessment_id, device_id, user_inputs_json, status) VALUES (?, ?, ?, ?)",
                (report_id, dev.device_id, json.dumps(dev.inputs), dev.status),
            )
            conn.executemany(
                "INSERT INTO findings (assessment_device_id, rule_id, status, explanation, mitigation, source_ids) VALUES (?, ?, ?, ?, ?, ?)",
                [(cur.lastrowid, f.rule_id, f.status, f.explanation, f.mitigation, json.dumps(f.sources)) for f in dev.findings],
            )
    return report_id


def load(report_id: str, path: Path | None = None) -> dict | None:
    with _db(path) as conn:
        row = conn.execute(
            "SELECT report_json, expires_at FROM assessments WHERE id = ? AND expires_at >= ?",
            (report_id, _now().isoformat()),
        ).fetchone()
    if row is None:
        return None
    report = json.loads(row[0])
    report["expires_at"] = row[1]
    return report


def delete(report_id: str, path: Path | None = None) -> bool:
    with _db(path) as conn:
        return conn.execute("DELETE FROM assessments WHERE id = ?", (report_id,)).rowcount > 0
