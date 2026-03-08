from __future__ import annotations

from fastapi.testclient import TestClient


def test_login_returns_string_ids(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login",
        json={"email": "admin@claric.local", "password": "Nimbus#12345"},
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert isinstance(data["user"]["id"], str)
    assert len(data["user"]["id"]) == 18

    assert isinstance(data["business_units"], list)
    assert data["business_units"], "seeded business units expected"
    assert isinstance(data["business_units"][0]["id"], str)
    assert len(data["business_units"][0]["id"]) == 18

    # Cookie present
    set_cookie = res.headers.get("set-cookie", "")
    assert "sid=" in set_cookie


def test_me_returns_string_ids(client: TestClient) -> None:
    login = client.post(
        "/api/auth/login",
        json={"email": "admin@claric.local", "password": "Nimbus#12345"},
    )
    assert login.status_code == 200, login.text

    me = client.get("/api/auth/me")
    assert me.status_code == 200, me.text
    data = me.json()

    assert isinstance(data["user"]["id"], str)
    assert len(data["user"]["id"]) == 18

    assert isinstance(data["business_units"][0]["id"], str)
    assert len(data["business_units"][0]["id"]) == 18
