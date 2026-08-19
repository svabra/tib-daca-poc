from __future__ import annotations

import uuid
from datetime import UTC, datetime

import daca_catalog.main as catalog_main
from daca_catalog.models import DataProduct, PolicyRevision, ProductQualityAssessment
from daca_catalog.seed import ESTV_PRODUCT_ID
from sqlalchemy import func, select


def test_effective_access_is_actor_scoped_redacted_and_uses_zurich_date(
    client, session_factory, monkeypatch
):
    with session_factory() as session:
        product = session.get(DataProduct, ESTV_PRODUCT_ID)
        policy = session.scalar(
            select(PolicyRevision).where(
                PolicyRevision.data_product_id == ESTV_PRODUCT_ID,
                PolicyRevision.revision == product.active_policy_revision,
            )
        )
        policy.definition = {
            "effect": "allow",
            "subjects": {"userIds": [], "machineIds": [], "groupIds": ["private-group"]},
            "resources": {"productUrns": [product.urn], "owners": [product.owner]},
            "actions": ["data.read"],
            "protocols": ["http"],
            "grants": [
                {
                    "subject": {"type": "group", "id": "private-group"},
                    "actions": ["data.read"],
                    "protocols": ["http"],
                    "validFrom": "2026-08-13",
                    "validUntil": "2026-08-13",
                    "dataVariant": "original",
                    "groupSnapshot": {
                        "groupId": "private-group",
                        "membershipRevision": 99,
                        "memberIds": ["beat.stalder", "must-not-leak-member"],
                    },
                    "weeklyAvailability": {
                        "weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
                        "startTime": "07:00",
                        "endTime": "19:00",
                        "timeZone": "Europe/Zurich",
                    },
                }
            ],
            "privateNote": "must-not-leak-policy-detail",
        }
        policy.generated_rego = "must-not-leak-rego"
        policy.created_by = "must-not-leak-actor"
        policy_id = policy.id
        draft_id = uuid.uuid4()
        session.add(
            PolicyRevision(
                id=draft_id,
                data_product_id=ESTV_PRODUCT_ID,
                revision=2,
                status="draft",
                definition={
                    "effect": "allow",
                    "subjects": {"userIds": []},
                    "resources": {"productUrns": [product.urn], "owners": [product.owner]},
                    "actions": ["data.read"],
                    "protocols": ["http"],
                    "grants": [],
                    "privateNote": "must-not-leak-newer-draft",
                },
                generated_rego="must-not-leak-draft-rego",
                created_by="must-not-leak-draft-author",
            )
        )
        session.commit()

    # 22:30 UTC is already the next calendar day in Europe/Zurich (CEST).
    monkeypatch.setattr(
        catalog_main,
        "utc_now",
        lambda: datetime(2026, 8, 12, 22, 30, tzinfo=UTC),
    )
    url = f"/api/v1/data-products/{ESTV_PRODUCT_ID}/effective-access"
    granted = client.get(url, headers={"X-DaCa-User": "beat.stalder"})

    assert granted.status_code == 200
    assert granted.json() == {
        "granted": True,
        "grants": [
            {
                "protocols": ["http"],
                "validFrom": "2026-08-13",
                "validUntil": "2026-08-13",
                "weeklyAvailability": {
                    "weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
                    "startTime": "07:00",
                    "endTime": "19:00",
                    "timeZone": "Europe/Zurich",
                },
            }
        ],
    }
    serialized = granted.text
    for forbidden in (
        "beat.stalder",
        "private-group",
        "must-not-leak-member",
        "must-not-leak-policy-detail",
        "must-not-leak-rego",
        "must-not-leak-actor",
        "must-not-leak-newer-draft",
        "must-not-leak-draft-rego",
        "must-not-leak-draft-author",
        str(policy_id),
        str(draft_id),
    ):
        assert forbidden not in serialized

    not_granted = client.get(url, headers={"X-DaCa-User": "kassandra.valdata"})
    assert not_granted.status_code == 200
    assert not_granted.json() == {"granted": False, "grants": []}
    assert client.get(url, headers={"X-DaCa-User": ""}).status_code == 401

    with session_factory() as session:
        policy = session.get(PolicyRevision, policy_id)
        definition = dict(policy.definition)
        grants = [dict(grant) for grant in definition["grants"]]
        grants[0]["actions"] = ["data.write"]
        definition["grants"] = grants
        policy.definition = definition
        session.commit()
    malformed = client.get(url, headers={"X-DaCa-User": "beat.stalder"})
    assert malformed.status_code == 503
    assert malformed.json()["detail"] == "Effective access status is unavailable"

    with session_factory() as session:
        product = session.get(DataProduct, ESTV_PRODUCT_ID)
        product.active_policy_revision = 999
        session.commit()
    missing_active_revision = client.get(url, headers={"X-DaCa-User": "beat.stalder"})
    assert missing_active_revision.status_code == 503
    assert missing_active_revision.json()["detail"] == "Effective access status is unavailable"

    with session_factory() as session:
        product = session.get(DataProduct, ESTV_PRODUCT_ID)
        product.active_policy_revision = None
        session.commit()
    no_active_policy = client.get(url, headers={"X-DaCa-User": "beat.stalder"})
    assert no_active_policy.status_code == 200
    assert no_active_policy.json() == {"granted": False, "grants": []}

    with session_factory() as session:
        product = session.get(DataProduct, ESTV_PRODUCT_ID)
        product.discoverable = False
        session.commit()
    assert client.get(url, headers={"X-DaCa-User": "beat.stalder"}).status_code == 404

    response_schema = client.get("/openapi.json").json()["paths"][
        "/api/v1/data-products/{product_id}/effective-access"
    ]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema["$ref"].endswith("/ProductEffectiveAccessResponse")


def test_quality_workspace_get_is_typed_and_does_not_persist_recalculation(
    client, session_factory
):
    with session_factory() as session:
        before_count = session.scalar(select(func.count()).select_from(ProductQualityAssessment))
        before = session.get(ProductQualityAssessment, ESTV_PRODUCT_ID)
        before_updated_at = before.updated_at if before is not None else None

    first = client.get(f"/api/v1/data-products/{ESTV_PRODUCT_ID}/quality")
    second = client.get(f"/api/v1/data-products/{ESTV_PRODUCT_ID}/quality")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
    assert set(first.json()) == {"quality", "fields", "graph", "graphStatus", "mappings"}
    assert first.json()["quality"]["dataProductId"] == str(ESTV_PRODUCT_ID)
    assert all(
        set(field)
        == {"id", "name", "dataType", "nullable", "keyField", "businessDescription"}
        for field in first.json()["fields"]
    )

    with session_factory() as session:
        after_count = session.scalar(select(func.count()).select_from(ProductQualityAssessment))
        after = session.get(ProductQualityAssessment, ESTV_PRODUCT_ID)
        after_updated_at = after.updated_at if after is not None else None
    assert after_count == before_count
    assert after_updated_at == before_updated_at

    response_schema = client.get("/openapi.json").json()["paths"][
        "/api/v1/data-products/{product_id}/quality"
    ]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert response_schema["$ref"].endswith("/ProductQualityWorkspaceResponse")


def test_endpoint_contract_rejects_header_or_secret_material_as_media_type(client):
    product_url = f"/api/v1/data-products/{ESTV_PRODUCT_ID}"
    revision = client.get(product_url).json()["revision"]
    response = client.post(
        f"{product_url}/endpoints",
        headers={"If-Match": f'"{revision}"'},
        json={
            "name": "Unsafe media type",
            "protocol": "http-rest",
            "connection": {
                "baseUrl": "https://example.admin.ch",
                "path": "/v1/data",
                "method": "GET",
                "mediaType": "Authorization: Bearer top-secret-token",
            },
        },
    )

    assert response.status_code == 422
    assert "top-secret-token" not in response.text
