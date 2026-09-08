from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from daca_catalog.models import (
    IdentityDirectoryEntry,
    IdentityGroup,
    MetadataDeliveryOutbox,
    PolicyRevision,
)
from daca_catalog.policy import ProjectionResult, project_to_postgresql
from daca_catalog.seed import ESTV_PRODUCT_ID
from sqlalchemy import select

OWNER_HEADERS = {"X-DaCa-User": "kassandra.valdata"}


def test_federal_organizations_are_ordered_and_bfs_is_searchable(client):
    response = client.get("/api/v1/identity-directory/organizations", headers=OWNER_HEADERS)
    assert response.status_code == 200
    organizations = response.json()
    labels = [item["label"] for item in organizations]
    assert labels[:2] == ["BR", "BK"]
    assert "EDI - BFS" in labels
    assert "EFD - BIT" in labels
    assert labels.index("EDI - BFS") < labels.index("EFD - BIT")

    bfs = client.get(
        "/api/v1/identity-directory/people",
        headers=OWNER_HEADERS,
        params={"organization_id": "edi-bfs"},
    )
    assert bfs.status_code == 200
    assert [item["id"] for item in bfs.json()] == ["sophie.brunner"]
    assert bfs.json()[0]["organization"] == "BFS"


def test_directory_search_covers_all_sources_and_excludes_inactive(client, session_factory):
    expected = {
        "federal": "kassandra.valdata",
        "cantonal": "noemie.rochat",
        "municipal": "ursula.mueller",
        "federal_related": "claudia.frei",
    }
    for source, identity_id in expected.items():
        response = client.get(
            "/api/v1/identity-directory/people",
            headers=OWNER_HEADERS,
            params={"source": source},
        )
        assert response.status_code == 200
        assert identity_id in {item["id"] for item in response.json()}

    response = client.get(
        "/api/v1/identity-directory/people",
        headers=OWNER_HEADERS,
        params={"q": "post.ch"},
    )
    assert [item["id"] for item in response.json()] == ["martin.baumann"]
    with session_factory() as session:
        session.get(IdentityDirectoryEntry, "martin.baumann").active = False
        session.commit()
    assert (
        client.get(
            "/api/v1/identity-directory/people",
            headers=OWNER_HEADERS,
            params={"q": "martin.baumann"},
        ).json()
        == []
    )


def test_group_search_returns_member_preview(client):
    groups = client.get(
        "/api/v1/identity-directory/groups",
        headers=OWNER_HEADERS,
        params={"q": "Neuchâtel"},
    )
    assert groups.status_code == 200
    assert groups.json()[0]["memberCount"] == 2
    detail = client.get("/api/v1/identity-directory/groups/kanton-neuchatel", headers=OWNER_HEADERS)
    assert {member["id"] for member in detail.json()["members"]} == {
        "noemie.rochat",
        "lucien.morel",
    }

    treasury = client.get(
        "/api/v1/identity-directory/groups/efd-efv-bundestresorerie",
        headers=OWNER_HEADERS,
    )
    assert treasury.status_code == 200
    assert treasury.json()["organizationId"] == "efd-efv"
    assert treasury.json()["userManaged"] is False
    assert [member["id"] for member in treasury.json()["members"]] == ["daniel.aebischer"]
    filtered = client.get(
        "/api/v1/identity-directory/groups",
        headers=OWNER_HEADERS,
        params={"organization_id": "efd-efv"},
    )
    assert [group["id"] for group in filtered.json()] == ["efd-efv-bundestresorerie"]


def test_owner_can_create_mixed_custom_group_and_other_users_cannot_read_it(client):
    created = client.post(
        "/api/v1/identity-directory/groups",
        headers=OWNER_HEADERS,
        json={
            "label": "BFS Präsentation",
            "description": "Bund, Kanton und Gemeinde für den PoC",
            "memberIds": ["sophie.brunner", "noemie.rochat", "ursula.mueller"],
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["userManaged"] is True
    assert {member["source"] for member in body["members"]} == {
        "federal",
        "cantonal",
        "municipal",
    }
    group_id = body["id"]
    own_groups = client.get(
        "/api/v1/identity-directory/groups",
        headers=OWNER_HEADERS,
        params={"q": "BFS Präsentation"},
    )
    assert [item["id"] for item in own_groups.json()] == [group_id]
    assert (
        client.get(
            f"/api/v1/identity-directory/groups/{group_id}",
            headers={"X-DaCa-User": "beat.stalder"},
        ).status_code
        == 404
    )


def access_grant(subject_type: str, subject_id: str, *, i14y: bool = False) -> dict:
    return {
        "subject": {"type": subject_type, "id": subject_id},
        "actions": ["data.read"],
        "protocols": ["http", "postgresql"],
        "validFrom": "2026-08-12",
        "validUntil": "2026-12-31",
        "dataVariant": "original",
        "metadataChannels": {"kobyMcp": True, "i14y": i14y},
    }


def test_access_setting_is_owner_isolated_and_unknown_identity_is_rejected(client):
    url = f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-settings"
    forbidden = client.put(
        url,
        headers={"X-DaCa-User": "beat.stalder", "If-Match": '"1"'},
        json={"grant": access_grant("person", "noemie.rochat")},
    )
    assert forbidden.status_code == 403
    unknown = client.put(
        url,
        headers={**OWNER_HEADERS, "If-Match": '"1"'},
        json={"grant": access_grant("person", "not.in.directory")},
    )
    assert unknown.status_code == 422


def test_group_snapshot_and_postgresql_projection_are_server_generated(
    client, session_factory, monkeypatch
):
    captured: dict = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "productId": str(ESTV_PRODUCT_ID),
                "revision": 42,
                "status": "deployed",
            }

    monkeypatch.setattr(
        "daca_catalog.policy.httpx.put",
        lambda url, json, headers, timeout: captured.update(payload=json) or Response(),
    )
    response = client.put(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-settings",
        headers={**OWNER_HEADERS, "If-Match": '"1"'},
        json={"grant": access_grant("group", "kanton-st-gallen")},
    )
    assert response.status_code == 201
    grant = next(
        item
        for item in response.json()["definition"]["grants"]
        if item["subject"]["type"] == "group"
    )
    assert grant["groupSnapshot"] == {
        "groupId": "kanton-st-gallen",
        "membershipRevision": 1,
        "memberIds": ["beat.stalder", "sarah.brunner"],
    }
    with session_factory():
        result = project_to_postgresql(
            type(
                "S",
                (),
                {
                    "sample_policy_projection_url": "http://sample",
                    "sample_policy_projection_token": None,
                    "projection_timeout_seconds": 1,
                },
            )(),
            ESTV_PRODUCT_ID,
            42,
            response.json()["definition"],
        )
    assert result.state == "deployed"
    assert {"beat.stalder", "sarah.brunner"}.issubset(
        {item["subjectId"] for item in captured["payload"]["entitlements"]}
    )
    group_rows = [
        item
        for item in captured["payload"]["entitlements"]
        if item["subjectId"] in {"beat.stalder", "sarah.brunner"}
    ]
    assert {item["subjectType"] for item in group_rows} == {"person"}


def test_upsert_preserves_active_grants_and_requires_current_revision(client):
    url = f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-settings"
    stale = client.put(
        url,
        headers={**OWNER_HEADERS, "If-Match": '"0"'},
        json={"grant": access_grant("machine", "svc-new-consumer")},
    )
    assert stale.status_code == 412
    created = client.put(
        url,
        headers={**OWNER_HEADERS, "If-Match": '"1"'},
        json={"grant": access_grant("machine", "svc-new-consumer")},
    )
    assert created.status_code == 201
    subjects = {grant["subject"]["id"] for grant in created.json()["definition"]["grants"]}
    assert subjects == {"kanton-st-gallen", "svc-new-consumer"}


def test_i14y_outbox_waits_for_both_targets_and_deduplicates(client, session_factory, monkeypatch):
    monkeypatch.setattr(
        "daca_catalog.main.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )
    draft = client.put(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-settings",
        headers={**OWNER_HEADERS, "If-Match": '"1"'},
        json={"grant": access_grant("person", "beat.stalder", i14y=True)},
    ).json()
    published = client.post(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/policies/{draft['id']}/publish",
        headers={**OWNER_HEADERS, "If-Match": f'"{draft["revision"]}"'},
    ).json()
    with session_factory() as session:
        assert session.scalar(select(MetadataDeliveryOutbox)) is None
        session.get(PolicyRevision, uuid.UUID(published["id"]))
    acknowledge = client.put(
        "/internal/v1/policy-deployments/acknowledge",
        headers={"Authorization": "Bearer test-internal-token"},
        json={
            "policyRevisionId": published["id"],
            "target": "opa",
            "observedRevision": published["revision"],
            "state": "deployed",
            "error": None,
        },
    )
    assert acknowledge.status_code == 200
    with session_factory() as session:
        rows = list(session.scalars(select(MetadataDeliveryOutbox)))
        assert len(rows) == 1
        assert rows[0].status == "simulated_delivered"
        assert rows[0].payload["@type"][0] == "dcat:Dataset"
        assert rows[0].valid_from == date(2026, 8, 12)

    client.put(
        "/internal/v1/policy-deployments/acknowledge",
        headers={"Authorization": "Bearer test-internal-token"},
        json={
            "policyRevisionId": published["id"],
            "target": "opa",
            "observedRevision": published["revision"],
            "state": "deployed",
            "error": None,
        },
    )
    with session_factory() as session:
        assert len(list(session.scalars(select(MetadataDeliveryOutbox)))) == 1


def test_future_i14y_consent_is_scheduled_not_delivered(client, session_factory, monkeypatch):
    monkeypatch.setattr(
        "daca_catalog.main.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )
    future_grant = access_grant("person", "noemie.rochat", i14y=True)
    future_grant["validFrom"] = (datetime.now(UTC).date() + timedelta(days=30)).isoformat()
    draft = client.put(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-settings",
        headers={**OWNER_HEADERS, "If-Match": '"1"'},
        json={"grant": future_grant},
    ).json()
    published = client.post(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/policies/{draft['id']}/publish",
        headers={**OWNER_HEADERS, "If-Match": f'"{draft["revision"]}"'},
    ).json()
    client.put(
        "/internal/v1/policy-deployments/acknowledge",
        headers={"Authorization": "Bearer test-internal-token"},
        json={
            "policyRevisionId": published["id"],
            "target": "opa",
            "observedRevision": published["revision"],
            "state": "deployed",
            "error": None,
        },
    )
    with session_factory() as session:
        outbox = session.scalar(select(MetadataDeliveryOutbox))
        assert outbox.status == "scheduled"
        assert outbox.delivered_at is None


def test_group_revision_drift_creates_owner_task_without_expanding_snapshot(
    client, session_factory, monkeypatch
):
    monkeypatch.setattr(
        "daca_catalog.main.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )
    draft = client.put(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-settings",
        headers={**OWNER_HEADERS, "If-Match": '"1"'},
        json={"grant": access_grant("group", "kanton-st-gallen")},
    ).json()
    published = client.post(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/policies/{draft['id']}/publish",
        headers={**OWNER_HEADERS, "If-Match": f'"{draft["revision"]}"'},
    ).json()
    client.put(
        "/internal/v1/policy-deployments/acknowledge",
        headers={"Authorization": "Bearer test-internal-token"},
        json={
            "policyRevisionId": published["id"],
            "target": "opa",
            "observedRevision": published["revision"],
            "state": "deployed",
            "error": None,
        },
    )
    with session_factory() as session:
        group = session.get(IdentityGroup, "kanton-st-gallen")
        group.membership_revision = 2
        session.commit()
    tasks = client.get("/api/v1/tasks/mine", headers=OWNER_HEADERS).json()
    assert any(task["taskType"] == "group_membership_changed" for task in tasks)
    latest = client.get(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/policies/latest",
        headers=OWNER_HEADERS,
    ).json()
    assert latest["definition"]["grants"][-1]["groupSnapshot"]["membershipRevision"] == 1
