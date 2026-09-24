"""Studio documents: assembly draft + connection rule set (versioned, 409 on stale base)."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def _auth(client: TestClient, role: str) -> dict[str, str]:
    token = client.post("/internal/auth-test/dev-token", json={"role": role, "subject": f"{role}-1"}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


def _assembly(plant_id: str = "demo_microgrid_001", **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "assembly_id": "studio_demo",
        "plant_id": plant_id,
        "version": "0.1.0",
        "assets": [
            {
                "asset_id": "dc_power_supply_1",
                "component_type_id": "dc_power_supply",
                "display_name": "DC Power Supply",
                "position_2d": {"x": 0, "y": 0},
            },
            {
                "asset_id": "dc_motor_12v_1",
                "component_type_id": "dc_motor_12v",
                "display_name": "12V DC Motor",
                "position_2d": {"x": 320, "y": 0},
            },
        ],
        "connections": [
            {
                "connection_id": "C001",
                "from_asset_id": "dc_power_supply_1",
                "from_port_id": "dc_out",
                "to_asset_id": "dc_motor_12v_1",
                "to_port_id": "power_in",
                "connection_kind": "power",
                "approved": False,
                "lag_min_ms": 0,
                "lag_max_ms": 200,
                "notes": "",
            }
        ],
        "global_tags": [],
        "metadata": {},
    }
    body.update(overrides)
    return body


def _rules(**custom: Any) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "builtins": {
            "medium_compatibility": {"enabled": True, "check_quantity": True, "matrix": {"dc_power": {"dc_power": "allow"}}},
            "max_connections": {"enabled": True, "severity": "deny", "default": {"fan_in": 1}, "limits": {"dc_power": {"fan_out": 8, "fan_in": 1}}},
            "cycle_policy": {"enabled": True, "default": "allow", "per_medium": {"dc_power": "deny"}},
        },
        "custom": [
            {
                "id": "no-sensor-to-motor",
                "name": "Sensors never drive motors",
                "priority": 10,
                "source": {"categories": ["sensors"]},
                "target": {"component_type_ids": ["dc_motor_12v"]},
                "media": [],
                "action": "deny",
                "message": "A sensor output cannot drive a motor.",
                "fix": "Wire the sensor to a PLC input instead.",
                **custom,
            }
        ],
    }


def test_assembly_empty_then_roundtrip(client: TestClient) -> None:
    viewer = _auth(client, "viewer")
    eng = _auth(client, "engineer")
    empty = client.get("/api/studio/assembly/demo_microgrid_001", headers=viewer)
    assert empty.status_code == 200
    assert empty.json() == {"plant_id": "demo_microgrid_001", "revision": 0, "assembly": None}

    saved = client.put("/api/studio/assembly/demo_microgrid_001", json={"assembly": _assembly(), "base_revision": 0}, headers=eng)
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1

    loaded = client.get("/api/studio/assembly/demo_microgrid_001", headers=viewer).json()
    assert loaded["revision"] == 1
    assert loaded["assembly"]["connections"][0]["approved"] is False
    assert [a["asset_id"] for a in loaded["assembly"]["assets"]] == ["dc_power_supply_1", "dc_motor_12v_1"]
    # Optional contract fields are omitted rather than returned as null (clients validate strictly).
    assert "position_3d" not in loaded["assembly"]["assets"][0]
    assert "position_3d" not in saved.json()["assembly"]["assets"][0]


def test_assembly_conflict_and_overwrite(client: TestClient) -> None:
    eng = _auth(client, "engineer")
    url = "/api/studio/assembly/demo_microgrid_001"
    assert client.put(url, json={"assembly": _assembly(), "base_revision": 0}, headers=eng).status_code == 200
    stale = client.put(url, json={"assembly": _assembly(), "base_revision": 0}, headers=eng)
    assert stale.status_code == 409
    detail = stale.json()["detail"]
    assert detail["current_revision"] == 1 and detail["fix"]
    # Overwrite = retry against the revision the server reported.
    assert client.put(url, json={"assembly": _assembly(), "base_revision": 1}, headers=eng).json()["revision"] == 2
    # No base revision = unconditional write (explicit overwrite).
    assert client.put(url, json={"assembly": _assembly()}, headers=eng).json()["revision"] == 3


def test_assembly_requires_engineer(client: TestClient) -> None:
    url = "/api/studio/assembly/demo_microgrid_001"
    for role in ("viewer", "operator"):
        assert client.put(url, json={"assembly": _assembly()}, headers=_auth(client, role)).status_code == 403
    assert client.get(url).status_code == 401


def test_assembly_contract_shape_is_enforced(client: TestClient) -> None:
    eng = _auth(client, "engineer")
    url = "/api/studio/assembly/demo_microgrid_001"
    bad_kind = _assembly()
    bad_kind["connections"][0]["connection_kind"] = "teleport"
    assert client.put(url, json={"assembly": bad_kind}, headers=eng).status_code == 422
    extra = _assembly(unexpected=True)
    assert client.put(url, json={"assembly": extra}, headers=eng).status_code == 422
    missing = _assembly()
    del missing["assets"][0]["position_2d"]
    assert client.put(url, json={"assembly": missing}, headers=eng).status_code == 422


def test_assembly_referential_checks(client: TestClient) -> None:
    eng = _auth(client, "engineer")
    url = "/api/studio/assembly/demo_microgrid_001"
    dangling = _assembly()
    dangling["connections"][0]["to_asset_id"] = "ghost_1"
    resp = client.put(url, json={"assembly": dangling}, headers=eng)
    assert resp.status_code == 422
    assert "ghost_1" in resp.json()["detail"]["message"]
    assert resp.json()["detail"]["fix"]

    dup = _assembly()
    dup["assets"].append(dict(dup["assets"][0]))
    assert client.put(url, json={"assembly": dup}, headers=eng).status_code == 422

    inverted = _assembly()
    inverted["connections"][0]["lag_min_ms"] = 500
    assert client.put(url, json={"assembly": inverted}, headers=eng).status_code == 422

    other_plant = _assembly(plant_id="other_plant")
    mismatch = client.put(url, json={"assembly": other_plant}, headers=eng)
    assert mismatch.status_code == 422 and mismatch.json()["detail"]["code"] == "plant_mismatch"


def test_rules_default_then_roundtrip_and_audit(client: TestClient) -> None:
    viewer = _auth(client, "viewer")
    eng = _auth(client, "engineer")
    url = "/api/studio/connection-rules/demo_microgrid_001"
    assert client.get(url, headers=viewer).json() == {"plant_id": "demo_microgrid_001", "revision": 0, "rules": None}

    saved = client.put(url, json={"rules": _rules(), "base_revision": 0}, headers=eng)
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["revision"] == 1
    # Omitted built-ins are filled with defaults so clients always get a complete rule set.
    assert body["rules"]["builtins"]["direction"] == {"enabled": True, "severity": "deny"}
    assert body["rules"]["builtins"]["cycle_policy"]["per_medium"] == {"dc_power": "deny"}

    loaded = client.get(url, headers=viewer).json()
    assert loaded["revision"] == 1
    assert loaded["rules"]["custom"][0]["id"] == "no-sensor-to-motor"

    audit = client.get("/api/audit?action=studio.connection_rules.save", headers=_auth(client, "admin"))
    assert audit.status_code == 200, audit.text
    assert any(r["action"] == "studio.connection_rules.save" for r in audit.json()["records"])


def test_rules_conflict(client: TestClient) -> None:
    eng = _auth(client, "engineer")
    url = "/api/studio/connection-rules/demo_microgrid_001"
    assert client.put(url, json={"rules": _rules(), "base_revision": 0}, headers=eng).status_code == 200
    stale = client.put(url, json={"rules": _rules(), "base_revision": 0}, headers=eng)
    assert stale.status_code == 409
    assert stale.json()["detail"]["current_revision"] == 1


def test_rules_role_gate(client: TestClient) -> None:
    url = "/api/studio/connection-rules/demo_microgrid_001"
    assert client.get(url, headers=_auth(client, "viewer")).status_code == 200
    for role in ("viewer", "operator", "maintenance"):
        assert client.put(url, json={"rules": _rules()}, headers=_auth(client, role)).status_code == 403


def test_rules_schema_validation(client: TestClient) -> None:
    eng = _auth(client, "engineer")
    url = "/api/studio/connection-rules/demo_microgrid_001"
    # Unknown action.
    assert client.put(url, json={"rules": _rules(action="maybe")}, headers=eng).status_code == 422
    # Unknown medium in the matrix.
    bad_matrix = _rules()
    bad_matrix["builtins"]["medium_compatibility"]["matrix"] = {"plasma": {"dc_power": "allow"}}
    assert client.put(url, json={"rules": bad_matrix}, headers=eng).status_code == 422
    # Empty message is not an explanation.
    assert client.put(url, json={"rules": _rules(message="")}, headers=eng).status_code == 422
    # Bad id shape.
    assert client.put(url, json={"rules": _rules(id="has spaces")}, headers=eng).status_code == 422
    # Unknown field (typo) is rejected, not silently ignored.
    assert client.put(url, json={"rules": _rules(prio=3)}, headers=eng).status_code == 422
    # Fan limits must be positive.
    bad_fan = _rules()
    bad_fan["builtins"]["max_connections"]["default"] = {"fan_in": 0}
    assert client.put(url, json={"rules": bad_fan}, headers=eng).status_code == 422
    # Duplicate custom ids.
    dup = _rules()
    dup["custom"].append(dict(dup["custom"][0]))
    resp = client.put(url, json={"rules": dup}, headers=eng)
    assert resp.status_code == 422
    # Wrong schema version.
    wrong = _rules()
    wrong["schema_version"] = 2
    assert client.put(url, json={"rules": wrong}, headers=eng).status_code == 422


def test_documents_are_isolated_per_plant_and_type(client: TestClient) -> None:
    eng = _auth(client, "engineer")
    viewer = _auth(client, "viewer")
    client.put("/api/studio/connection-rules/plant_a", json={"rules": _rules()}, headers=eng)
    assert client.get("/api/studio/connection-rules/plant_b", headers=viewer).json()["revision"] == 0
    # Saving rules does not bump the layout or the assembly revision.
    assert client.get("/api/studio/layout/plant_a", headers=viewer).json()["revision"] == 0
    assert client.get("/api/studio/assembly/plant_a", headers=viewer).json()["revision"] == 0
