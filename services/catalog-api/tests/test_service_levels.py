from __future__ import annotations

import json
import uuid
from datetime import timedelta

import pytest
from daca_catalog.control_people import is_active_publication_approver
from daca_catalog.models import (
    AccessRequest,
    DataProduct,
    DemoUser,
    GovernanceSubmission,
    MetadataDeliveryOutbox,
    PolicyDeployment,
    PolicyRevision,
    ServiceLevelRevision,
    utc_now,
)
from daca_catalog.schemas import FIXED_BEST_EFFORT_LIMITATION
from daca_catalog.service_levels import zurich_today
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

PRODUCT_ID = "11111111-1111-4111-8111-111111111111"
OWNER = "kassandra.valdata"
CONTROLLER = "thomas.kriegli"


def revision_url(revision_id: str | None = None) -> str:
    base = f"/api/v1/data-products/{PRODUCT_ID}/service-level/revisions"
    return f"{base}/{revision_id}" if revision_id else base


def definition(next_review_on: str, **overrides: object) -> dict:
    value = {
        "templateVersion": 1,
        "purposeAndSuitableUse": (
            "Dieses synthetische Datenprodukt unterstützt die behördliche "
            "Planung und nachvollziehbare Fachanalysen."
        ),
        "availabilityCommitment": "best_effort",
        "freshnessToleranceBusinessDays": 5,
        "supportWindow": {
            "weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            "start": "08:00",
            "end": "17:00",
            "timezone": "Europe/Zurich",
        },
        "initialResponseTargetSupportHours": 16,
        "plannedMaintenanceNoticeHours": 48,
        "usageConditions": [
            "Nutzung ausschliesslich im bewilligten behördlichen Fachkontext."
        ],
        "knownLimitations": ["Synthetische PoC-Daten ohne Produktionsgarantie."],
        "nextReviewOn": next_review_on,
    }
    value.update(overrides)
    return value


def revision_body(*, start_offset: int = 0, end_offset: int | None = 365) -> dict:
    start = zurich_today() + timedelta(days=start_offset)
    end = zurich_today() + timedelta(days=end_offset) if end_offset is not None else None
    review = start + timedelta(days=30)
    return {
        "validFrom": start.isoformat(),
        "validUntil": end.isoformat() if end else None,
        "definition": definition(review.isoformat()),
    }


def create_draft(client, *, latest: int = 0, body: dict | None = None):
    return client.post(
        revision_url(),
        headers={"X-DaCa-User": OWNER, "If-Match": f'"{latest}"'},
        json=body or revision_body(),
    )


def submit(client, revision: dict):
    return client.post(
        f"{revision_url(revision['revisionId'])}/submit",
        headers={
            "X-DaCa-User": OWNER,
            "If-Match": f'"{revision["lockVersion"]}"',
        },
    )


def decide(client, revision: dict, decision: str = "approve", reason: str | None = None):
    payload = {"decision": decision}
    if reason is not None:
        payload["reason"] = reason
    return client.post(
        f"{revision_url(revision['revisionId'])}/decision",
        headers={
            "X-DaCa-User": CONTROLLER,
            "If-Match": f'"{revision["lockVersion"]}"',
        },
        json=payload,
    )


def protected_operational_state(session_factory) -> dict[str, object]:
    with session_factory() as session:
        product = session.get(DataProduct, uuid.UUID(PRODUCT_ID))
        return {
            "product": (
                product.active_policy_revision,
                product.discoverable,
                product.lifecycle,
                product.quality,
            ),
            "accessRequests": [
                (
                    str(row.id),
                    row.status,
                    str(row.decision_policy_revision_id),
                    row.fulfillment_subject_type,
                    row.fulfillment_subject_id,
                )
                for row in session.scalars(select(AccessRequest).order_by(AccessRequest.id))
            ],
            "policies": [
                (str(row.id), row.revision, row.status, row.definition)
                for row in session.scalars(select(PolicyRevision).order_by(PolicyRevision.id))
            ],
            "deployments": [
                (
                    str(row.id),
                    row.target,
                    row.desired_revision,
                    row.observed_revision,
                    row.state,
                    row.error,
                )
                for row in session.scalars(
                    select(PolicyDeployment).order_by(PolicyDeployment.id)
                )
            ],
            "metadataOutbox": [
                (str(row.id), row.status, row.payload)
                for row in session.scalars(
                    select(MetadataDeliveryOutbox).order_by(MetadataDeliveryOutbox.id)
                )
            ],
            "governance": [
                (str(row.id), row.status, row.archive_evidence)
                for row in session.scalars(
                    select(GovernanceSubmission).order_by(GovernanceSubmission.id)
                )
            ],
        }


def test_seeded_products_have_safe_baseline_and_eligible_control_people(
    client, session_factory
):
    with session_factory() as session:
        products = list(session.scalars(select(DataProduct).order_by(DataProduct.id)))
        assert products
        for product in products:
            controller = session.get(DemoUser, product.control_person_user_id)
            assert is_active_publication_approver(controller)
            assert controller is not None
            assert controller.id != product.owner_user_id

    response = client.get(f"/api/v1/data-products/{PRODUCT_ID}/service-level")
    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "platform_default"
    assert payload["state"] == "baseline"
    assert payload["current"]["revision"] == 0
    assert payload["current"]["definition"]["availabilityCommitment"] == "best_effort"
    assert (
        FIXED_BEST_EFFORT_LIMITATION
        in payload["current"]["definition"]["knownLimitations"]
    )
    assert payload["controlPerson"]["displayName"] == "Thomas Kriegli"
    assert payload["canEdit"] is False
    assert payload["canReview"] is False

    legal = {item["code"]: item for item in payload["legalReferences"]}
    assert set(legal) == {
        "ISG",
        "ISV",
        "DSG",
        "DSV",
        "EMBAG",
        "BGÖ",
        "VBGÖ",
        "BGA",
        "VBGA",
    }
    assert {
        code: (item["title"], item["reference"], item["url"])
        for code, item in legal.items()
    } == {
        "ISG": (
            "Bundesgesetz über die Informationssicherheit beim Bund",
            "ISG, SR 128, Art. 6, 8–10 und 21",
            "https://www.fedlex.admin.ch/eli/cc/2022/232/de",
        ),
        "ISV": (
            "Verordnung über die Informationssicherheit in der Bundesverwaltung und der Armee",
            "ISV, SR 128.1, Art. 4, 8, 10 und 12",
            "https://www.fedlex.admin.ch/eli/cc/2023/735/de",
        ),
        "DSG": (
            "Bundesgesetz über den Datenschutz",
            "DSG, SR 235.1, Art. 6–8 sowie Art. 34 und 36 für Bundesorgane",
            "https://www.fedlex.admin.ch/eli/cc/2022/491/de",
        ),
        "DSV": (
            "Verordnung über den Datenschutz",
            "DSV, SR 235.11, Art. 1–3",
            "https://www.fedlex.admin.ch/eli/cc/2022/568/de",
        ),
        "EMBAG": (
            "Bundesgesetz über den Einsatz elektronischer Mittel zur Erfüllung von Behördenaufgaben",
            "EMBAG, SR 172.019, Art. 3, 10 und 13",
            "https://www.fedlex.admin.ch/eli/cc/2023/682/de",
        ),
        "BGÖ": (
            "Bundesgesetz über das Öffentlichkeitsprinzip der Verwaltung",
            "BGÖ, SR 152.3",
            "https://www.fedlex.admin.ch/eli/cc/2006/355/de",
        ),
        "VBGÖ": (
            "Verordnung über das Öffentlichkeitsprinzip der Verwaltung",
            "VBGÖ, SR 152.31",
            "https://www.fedlex.admin.ch/eli/cc/2006/356/de",
        ),
        "BGA": (
            "Bundesgesetz über die Archivierung",
            "BGA, SR 152.1",
            "https://www.fedlex.admin.ch/eli/cc/1999/354/de",
        ),
        "VBGA": (
            "Verordnung zum Bundesgesetz über die Archivierung",
            "VBGA, SR 152.11",
            "https://www.fedlex.admin.ch/eli/cc/1999/371/de",
        ),
    }
    serialized = json.dumps(payload, ensure_ascii=False)
    assert OWNER not in serialized
    assert CONTROLLER not in serialized


def test_owner_to_controller_publication_is_versioned_private_and_side_effect_free(
    client, session_factory
):
    before = protected_operational_state(session_factory)
    assert client.post(
        revision_url(),
        headers={"X-DaCa-User": OWNER},
        json=revision_body(),
    ).status_code == 428
    assert create_draft(client, latest=99).status_code == 412
    assert client.post(
        revision_url(),
        headers={"X-DaCa-User": "beat.stalder", "If-Match": '"0"'},
        json=revision_body(),
    ).status_code == 403

    created = create_draft(client)
    assert created.status_code == 201
    assert created.headers["etag"] == '"1"'
    draft = created.json()
    assert draft["status"] == "draft"
    assert FIXED_BEST_EFFORT_LIMITATION in draft["definition"]["knownLimitations"]
    assert create_draft(client, latest=1).status_code == 409
    assert client.get(revision_url(draft["revisionId"])).status_code == 404
    public_history = client.get(revision_url()).json()
    assert public_history["items"] == []
    assert public_history["latestRevision"] == 0
    assert public_history["etag"] == '"0"'

    submitted_response = submit(client, draft)
    assert submitted_response.status_code == 200
    submitted = submitted_response.json()
    assert submitted["status"] == "pending_approval"
    assert submitted["controlPerson"]["displayName"] == "Thomas Kriegli"
    tasks = client.get(
        "/api/v1/tasks/mine", headers={"X-DaCa-User": CONTROLLER}
    ).json()
    assert any(
        task["taskType"] == "service_level_approval"
        and task["serviceLevelRevisionId"] == submitted["revisionId"]
        for task in tasks
    )

    owner_decision = client.post(
        f"{revision_url(submitted['revisionId'])}/decision",
        headers={
            "X-DaCa-User": OWNER,
            "If-Match": f'"{submitted["lockVersion"]}"',
        },
        json={"decision": "approve"},
    )
    assert owner_decision.status_code == 403
    published_response = decide(client, submitted)
    assert published_response.status_code == 200
    published = published_response.json()
    assert published["status"] == "published"
    assert published["decision"] == "approve"

    summary = client.get(f"/api/v1/data-products/{PRODUCT_ID}/service-level").json()
    assert summary["source"] == "published"
    assert summary["state"] == "active"
    assert summary["current"]["revision"] == 1
    assert summary["current"]["rejectionReason"] is None
    assert OWNER not in json.dumps(summary)
    assert CONTROLLER not in json.dumps(summary)

    public_events = client.get(
        f"/api/v1/data-products/{PRODUCT_ID}/activity"
    ).json()["items"]
    public_types = [item["eventType"] for item in public_events]
    assert "service-level-published" in public_types
    assert "service-level-approved" not in public_types
    assert "service-level-draft-created" not in public_types
    assert "service-level-submitted" not in public_types
    owner_events = client.get(
        f"/api/v1/data-products/{PRODUCT_ID}/activity",
        headers={"X-DaCa-User": OWNER},
    ).json()["items"]
    owner_types = [item["eventType"] for item in owner_events]
    assert {
        "service-level-draft-created",
        "service-level-submitted",
        "service-level-approved",
        "service-level-published",
    } <= set(owner_types)
    assert before == protected_operational_state(session_factory)


def test_rejection_and_hostile_text_remain_private(client):
    unsafe = revision_body()
    unsafe["definition"]["purposeAndSuitableUse"] = (
        "<script>steal()</script> Dieser Text wäre ansonsten ausreichend lang."
    )
    assert create_draft(client, body=unsafe).status_code == 422

    created = create_draft(client).json()
    pending = submit(client, created).json()
    rejected_secret = decide(
        client,
        pending,
        "reject",
        "token=super-secret-value darf nicht gespeichert werden",
    )
    assert rejected_secret.status_code == 422
    rejected = decide(
        client,
        pending,
        "reject",
        "Die Nutzungsgrenzen müssen vor der Publikation präzisiert werden.",
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"

    owner_detail = client.get(
        revision_url(created["revisionId"]), headers={"X-DaCa-User": OWNER}
    ).json()
    assert owner_detail["rejectionReason"].startswith("Die Nutzungsgrenzen")
    assert client.get(revision_url(created["revisionId"])).status_code == 404
    assert client.get(revision_url()).json()["items"] == []
    public_activity = client.get(
        f"/api/v1/data-products/{PRODUCT_ID}/activity"
    ).json()
    assert "service-level-rejected" not in {
        item["eventType"] for item in public_activity["items"]
    }
    owner_activity = client.get(
        f"/api/v1/data-products/{PRODUCT_ID}/activity",
        headers={"X-DaCa-User": OWNER},
    ).json()
    assert "service-level-rejected" in {
        item["eventType"] for item in owner_activity["items"]
    }
    assert "Nutzungsgrenzen" not in json.dumps(owner_activity, ensure_ascii=False)


def test_scheduled_revision_and_supersession_are_deterministic(client):
    scheduled_draft = create_draft(client, body=revision_body(start_offset=1)).json()
    scheduled = submit(client, scheduled_draft).json()
    assert decide(client, scheduled).status_code == 200
    scheduled_summary = client.get(
        f"/api/v1/data-products/{PRODUCT_ID}/service-level"
    ).json()
    assert scheduled_summary["state"] == "scheduled"
    assert scheduled_summary["current"]["status"] == "baseline"
    assert scheduled_summary["nextScheduled"]["revision"] == 1


def test_baseline_applies_in_gap_before_a_future_revision(client, monkeypatch):
    first_body = revision_body(end_offset=0)
    first_body["definition"]["nextReviewOn"] = zurich_today().isoformat()
    first = submit(client, create_draft(client, body=first_body).json()).json()
    assert decide(client, first).status_code == 200
    inclusive = client.get(
        f"/api/v1/data-products/{PRODUCT_ID}/service-level"
    ).json()
    assert inclusive["state"] == "active"
    assert inclusive["current"]["effectiveValidUntil"] == zurich_today().isoformat()

    second = submit(
        client,
        create_draft(
            client,
            latest=1,
            body=revision_body(start_offset=2),
        ).json(),
    ).json()
    assert decide(client, second).status_code == 200

    gap_day = zurich_today() + timedelta(days=1)
    monkeypatch.setattr("daca_catalog.service_levels.zurich_today", lambda: gap_day)
    summary = client.get(
        f"/api/v1/data-products/{PRODUCT_ID}/service-level"
    ).json()
    assert summary["state"] == "scheduled"
    assert summary["source"] == "platform_default"
    assert summary["current"]["status"] == "baseline"
    assert summary["nextScheduled"]["revision"] == 2


def test_later_publication_supersedes_effective_period_and_rejects_overlap(client):
    first = submit(client, create_draft(client).json()).json()
    assert decide(client, first).status_code == 200
    second_draft = create_draft(
        client, latest=1, body=revision_body(start_offset=1, end_offset=None)
    ).json()
    second = submit(client, second_draft).json()
    assert decide(client, second).status_code == 200

    history = client.get(revision_url()).json()["items"]
    by_revision = {item["revision"]: item for item in history}
    assert by_revision[1]["effectiveValidUntil"] == zurich_today().isoformat()
    assert by_revision[1]["supersededByRevision"] == 2
    assert by_revision[2]["supersedesRevision"] == 1
    public_types = {
        item["eventType"]
        for item in client.get(
            f"/api/v1/data-products/{PRODUCT_ID}/activity"
        ).json()["items"]
    }
    assert "service-level-superseded" in public_types

    overlapping_draft = create_draft(
        client, latest=2, body=revision_body(start_offset=1)
    ).json()
    overlapping = submit(client, overlapping_draft).json()
    rejected = decide(client, overlapping)
    assert rejected.status_code == 409


def test_control_person_changes_with_draft_but_not_during_review(
    client, session_factory
):
    draft = create_draft(client).json()
    with session_factory() as session:
        session.add(
            DemoUser(
                id="second.approver",
                display_name="Zweite Kontrollperson",
                organization="Bundesamt für Informatik und Telekommunikation BIT",
                email="second.approver@bit.admin.ch",
                roles=["publication_approver"],
                selectable=True,
                active=True,
                created_at=utc_now(),
            )
        )
        session.commit()

    changed = client.put(
        f"/api/v1/data-products/{PRODUCT_ID}/control-person",
        headers={"X-DaCa-User": OWNER, "If-Match": '"1"'},
        json={"controlPersonUserId": "second.approver"},
    )
    assert changed.status_code == 200
    assert changed.headers["etag"] == '"2"'
    assert changed.json()["controlPerson"]["displayName"] == "Zweite Kontrollperson"
    assert "userId" not in changed.json()["controlPerson"]
    assert client.put(
        f"/api/v1/data-products/{PRODUCT_ID}/control-person",
        headers={"X-DaCa-User": "beat.stalder", "If-Match": '"2"'},
        json={"controlPersonUserId": CONTROLLER},
    ).status_code == 403

    pending = submit(client, draft)
    assert pending.status_code == 200
    assert pending.json()["controlPerson"]["displayName"] == "Zweite Kontrollperson"
    assert client.get(
        f"/api/v1/data-products/{PRODUCT_ID}/audit-events",
        headers={"X-DaCa-User": "second.approver"},
    ).status_code == 403
    blocked = client.put(
        f"/api/v1/data-products/{PRODUCT_ID}/control-person",
        headers={"X-DaCa-User": OWNER, "If-Match": '"2"'},
        json={"controlPersonUserId": CONTROLLER},
    )
    assert blocked.status_code == 409


def test_database_prevents_parallel_open_workflows(client, session_factory):
    created = create_draft(client).json()
    with session_factory() as session:
        session.add(
            ServiceLevelRevision(
                id=uuid.uuid4(),
                data_product_id=uuid.UUID(PRODUCT_ID),
                revision=2,
                lock_version=1,
                status="pending_approval",
                valid_from=zurich_today(),
                valid_until=None,
                definition=created["definition"],
                created_by_owner_user_id=OWNER,
                updated_by_owner_user_id=OWNER,
                control_person_user_id=CONTROLLER,
                control_person_snapshot={},
                created_at=utc_now(),
                updated_at=utc_now(),
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
