"""API contract tests for POST /api/assess and the served data files."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_and_data_files():
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/data/destinations.json").json()["destinations"][0]["id"] == "orbit"
    assert len(client.get("/data/devices.json").json()["devices"]) == 4


def test_assess_contract():
    res = client.post("/api/assess", json={"destination_id": "moon", "device_id": "powered_knee",
                                           "stay_days": 30, "body_mass_kg": 80, "with_mitigations": False})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] in {"compatible", "conditional", "not_compatible"}
    assert body["recalibration"]["destination_nm"] == [6.6, 16.7]
    assert "default-src 'self'" in res.headers["content-security-policy"]


def test_assess_errors():
    assert client.post("/api/assess", json={"destination_id": "venus", "device_id": "pacemaker", "stay_days": 30}).status_code == 404
    assert client.post("/api/assess", json={"destination_id": "moon", "device_id": "pacemaker", "stay_days": 0}).status_code == 422
    res = client.post("/api/assess", json={"destination_id": "moon", "device_id": "powered_knee", "stay_days": 30, "body_mass_kg": 150})
    assert res.status_code == 422 and "50 and 116" in res.json()["detail"]
