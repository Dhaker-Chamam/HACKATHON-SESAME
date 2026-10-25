"""Passport Assistant: the Gemini loop, grounding and errors, against a mock Gemini server (no network)."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import chat
from app.engine import assess
from app.main import CATALOG, DATA, app

client = TestClient(app)
ASK = {"persona_id": "alex", "messages": [{"role": "user", "text": "Is my knee OK on the Moon?"}],
       "selection": {"destination_id": "moon", "device_id": "powered_knee", "stay_days": 30, "step": 3}}


@pytest.fixture
def gemini(monkeypatch):
    """Queue Gemini responses; every request the server sends is recorded in .requests."""
    class Mock:
        responses: list = []
        requests: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        Mock.requests.append(request)
        status, body = Mock.responses.pop(0)
        return httpx.Response(status, json=body)

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.setattr(chat, "gemini_client",
                        lambda: httpx.Client(base_url=chat.API_ROOT, transport=httpx.MockTransport(handler)))
    chat._recent.clear()
    Mock.responses, Mock.requests = [], []
    return Mock


def text_reply(text):
    return 200, {"candidates": [{"content": {"role": "model", "parts": [{"text": text}]}, "finishReason": "STOP"}]}


def test_tool_call_runs_the_engine_and_returns_the_model_turn_unchanged(gemini):
    model_turn = {"role": "model", "parts": [{
        "functionCall": {"id": "call-1", "name": "assess_trip",
                         "args": {"destination_id": "moon", "device_id": "powered_knee", "stay_days": 30.0}},
        "thoughtSignature": "c2lnbmF0dXJl"}]}
    gemini.responses = [(200, {"candidates": [{"content": model_turn}]}), text_reply("It is **conditional**.")]

    res = client.post("/api/chat", json=ASK)

    assert res.status_code == 200
    assert res.json()["reply"] == "It is **conditional**."
    assert res.json()["tools_used"] == [{"name": "assess_trip", "args": model_turn["parts"][0]["functionCall"]["args"]}]
    first, second = gemini.requests
    assert first.url.path == "/v1beta/models/gemini-3.5-flash-lite:generateContent"
    assert first.headers["x-goog-api-key"] == "test-key" and "key=" not in str(first.url)
    contents = json.loads(second.content)["contents"]
    assert contents[-2] == model_turn  # thought signature kept
    response = contents[-1]["parts"][0]["functionResponse"]
    assert response["id"] == "call-1" and response["name"] == "assess_trip"
    assert response["response"] == assess(DATA, "moon", "powered_knee", 30)


def test_prompt_is_personal_to_the_signed_in_account(gemini):
    gemini.responses = [text_reply("Hello Elena.")]
    client.post("/api/chat", json={**ASK, "persona_id": "elena"})
    prompt = json.loads(gemini.requests[0].content)["systemInstruction"]["parts"][0]["text"]
    assert "Elena Rostova" in prompt and "DOS-109" in prompt
    assert "Alex Mercer" not in prompt and "DOS-402" not in prompt  # other accounts stay out
    assert '"status": "conditional"' in prompt  # saved trips carry engine results, not model guesses


def test_history_maps_to_gemini_roles(gemini):
    gemini.responses = [text_reply("Sure.")]
    messages = [{"role": "user", "text": "Hi"}, {"role": "assistant", "text": "Hello"}, {"role": "user", "text": "And Mars?"}]
    client.post("/api/chat", json={**ASK, "messages": messages})
    contents = json.loads(gemini.requests[0].content)["contents"]
    assert [c["role"] for c in contents] == ["user", "model", "user"]


def test_without_a_key_the_assistant_says_how_to_set_it_up(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    chat._recent.clear()
    res = client.post("/api/chat", json=ASK)
    assert res.status_code == 503 and "GEMINI_API_KEY" in res.json()["detail"]
    assert client.get("/api/health").json()["chat"] is False


@pytest.mark.parametrize("status, expected", [(403, 502), (429, 503), (500, 502)])
def test_gemini_errors_become_clear_messages(gemini, status, expected):
    gemini.responses = [(status, {"error": {"message": "nope"}})]
    res = client.post("/api/chat", json=ASK)
    assert res.status_code == expected and res.json()["detail"]


def test_blocked_prompt_gets_a_polite_reply(gemini):
    gemini.responses = [(200, {"promptFeedback": {"blockReason": "SAFETY"}})]
    res = client.post("/api/chat", json=ASK)
    assert res.status_code == 200 and "can't help" in res.json()["reply"]


def test_input_validation(gemini):
    assert client.post("/api/chat", json={**ASK, "persona_id": "nobody"}).status_code == 404
    assert not gemini.requests  # rejected before anything is sent to Gemini
    assert client.post("/api/chat", json={**ASK, "messages": [{"role": "assistant", "text": "x"}]}).status_code == 422
    assert client.post("/api/chat", json={**ASK, "messages": [{"role": "user", "text": "x" * 2001}]}).status_code == 422


def test_rate_limit():
    chat._recent.clear()
    for _ in range(chat.RATE_LIMIT):
        chat.check_rate("1.2.3.4", now=0.0)
    with pytest.raises(chat.ChatError) as exc:
        chat.check_rate("1.2.3.4", now=1.0)
    assert exc.value.status == 429
    chat.check_rate("1.2.3.4", now=61.0)  # the window moves on


def test_tools_reject_unknown_ids():
    assert "error" in chat.run_tool(DATA, "assess_trip", {"destination_id": "krypton", "device_id": "cgm", "stay_days": 30})
    assert "error" in chat.run_tool(DATA, "get_device", {"device_id": "toaster"})
    assert chat.run_tool(DATA, "get_destination", {"destination_id": "mars"})["name"] == "Mars"
    assert len(CATALOG["personas"]["personas"]) >= 1
