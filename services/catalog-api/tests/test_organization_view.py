from copy import deepcopy

from daca_catalog.models import AuditEvent, DemoUser
from sqlalchemy import select

PATH = "/api/v1/organization-network/view"


def headers(actor="kassandra.valdata"):
    return {"X-DaCa-User": actor}


def layout():
    return {"revision": 0, "configuration": {"schemaVersion": 1, "scopes": {
        "overview": {"offices": {"efd": {"x": 230, "y": 300}}, "satellites": {}},
        "efd": {"offices": {"efd-estv": {"x": 110, "y": 90}}, "satellites": {"vbs": {"x": 800, "y": 90}}},
    }}}


def test_private_layout_revisions_isolation_reset_preferences_and_audit(client, session_factory):
    first = client.get(PATH, headers=headers())
    assert first.status_code == 200 and first.headers["cache-control"] == "no-store"
    assert first.json() == {"revision": 0, "configuration": {"schemaVersion": 1, "scopes": {}}}
    assert client.put("/api/v1/me/preferences/theme", headers=headers(), json={"value": "dark"}).status_code == 200
    saved = client.put(PATH, headers=headers(), json=layout())
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1 and saved.json()["configuration"] == layout()["configuration"]
    assert client.put(PATH, headers=headers(), json=layout()).status_code == 409
    assert client.get(PATH, headers=headers()).json() == saved.json()
    assert client.get(PATH, headers=headers("beat.stalder")).json()["configuration"]["scopes"] == {}
    assert client.get("/api/v1/me/preferences/theme", headers=headers()).json() == {"value": "dark"}
    assert client.put("/api/v1/me/preferences/language", headers=headers(), json={"value": "fr"}).status_code == 200
    assert client.get(PATH, headers=headers()).json() == saved.json()
    reset = saved.json()
    del reset["configuration"]["scopes"]["efd"]
    result = client.put(PATH, headers=headers(), json=reset)
    assert result.status_code == 200 and result.json()["revision"] == 2
    assert set(result.json()["configuration"]["scopes"]) == {"overview"}
    with session_factory() as session:
        audit = list(session.scalars(select(AuditEvent).where(AuditEvent.resource_type == "organization-network-view").order_by(AuditEvent.revision)))
        assert [row.revision for row in audit] == [1, 2]
        assert all(row.actor == "kassandra.valdata" and set(row.details) == {"scopeCount"} for row in audit)


def test_consumer_can_arrange_only_their_own_view_and_invalid_payloads_are_rejected(client, session_factory):
    with session_factory() as session:
        session.get(DemoUser, "beat.stalder").roles = ["data_consumer"]
        session.commit()
    assert client.put(PATH, headers=headers("beat.stalder"), json=layout()).status_code == 200
    assert client.get(PATH, headers=headers()).json()["revision"] == 0
    assert client.get(PATH, headers=headers("unknown-user")).status_code == 401
    invalid = []
    value = layout(); value["actor"] = "beat.stalder"; invalid.append(value)
    for x in (-1, "NaN", 100001):
        value = layout(); value["configuration"]["scopes"]["overview"]["offices"]["efd"]["x"] = x; invalid.append(value)
    value = layout(); value["configuration"]["schemaVersion"] = 2; invalid.append(value)
    value = layout(); value["configuration"]["scopes"]["__proto__"] = {}; invalid.append(value)
    value = layout(); value["configuration"]["scopes"]["overview"]["offices"] = {f"node-{index}": {"x": 100, "y": 100} for index in range(2001)}; invalid.append(value)
    for value in invalid:
        response = client.put(PATH, headers=headers(), json=deepcopy(value))
        assert response.status_code == 422, response.text
    assert client.get(PATH, headers=headers()).json()["revision"] == 0


def test_title_side_strip_anchors_round_trip_without_rebasing_existing_coordinates(client):
    value = layout()
    value["configuration"]["scopes"]["efd"]["offices"]["efd-bit"] = {"x": 70, "y": -80}
    saved = client.put(PATH, headers=headers(), json=value)
    assert saved.status_code == 200, saved.text
    assert saved.json()["configuration"] == value["configuration"]
    assert client.get(PATH, headers=headers()).json() == saved.json()

    for scope, kind, identity, y in (
        ("efd", "offices", "efd-bit", -121),
        ("overview", "offices", "efd", -1),
        ("efd", "satellites", "vbs", -1),
    ):
        invalid = deepcopy(saved.json())
        invalid["configuration"]["scopes"][scope][kind][identity]["y"] = y
        assert client.put(PATH, headers=headers(), json=invalid).status_code == 422
    assert client.get(PATH, headers=headers()).json() == saved.json()


def test_domain_anchors_share_the_existing_private_frame_and_limits(client):
    value = layout()
    domain = "domain:6ca86be5-c437-464b-9d64-cd777abcb780"
    value["configuration"]["scopes"]["efd"]["offices"][domain] = {"x": 100, "y": -40}
    value["configuration"]["scopes"]["overview"]["offices"][domain] = {"x": 400, "y": 240}
    saved = client.put(PATH, headers=headers(), json=value)
    assert saved.status_code == 200, saved.text
    assert saved.json()["configuration"] == value["configuration"]
    assert client.get(PATH, headers=headers()).json() == saved.json()
    assert client.get(PATH, headers=headers("beat.stalder")).json()["configuration"]["scopes"] == {}
    invalid = deepcopy(saved.json())
    invalid["configuration"]["scopes"]["overview"]["offices"][domain]["y"] = -1
    assert client.put(PATH, headers=headers(), json=invalid).status_code == 422
    invalid["configuration"]["scopes"]["overview"]["offices"][domain]["y"] = 240
    invalid["configuration"]["scopes"]["efd"]["offices"][domain]["y"] = -121
    assert client.put(PATH, headers=headers(), json=invalid).status_code == 422
