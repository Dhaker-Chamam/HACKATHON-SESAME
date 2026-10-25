"""API smoke tests, including opt-in save, expiry-safe load and delete."""

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DB_PATH", tmp_path / "test.sqlite3")
    return TestClient(app)


def test_reference_endpoints(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert len(client.get("/api/destinations").json()) == 5
    assert len(client.get("/api/devices").json()) == 7
    rules = client.get("/api/rules").json()
    assert [r["id"] for r in rules["rules"]] == [f"R{i}" for i in range(1, 10)]
    assert any(s["id"] == "S13" for s in client.get("/api/sources").json())


def test_assess_and_security_headers(client):
    res = client.post("/api/assess", json={"env_id": "moon_eva", "duration_days": 30,
                                           "devices": [{"device_id": "powered_ankle"}]})
    assert res.status_code == 200
    assert res.json()["status"] == "red"
    assert res.json()["report_id"] is None
    assert "default-src 'self'" in res.headers["content-security-policy"]
    assert res.headers["cache-control"] == "no-store"


def test_unknown_ids_and_bad_input(client):
    assert client.post("/api/assess", json={"env_id": "venus", "devices": [{"device_id": "icd"}]}).status_code == 404
    assert client.post("/api/assess", json={"env_id": "moon_eva", "devices": [{"device_id": "x"}]}).status_code == 404
    bad = client.post("/api/assess", json={"env_id": "moon_eva", "devices": [{"device_id": "powered_ankle", "inputs": {"body_mass_kg": 999}}]})
    assert bad.status_code == 422
    assert client.post("/api/assess", json={"env_id": "moon_eva", "duration_days": 0, "devices": [{"device_id": "icd"}]}).status_code == 422


def test_matrix(client):
    res = client.post("/api/matrix", json={"duration_days": 30, "devices": [{"device_id": "insulin_pump"}]}).json()
    statuses = {row["env_id"]: row["cells"][0]["status"] for row in res["rows"]}
    assert statuses["moon_eva"] == "red" and statuses["moon_habitat"] == "amber"


def test_recalibrate_endpoint(client):
    res = client.post("/api/recalibrate", json={"env_id": "mars_habitat", "device_id": "powered_ankle",
                                                "inputs": {"body_mass_kg": 80, "push_off_nm": 120}})
    assert res.json()["parameters"][0]["start"] == pytest.approx(45.64, abs=0.01)
    assert client.post("/api/recalibrate", json={"env_id": "leo_station", "device_id": "powered_ankle"}).status_code == 422


def test_opt_in_save_load_delete(client):
    res = client.post("/api/assess", json={"env_id": "moon_habitat", "duration_days": 30, "save": True,
                                           "devices": [{"device_id": "insulin_pump"}]}).json()
    rid = res["report_id"]
    assert rid and len(rid) >= 16
    loaded = client.get(f"/api/reports/{rid}").json()
    assert loaded["env_id"] == "moon_habitat" and "expires_at" in loaded
    assert client.delete(f"/api/reports/{rid}").status_code == 204
    assert client.get(f"/api/reports/{rid}").status_code == 404
    assert client.get("/api/reports/..%2F..%2Fetc").status_code == 404
