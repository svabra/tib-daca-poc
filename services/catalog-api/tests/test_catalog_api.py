from __future__ import annotations

import json
import re
import uuid

from daca_catalog.seed import ESTV_PRODUCT_ID

MWST_PRODUCT_ID = "13333333-3333-4333-8333-333333333333"


def product_url() -> str:
    return f"/api/v1/data-products/{ESTV_PRODUCT_ID}"


def test_seeded_product_and_health_are_available(client):
    live = client.get("/health/live")
    assert live.status_code == 200
    assert live.json()["service"] == "catalog-api"

    ready = client.get("/health/ready")
    assert ready.status_code == 200

    page = client.get("/api/v1/data-products")
    assert page.status_code == 200
    assert len(page.json()["items"]) == 7
    assert page.json()["items"][0]["title"] == "ESTV-Steuerstatistik nach Kanton"
    assert page.json()["items"][0]["metadata"]["catalogUsage"]["responsibleUserIds"] == ["kassandra.valdata"]
    for item in page.json()["items"]:
        assert 0 <= item["quality"]["score"] <= 6
        assert item["quality"]["medal"] == (
            "platinum"
            if item["quality"]["score"] == 6
            else "gold"
            if item["quality"]["score"] == 5
            else "silver"
            if item["quality"]["score"] == 4
            else "bronze"
        )
    assert "nextCursor" in page.json()

    response = client.get(product_url(), headers={"X-Request-ID": "test-request"})
    assert response.status_code == 200
    assert response.headers["etag"] == '"1"'
    assert response.headers["x-request-id"] == "test-request"
    body = response.json()
    assert body["originCatalog"] == "urn:daca:catalog:bit-poc"
    assert body["activePolicyRevision"] == 1
    assert body["metadata"]["containsPersonalData"] is False
    assert "extra_metadata" not in body


def test_seeded_estv_portfolio_covers_user_machine_and_owner_relationships(client):
    products = client.get("/api/v1/data-products").json()["items"]
    usages = [product["metadata"]["catalogUsage"] for product in products]

    assert sum("kassandra.valdata" in usage["consumerUserIds"] for usage in usages) == 3
    assert sum(bool(usage["consumerMachineIds"]) for usage in usages) == 5
    assert sum("kassandra.valdata" in usage["responsibleUserIds"] for usage in usages) == 3
    assert sum("kassandra.valdata" in usage["sharedByUserIds"] for usage in usages) == 2
    assert sum("kassandra.valdata" in usage["requestedByUserIds"] for usage in usages) == 2
    assert sum("kassandra.valdata" in usage["sharedWithUserIds"] for usage in usages) == 3
    assert any("Schweizer Gemeinden" in product["metadata"]["connectedAuthorities"] for product in products)

    consumed = [
        product
        for product in products
        if "kassandra.valdata" in product["metadata"]["catalogUsage"]["sharedByUserIds"]
        or "kassandra.valdata" in product["metadata"]["catalogUsage"]["requestedByUserIds"]
        or "kassandra.valdata" in product["metadata"]["catalogUsage"]["sharedWithUserIds"]
    ]
    assert len(consumed) == 6
    assert all(product["metadata"]["dataOwner"]["avatarUrl"].endswith(".webp") for product in consumed)
    assert {product["metadata"]["dataOwner"]["name"] for product in consumed} == {
        "Ariane Keller",
        "Daniel Aebischer",
        "Kassandra Valdata",
        "Noémie Rochat",
    }
    noemie_products = [
        product for product in consumed if product["metadata"]["dataOwner"]["name"] == "Noémie Rochat"
    ]
    assert len(noemie_products) == 2
    assert all(product["metadata"]["dataOwner"]["organization"] == "Kanton Neuchâtel" for product in noemie_products)
    assert all(product["metadata"]["dataOwner"]["phone"] == "+41 58 000 00 42" for product in noemie_products)
    assert {product["metadata"]["accessRequest"]["status"] for product in noemie_products} == {
        "granted_modified",
        "legal_review",
    }


def test_metadata_updates_are_optimistic_and_audited(client):
    missing = client.patch(product_url(), json={"description": "Changed"})
    assert missing.status_code == 428
    assert missing.headers["content-type"].startswith("application/problem+json")
    assert missing.json()["requestId"]

    updated = client.patch(
        product_url(),
        headers={"If-Match": '"1"', "X-DaCa-User": "estv-editor"},
        json={"description": "Updated aggregate description", "updateFrequency": "quarterly"},
    )
    assert updated.status_code == 200
    assert updated.headers["etag"] == '"2"'
    assert updated.json()["revision"] == 2
    assert updated.json()["updateFrequency"] == "quarterly"

    stale = client.patch(product_url(), headers={"If-Match": '"1"'}, json={"title": "Stale"})
    assert stale.status_code == 412

    audit = client.get(
        f"{product_url()}/audit-events",
        headers={"X-DaCa-User": "kassandra.valdata"},
    )
    events = audit.json()
    assert events[0]["action"] == "metadata-updated"
    assert events[0]["actor"] == "estv-editor"
    assert events[0]["details"]["changedFields"] == ["description", "updateFrequency"]


def test_product_activity_is_safe_and_raw_audit_is_privileged(client, session_factory):
    from daca_catalog.models import AuditEvent, utc_now

    leaked_uuid = uuid.uuid4()
    with session_factory() as session:
        session.add_all(
            [
                AuditEvent(
                    id=uuid.uuid4(),
                    resource_type="data-product",
                    resource_id=str(ESTV_PRODUCT_ID),
                    action="metadata-publication-received",
                    actor="daca-bootstrap",
                    revision=1,
                    details={"sourceProductId": "private-source-id"},
                    occurred_at=utc_now(),
                ),
                AuditEvent(
                    id=uuid.uuid4(),
                    resource_type="data-product",
                    resource_id=str(ESTV_PRODUCT_ID),
                    action="future-unclassified-action",
                    actor="private.actor@example.test",
                    revision=1,
                    details={
                        "token": "top-secret-token",
                        "subjectId": "svc-private-subject",
                        "comment": "private review comment",
                        "correlationId": str(leaked_uuid),
                    },
                    occurred_at=utc_now(),
                ),
            ]
        )
        session.commit()

    summary = client.get(
        f"{product_url()}/activity",
        headers={"X-DaCa-User": ""},
    )
    assert summary.status_code == 200
    assert summary.json()["detailLevel"] == "summary"
    assert all(not item["technicalEvidence"] for item in summary.json()["items"])
    assert "technical-catalog-event" in {
        item["eventType"] for item in summary.json()["items"]
    }
    source_event = next(
        item
        for item in summary.json()["items"]
        if item["eventType"] == "metadata-publication-received"
    )
    assert source_event["title"] == "Datenprodukt aus Quellsystem übernommen"
    assert source_event["actor"] == {"displayName": "Quellsystem", "kind": "role"}

    privileged = client.get(
        f"{product_url()}/activity",
        headers={"X-DaCa-User": "kassandra.valdata"},
    )
    assert privileged.status_code == 200
    assert privileged.json()["detailLevel"] == "privileged"
    serialized_activity = json.dumps(privileged.json())
    assert "top-secret-token" not in serialized_activity
    assert "svc-private-subject" not in serialized_activity
    assert "private review comment" not in serialized_activity
    assert "private-source-id" not in serialized_activity
    assert "private.actor@example.test" not in serialized_activity
    assert str(leaked_uuid) not in serialized_activity
    assert re.search(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        serialized_activity,
        re.IGNORECASE,
    ) is None

    assert client.get(
        f"{product_url()}/audit-events",
        headers={"X-DaCa-User": ""},
    ).status_code == 403
    assert client.get(
        f"{product_url()}/audit-events",
        headers={"X-DaCa-User": "beat.stalder"},
    ).status_code == 403
    raw = client.get(
        f"{product_url()}/audit-events",
        headers={"X-DaCa-User": "kassandra.valdata"},
    )
    assert raw.status_code == 200
    assert raw.json()[0]["details"]["token"] == "top-secret-token"


def test_product_activity_order_is_stable_when_timestamps_match(client, session_factory):
    from daca_catalog.models import AuditEvent, utc_now

    occurred_at = utc_now()
    with session_factory() as session:
        session.add_all(
            [
                AuditEvent(
                    id=uuid.UUID("00000000-0000-4000-8000-000000000001"),
                    resource_type="data-product",
                    resource_id=str(ESTV_PRODUCT_ID),
                    action="endpoint-created",
                    actor="kassandra.valdata",
                    revision=2,
                    details={},
                    occurred_at=occurred_at,
                ),
                AuditEvent(
                    id=uuid.UUID("ffffffff-ffff-4fff-8fff-ffffffffffff"),
                    resource_type="data-product",
                    resource_id=str(ESTV_PRODUCT_ID),
                    action="metadata-updated",
                    actor="kassandra.valdata",
                    revision=3,
                    details={"changedFields": ["description"]},
                    occurred_at=occurred_at,
                ),
            ]
        )
        session.commit()

    activity = client.get(
        f"{product_url()}/activity",
        headers={"X-DaCa-User": "kassandra.valdata"},
    ).json()
    matching = [
        item["eventType"]
        for item in activity["items"]
        if item["eventType"] in {"metadata-updated", "endpoint-created"}
    ]
    assert matching == ["metadata-updated", "endpoint-created"]


def test_mutations_require_demo_identity(client):
    response = client.patch(
        product_url(),
        headers={"If-Match": '"1"', "X-DaCa-User": ""},
        json={"description": "Anonymous edit"},
    )
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")


def test_empty_or_null_metadata_patch_is_rejected(client):
    empty = client.patch(product_url(), headers={"If-Match": '"1"'}, json={})
    assert empty.status_code == 422
    null_title = client.patch(product_url(), headers={"If-Match": '"1"'}, json={"title": None})
    assert null_title.status_code == 422


def test_access_request_is_persisted_for_the_authenticated_demo_user(client, session_factory):
    payload = {
        "consumerType": "machine",
        "machineId": "svc-estv-tax-analysis",
        "purpose": "Automatisierte Plausibilisierung der aggregierten Bundessteuerindikatoren.",
        "legalBasis": "Gesetzlicher Auftrag der ESTV zur Qualitätssicherung",
        "requestedProtocol": "http",
        "requestedVariant": "modified",
        "validFrom": "2026-09-01",
        "validUntil": "2027-08-31",
        "contactEmail": "kassandra.valdata@estv.admin.ch",
        "notes": "Nur aggregierte Daten; keine Personendaten erforderlich.",
        "conditionsAccepted": True,
    }
    headers = {"X-DaCa-User": "kassandra.valdata"}

    created = client.post(
        f"/api/v1/data-products/{MWST_PRODUCT_ID}/access-requests",
        headers=headers,
        json=payload,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["requestNumber"].startswith("ZA-2026-")
    assert body["requesterId"] == "kassandra.valdata"
    assert body["requesterName"] == "Kassandra Valdata"
    assert body["requesterOrganization"] == "Eidgenössische Steuerverwaltung ESTV"
    assert body["status"] == "submitted"
    assert body["machineId"] == "svc-estv-tax-analysis"
    assert "conditionsAccepted" not in body

    listed = client.get(
        f"/api/v1/data-products/{MWST_PRODUCT_ID}/access-requests/mine",
        headers=headers,
    )
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [body["id"]]

    all_mine = client.get("/api/v1/access-requests/mine", headers=headers)
    assert all_mine.status_code == 200
    assert [item["requestNumber"] for item in all_mine.json()] == [body["requestNumber"]]

    from daca_catalog.models import AccessRequest

    with session_factory() as session:
        persisted = session.get(AccessRequest, uuid.UUID(body["id"]))
        assert persisted is not None
        assert persisted.purpose == payload["purpose"]
        assert persisted.requested_protocol == "http"


def test_access_request_validation_and_owner_guard(client):
    base = {
        "consumerType": "machine",
        "purpose": "Fachlich begründete Auswertung aggregierter Steuerkennzahlen.",
        "legalBasis": "Gesetzlicher Auftrag der ESTV",
        "requestedProtocol": "both",
        "requestedVariant": "either",
        "validFrom": "2026-09-01",
        "validUntil": "2027-08-31",
        "contactEmail": "kassandra.valdata@estv.admin.ch",
        "conditionsAccepted": True,
    }
    headers = {"X-DaCa-User": "kassandra.valdata"}

    missing_machine = client.post(
        f"/api/v1/data-products/{MWST_PRODUCT_ID}/access-requests",
        headers=headers,
        json=base,
    )
    assert missing_machine.status_code == 422

    own_product = client.post(
        product_url() + "/access-requests",
        headers=headers,
        json={**base, "consumerType": "person"},
    )
    assert own_product.status_code == 409


def test_owner_inbox_contains_the_seeded_beat_stalder_request(client):
    inbox = client.get(
        "/api/v1/access-requests/inbox",
        headers={"X-DaCa-User": "kassandra.valdata"},
    )
    assert inbox.status_code == 200
    assert len(inbox.json()) == 1
    request = inbox.json()[0]
    assert request["requestNumber"] == "ZA-2026-ESTV-0001"
    assert request["requesterName"] == "Beat Stalder"
    assert request["requesterOrganization"] == "Kanton St. Gallen"
    assert request["consumerType"] == "person"
    assert request["requesterId"] == "beat.stalder"
    assert request["status"] == "submitted"

    outsider = client.get(
        "/api/v1/access-requests/inbox",
        headers={"X-DaCa-User": "daca-test-editor"},
    )
    assert outsider.status_code == 200
    assert outsider.json() == []


def test_owned_access_consumers_are_active_deduplicated_and_owner_scoped(client):
    response = client.get(
        "/api/v1/access-consumers/owned",
        headers={"X-DaCa-User": "kassandra.valdata"},
    )
    assert response.status_code == 200
    consumers = response.json()
    estv_consumers = [item for item in consumers if item["dataProductId"] == str(ESTV_PRODUCT_ID)]

    assert len(estv_consumers) == 5
    assert sum(item["consumerType"] == "person" for item in estv_consumers) == 3
    assert sum(item["consumerType"] == "machine" for item in estv_consumers) == 2
    assert {item["identityId"] for item in estv_consumers} == {
        "lea.meier",
        "marco.galli",
        "nadine.favre",
        "svc-estv-cantonal-tax-dashboard",
        "svc-zrh-tax-analysis",
    }
    lea = next(item for item in estv_consumers if item["identityId"] == "lea.meier")
    assert len(lea["grants"]) == 2
    assert {grant["protocol"] for grant in lea["grants"]} == {"http", "postgresql"}
    assert all("contactEmail" not in item for item in consumers)

    refund_consumers = [
        item for item in consumers if item["dataProductId"] == "16666666-6666-4666-8666-666666666666"
    ]
    assert len(refund_consumers) == 1
    assert refund_consumers[0]["identityId"] == "svc-estv-refund-monitoring"

    outsider = client.get(
        "/api/v1/access-consumers/owned",
        headers={"X-DaCa-User": "daca-test-editor"},
    )
    assert outsider.status_code == 200
    assert outsider.json() == []


def test_endpoint_union_lineage_and_provenance(client):
    endpoints = client.get(f"{product_url()}/endpoints")
    assert endpoints.status_code == 200
    assert {item["protocol"] for item in endpoints.json()} == {"http-rest", "postgresql"}
    postgres = next(item for item in endpoints.json() if item["protocol"] == "postgresql")
    assert postgres["connection"]["schema"] == "public"
    assert postgres["connection"]["port"] == 55432
    assert postgres["connection"]["database"] == "daca_sample"
    assert "password" not in postgres["connection"]

    invalid = client.post(
        f"{product_url()}/endpoints",
        headers={"If-Match": '"1"'},
        json={"name": "gRPC", "protocol": "grpc", "connection": {}},
    )
    assert invalid.status_code == 422

    created = client.post(
        f"{product_url()}/endpoints",
        headers={"If-Match": '"1"'},
        json={
            "name": "Secondary REST endpoint",
            "protocol": "http-rest",
            "connection": {"baseUrl": "https://example.admin.ch", "path": "/v1/data", "method": "GET"},
        },
    )
    assert created.status_code == 201
    assert created.headers["etag"] == '"2"'
    assert created.json()["connection"]["baseUrl"] == "https://example.admin.ch"

    credential_url = client.post(
        f"{product_url()}/endpoints",
        headers={"If-Match": '"2"'},
        json={
            "name": "Leaky endpoint",
            "protocol": "http-rest",
            "connection": {
                "baseUrl": "https://user:secret@example.admin.ch?token=secret",
                "path": "/v1/data",
                "method": "GET",
            },
        },
    )
    assert credential_url.status_code == 422

    query_token = client.post(
        f"{product_url()}/endpoints",
        headers={"If-Match": '"2"'},
        json={
            "name": "Token path",
            "protocol": "http-rest",
            "connection": {
                "baseUrl": "https://example.admin.ch",
                "path": "/v1/data?token=secret",
                "method": "GET",
            },
        },
    )
    assert query_token.status_code == 422

    lineage = client.get(f"{product_url()}/lineage")
    assert lineage.status_code == 200
    assert len(lineage.json()["edges"]) == 2
    provenance = client.get(f"{product_url()}/provenance")
    assert [event["sequence"] for event in provenance.json()] == [1, 2]


def test_endpoint_reads_hide_secret_references_from_public_and_consumer_views(
    client, session_factory
):
    from daca_catalog.models import Endpoint
    from sqlalchemy import select

    with session_factory() as session:
        stored = session.scalar(
            select(Endpoint).where(Endpoint.secret_ref.is_not(None))
        )
        assert stored is not None
        assert stored.secret_ref == "env://ESTV_POSTGRES_CREDENTIALS"
        stored.connection = {
            **stored.connection,
            "password": "must-never-leave-the-catalog",
            "username": "internal-role",
        }
        session.commit()

    for headers in (
        {"X-DaCa-User": ""},
        {"X-DaCa-User": "beat.stalder"},
    ):
        response = client.get(f"{product_url()}/endpoints", headers=headers)
        assert response.status_code == 200
        serialized = json.dumps(response.json())
        assert "secretRef" not in serialized
        assert "ESTV_POSTGRES_CREDENTIALS" not in serialized
        assert "must-never-leave-the-catalog" not in serialized
        assert "internal-role" not in serialized
        for endpoint in response.json():
            assert not {
                "apiKey",
                "authorization",
                "headers",
                "password",
                "token",
                "user",
                "username",
            }.intersection(endpoint["connection"])

    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert "secretRef" not in schemas["HttpEndpointReadResponse"]["properties"]
    assert "secretRef" not in schemas["PostgreSQLEndpointReadResponse"]["properties"]
    assert "secretRef" in schemas["HttpEndpointResponse"]["properties"]


def test_not_found_is_a_problem_document(client):
    response = client.get("/api/v1/data-products/99999999-9999-4999-8999-999999999999")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["title"] == "Not found"
