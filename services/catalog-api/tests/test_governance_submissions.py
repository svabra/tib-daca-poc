from __future__ import annotations

import json
import re
import uuid

import pytest
from daca_catalog.models import (
    AccessRequest,
    DataProduct,
    GovernanceSubmission,
    MetadataPublication,
    PocProductFixture,
    ProductQualityAssessment,
    WorkflowTask,
)
from daca_catalog.policy import ProjectionResult
from sqlalchemy import select


def journey_payload(client, suffix: str = "v1") -> dict:
    payload = next(
        item["payload"]
        for item in client.get("/api/v1/poc/product-fixtures").json()
        if item["id"] == "kassandra-gold"
    )
    payload["sourceProductId"] = f"daaif:kantonale-gewerbesteuer-soll-ist-2022-2026:{suffix}"
    payload["ownerUserId"] = "joel.ruod"
    payload["publicationMode"] = "governance_review"
    payload["businessMetadata"]["title"] = "Kantonale Gewerbesteuer: Soll/Ist und Jahreshochrechnung 2022–2026"
    # External governance-review assertions are always suggestions. Even a
    # source claiming review cannot confirm DCAT on Joel's behalf.
    payload["businessMetadata"]["dcatReviewed"] = True
    payload["businessMetadata"]["productClassUri"] = None
    for field in payload["technicalMetadata"]["schemaFields"]:
        field["ontologyTermUri"] = None
    return payload


def governance_body() -> dict:
    availability = {
        "weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
        "startTime": "07:00",
        "endTime": "19:00",
        "timeZone": "Europe/Zurich",
    }

    def grant(subject_type: str, subject_id: str) -> dict:
        return {
            "subject": {"type": subject_type, "id": subject_id},
            "actions": ["data.read"],
            "protocols": ["http"],
            "validFrom": "2026-08-13",
            "validUntil": "2027-08-13",
            "dataVariant": "original",
            "metadataChannels": {"kobyMcp": False, "i14y": True},
            "weeklyAvailability": availability,
        }

    return {
        "discoverable": True,
        "discoverabilityConfirmed": True,
        "grants": [
            grant("group", "kanton-st-gallen"),
            grant("group", "efd-efv-bundestresorerie"),
            grant("person", "thomas.kriegli"),
        ],
        "barArchive": {"enabled": True, "retentionYears": 20},
    }


def complete_metadata_task(session_factory, product_id: str) -> None:
    with session_factory() as session:
        task = session.scalar(
            select(WorkflowTask).where(
                WorkflowTask.data_product_id == uuid.UUID(product_id),
                WorkflowTask.task_type == "metadata_quality",
            )
        )
        task.status = "completed"
        session.commit()


def make_product_discoverable(session_factory, product_id: str) -> None:
    with session_factory() as session:
        typed_id = uuid.UUID(product_id)
        product = session.get(DataProduct, typed_id)
        product.discoverable = True
        product.lifecycle = "active"
        assessment = session.get(ProductQualityAssessment, typed_id)
        assessment.discoverability_confirmed = True
        session.commit()


def create_ready_submission(client, session_factory, suffix: str = "v1") -> tuple[str, dict]:
    product_id = client.post("/api/v1/metadata-publications", json=journey_payload(client, suffix)).json()["productId"]
    blocked = client.post(
        f"/api/v1/data-products/{product_id}/governance-submissions",
        headers={"X-DaCa-User": "joel.ruod"},
        json=governance_body(),
    )
    assert blocked.status_code == 409
    complete_metadata_task(session_factory, product_id)
    created = client.post(
        f"/api/v1/data-products/{product_id}/governance-submissions",
        headers={"X-DaCa-User": "joel.ruod"},
        json=governance_body(),
    )
    assert created.status_code == 201
    return product_id, created.json()


def test_four_eyes_approval_activates_only_after_both_targets(
    client, session_factory, monkeypatch
):
    product_id, submission = create_ready_submission(client, session_factory)
    assert submission["ownerUserId"] == "joel.ruod"
    assert submission["approverUserId"] == "thomas.kriegli"
    assert submission["status"] == "pending_approval"
    assert submission["archiveEvidence"]["retentionYears"] == 20
    assert submission["archiveEvidence"]["networkCallCreated"] is False
    quality = client.get(
        f"/api/v1/data-products/{product_id}/quality",
        headers={"X-DaCa-User": "joel.ruod"},
    ).json()
    assert quality["graphStatus"] == "suggested"
    assert quality["quality"]["dcatReviewed"] is False
    assert any(
        mapping["mappingType"] == "product_class"
        and mapping["status"] == "suggested"
        and mapping["termUri"].endswith("CorporateTaxForecastDataset")
        for mapping in quality["mappings"]
    )
    assert submission["reviewSnapshot"]["grants"][0]["groupSnapshot"]["memberIds"] == [
        "beat.stalder",
        "sarah.brunner",
    ]
    assert submission["reviewSnapshot"]["grants"][1]["groupSnapshot"]["memberIds"] == [
        "daniel.aebischer"
    ]

    assert client.get(
        f"/api/v1/data-products/{product_id}", headers={"X-DaCa-User": "thomas.kriegli"}
    ).status_code == 200
    assert client.get(
        f"/api/v1/data-products/{product_id}", headers={"X-DaCa-User": "beat.stalder"}
    ).status_code == 404
    thomas_tasks = client.get(
        "/api/v1/tasks/mine", headers={"X-DaCa-User": "thomas.kriegli"}
    ).json()
    assert any(
        task["taskType"] == "publication_approval"
        and task["governanceSubmissionId"] == submission["id"]
        for task in thomas_tasks
    )
    assert client.post(
        f"/api/v1/data-products/{product_id}/access-governance",
        headers={"X-DaCa-User": "joel.ruod"},
        json={
            "discoverable": True,
            "discoverabilityConfirmed": True,
            "grants": governance_body()["grants"],
        },
    ).status_code == 409
    assert client.post(
        f"/api/v1/data-products/{product_id}/policies/{submission['policyRevisionId']}/publish",
        headers={
            "X-DaCa-User": "joel.ruod",
            "If-Match": f'"{submission["policyRevision"]}"',
        },
    ).status_code == 409

    decision_url = f"/api/v1/governance-submissions/{submission['id']}/decision"
    decision_body = {
        "decision": "approve",
        "policyRevision": submission["policyRevision"],
        "comment": "Vier-Augen-Prüfung bestanden.",
    }
    assert client.post(
        decision_url,
        headers={"X-DaCa-User": "joel.ruod", "If-Match": '"1"'},
        json=decision_body,
    ).status_code == 403
    assert client.post(
        decision_url,
        headers={"X-DaCa-User": "beat.stalder", "If-Match": '"1"'},
        json=decision_body,
    ).status_code == 403
    assert client.post(
        decision_url,
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"0"'},
        json=decision_body,
    ).status_code == 412

    monkeypatch.setattr(
        "daca_catalog.governance.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )
    approved = client.post(
        decision_url,
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"1"'},
        json=decision_body,
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved_deploying"
    assert client.post(
        decision_url,
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"2"'},
        json={**decision_body, "policyRevision": submission["policyRevision"] + 99},
    ).status_code == 409
    assert client.get(
        f"/api/v1/data-products/{product_id}", headers={"X-DaCa-User": "beat.stalder"}
    ).status_code == 404
    assert client.post(
        decision_url,
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"2"'},
        json={**decision_body, "decision": "reject"},
    ).status_code == 409

    assert client.get(f"/api/v1/data-products/{product_id}/policies").status_code == 404
    policies = client.get(
        f"/api/v1/data-products/{product_id}/policies",
        headers={"X-DaCa-User": "thomas.kriegli"},
    ).json()["items"]
    published = policies[0]
    opa = next(item for item in published["deployments"] if item["target"] == "opa")
    acknowledged = client.put(
        "/internal/v1/policy-deployments/acknowledge",
        headers={"Authorization": "Bearer test-internal-token"},
        json={
            "policyRevisionId": published["id"],
            "target": "opa",
            "observedRevision": opa["desiredRevision"],
            "state": "deployed",
            "error": None,
        },
    )
    assert acknowledged.status_code == 200
    final = client.get(
        f"/api/v1/governance-submissions/{submission['id']}",
        headers={"X-DaCa-User": "thomas.kriegli"},
    ).json()
    assert final["status"] == "approved"
    product = client.get(
        f"/api/v1/data-products/{product_id}", headers={"X-DaCa-User": "beat.stalder"}
    ).json()
    assert product["discoverable"] is True
    assert product["lifecycle"] == "active"
    with session_factory() as session:
        publication = session.scalar(
            select(MetadataPublication).where(
                MetadataPublication.data_product_id == uuid.UUID(product_id)
            )
        )
        assert publication.state == "published"

    activity = client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "beat.stalder"},
    )
    assert activity.status_code == 200
    assert activity.json()["detailLevel"] == "summary"
    event_types = [item["eventType"] for item in activity.json()["items"]]
    assert event_types[0] == "publication-activated"
    assert event_types.count("governance-submitted") == 1
    assert "publication-approved-deploying" in event_types
    assert "metadata-publication-received" in event_types
    assert event_types.index("publication-activated") < event_types.index(
        "publication-approved-deploying"
    )
    assert event_types.index("publication-approved-deploying") < event_types.index(
        "governance-submitted"
    )
    assert event_types.index("governance-submitted") < event_types.index(
        "metadata-publication-received"
    )
    governance_event = next(
        item for item in activity.json()["items"] if item["eventType"] == "governance-submitted"
    )
    assert governance_event["policyRevision"] == submission["policyRevision"]
    serialized_activity = json.dumps(activity.json(), ensure_ascii=False)
    assert re.search(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        serialized_activity,
        re.IGNORECASE,
    ) is None

    approver_activity = client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "thomas.kriegli"},
    )
    assert approver_activity.json()["detailLevel"] == "privileged"
    assert client.get(
        f"/api/v1/data-products/{product_id}/audit-events",
        headers={"X-DaCa-User": "thomas.kriegli"},
    ).status_code == 200


def test_rejection_creates_owner_correction_and_conflicting_replay_is_rejected(
    client, session_factory
):
    product_id, submission = create_ready_submission(client, session_factory, "reject")
    url = f"/api/v1/governance-submissions/{submission['id']}/decision"
    rejected = client.post(
        url,
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"1"'},
        json={
            "decision": "reject",
            "policyRevision": submission["policyRevision"],
            "comment": "Bitte Empfängerbegründung ergänzen.",
        },
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    stale_replay = client.post(
        url,
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"2"'},
        json={
            "decision": "reject",
            "policyRevision": submission["policyRevision"] + 99,
            "comment": "stale replay",
        },
    )
    assert stale_replay.status_code == 409
    correction_tasks = client.get(
        "/api/v1/tasks/mine", headers={"X-DaCa-User": "joel.ruod"}
    ).json()
    assert any(task["taskType"] == "governance_correction" for task in correction_tasks)
    conflict = client.post(
        url,
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"2"'},
        json={
            "decision": "approve",
            "policyRevision": submission["policyRevision"],
            "comment": None,
        },
    )
    assert conflict.status_code == 409

    activity = client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "thomas.kriegli"},
    )
    assert activity.status_code == 200
    assert "governance-rejected" in {
        item["eventType"] for item in activity.json()["items"]
    }
    serialized_activity = json.dumps(activity.json(), ensure_ascii=False)
    assert "Bitte Empfängerbegründung ergänzen." not in serialized_activity

    # Make this externally published product resettable through the real fixture
    # endpoint. The reset deletes relational submissions, while their append-only
    # audit records must remain part of the product history after re-injection.
    with session_factory() as session:
        reset_fixture = session.get(PocProductFixture, "kassandra-gold")
        reset_fixture.owner_user_id = "joel.ruod"
        reset_fixture.source_product_id = (
            "daaif:kantonale-gewerbesteuer-soll-ist-2022-2026:reject"
        )
        session.commit()
    reset = client.post(
        f"/api/v1/poc/data-products/{product_id}/reset",
        headers={"X-DaCa-User": "joel.ruod"},
        json={"confirmationName": "Joel Ruod"},
    )
    assert reset.status_code == 200, reset.text
    republished = client.post(
        "/api/v1/metadata-publications", json=journey_payload(client, "reject")
    )
    assert republished.status_code == 201
    assert republished.json()["productId"] == product_id

    historical_activity = client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "joel.ruod"},
    )
    assert historical_activity.status_code == 200
    historical_governance = [
        item
        for item in historical_activity.json()["items"]
        if item["eventType"] in {"governance-submitted", "governance-rejected"}
    ]
    assert [item["eventType"] for item in historical_governance].count(
        "governance-submitted"
    ) == 1
    assert [item["eventType"] for item in historical_governance].count(
        "governance-rejected"
    ) == 1
    assert all(
        item["policyRevision"] == submission["policyRevision"]
        for item in historical_governance
    )


def test_failed_postgresql_deployment_is_persisted_and_stays_private(
    client, session_factory, monkeypatch
):
    product_id, submission = create_ready_submission(client, session_factory, "failure")
    monkeypatch.setattr(
        "daca_catalog.governance.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "failed", error="projector unavailable"
        ),
    )
    failed = client.post(
        f"/api/v1/governance-submissions/{submission['id']}/decision",
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"1"'},
        json={
            "decision": "approve",
            "policyRevision": submission["policyRevision"],
            "comment": None,
        },
    )
    assert failed.status_code == 503
    with session_factory() as session:
        stored = session.get(GovernanceSubmission, uuid.UUID(submission["id"]))
        assert stored.status == "deployment_failed"
    assert client.get(
        f"/api/v1/data-products/{product_id}", headers={"X-DaCa-User": "beat.stalder"}
    ).status_code == 404
    assert client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "beat.stalder"},
    ).status_code == 404
    activity = client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "thomas.kriegli"},
    )
    assert activity.status_code == 200
    assert "publication-deployment-failed" in {
        item["eventType"] for item in activity.json()["items"]
    }
    assert "projector unavailable" not in json.dumps(activity.json())


def test_opa_bundle_activation_failure_blocks_publication_and_creates_correction(
    client, session_factory, monkeypatch
):
    product_id, submission = create_ready_submission(client, session_factory, "opa-failure")
    monkeypatch.setattr(
        "daca_catalog.governance.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )
    approved = client.post(
        f"/api/v1/governance-submissions/{submission['id']}/decision",
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"1"'},
        json={
            "decision": "approve",
            "policyRevision": submission["policyRevision"],
            "comment": None,
        },
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved_deploying"

    observed = client.post(
        "/api/v1/internal/opa/status",
        headers={"Authorization": "Bearer test-internal-token"},
        json={
            "bundles": {
                "daca": {
                    "active_revision": "previous-bundle",
                    "code": "rego_compile_error",
                    "message": "error(s) occurred while compiling module(s)",
                    "errors": [
                        {
                            "code": "rego_unsafe_var_error",
                            "message": "unsafe variable",
                        }
                    ],
                }
            }
        },
    )
    assert observed.status_code == 200
    assert observed.json()["status"] == "bundle-activation-failed"
    assert observed.json()["deploymentsFailed"] >= 1

    stored = client.get(
        f"/api/v1/governance-submissions/{submission['id']}",
        headers={"X-DaCa-User": "thomas.kriegli"},
    ).json()
    assert stored["status"] == "deployment_failed"
    assert client.get(
        f"/api/v1/data-products/{product_id}",
        headers={"X-DaCa-User": "beat.stalder"},
    ).status_code == 404
    correction_tasks = client.get(
        "/api/v1/tasks/mine", headers={"X-DaCa-User": "joel.ruod"}
    ).json()
    assert any(
        task["taskType"] == "governance_correction"
        and task["governanceSubmissionId"] == submission["id"]
        for task in correction_tasks
    )
    activity = client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "thomas.kriegli"},
    )
    assert activity.status_code == 200
    assert "publication-deployment-failed" in {
        item["eventType"] for item in activity.json()["items"]
    }
    serialized_activity = json.dumps(activity.json())
    assert "rego_compile_error" not in serialized_activity
    assert "unsafe variable" not in serialized_activity


def test_weekly_availability_rejects_invalid_or_overnight_windows(client):
    body = governance_body()
    body["grants"][0]["weeklyAvailability"]["timeZone"] = "Not/AZone"
    response = client.post(
        "/api/v1/data-products/11111111-1111-4111-8111-111111111111/governance-submissions",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json=body,
    )
    assert response.status_code == 422

    body = governance_body()
    body["grants"][0]["weeklyAvailability"]["startTime"] = "19:00"
    body["grants"][0]["weeklyAvailability"]["endTime"] = "07:00"
    response = client.post(
        "/api/v1/data-products/11111111-1111-4111-8111-111111111111/governance-submissions",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json=body,
    )
    assert response.status_code == 422


def test_group_fulfillment_is_bound_to_exact_deployed_policy_revision(
    client, session_factory, monkeypatch
):
    product_id = client.post(
        "/api/v1/metadata-publications", json=journey_payload(client, "group-request")
    ).json()["productId"]
    make_product_discoverable(session_factory, product_id)
    requested = client.post(
        f"/api/v1/data-products/{product_id}/access-requests",
        headers={"X-DaCa-User": "beat.stalder"},
        json={
            "consumerType": "person",
            "machineId": None,
            "purpose": "Kantonale Finanzanalyse mit aggregierten Gewerbesteuerwerten.",
            "legalBasis": "Amtshilfe",
            "requestedProtocol": "http",
            "requestedVariant": "original",
            "validFrom": "2026-08-13",
            "validUntil": "2027-08-13",
            "contactEmail": "beat.stalder@sg.ch",
            "notes": None,
            "conditionsAccepted": True,
        },
    )
    assert requested.status_code == 201
    request_id = requested.json()["id"]
    complete_metadata_task(session_factory, product_id)
    body = governance_body()
    for grant in body["grants"]:
        grant.pop("weeklyAvailability", None)
        grant["metadataChannels"]["kobyMcp"] = True
    body["accessRequestFulfillments"] = [
        {
            "accessRequestId": request_id,
            "fulfillmentSubject": {"type": "group", "id": "kanton-st-gallen"},
        }
    ]
    created = client.post(
        f"/api/v1/data-products/{product_id}/governance-submissions",
        headers={"X-DaCa-User": "joel.ruod"},
        json=body,
    )
    assert created.status_code == 201
    submission = created.json()
    fulfillment = submission["reviewSnapshot"]["accessRequestFulfillments"][0]
    assert fulfillment["accessRequestId"] == request_id
    assert fulfillment["fulfillmentSubject"] == {
        "type": "group",
        "id": "kanton-st-gallen",
    }
    assert fulfillment["groupMembershipRevision"] == 1
    pending = client.get(
        f"/api/v1/data-products/{product_id}/access-requests/mine",
        headers={"X-DaCa-User": "beat.stalder"},
    ).json()[0]
    assert pending["status"] == "approved_policy_pending"
    assert pending["decisionPolicyRevisionId"] == submission["policyRevisionId"]
    assert pending["fulfillmentSubjectType"] == "group"

    monkeypatch.setattr(
        "daca_catalog.governance.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )
    approved = client.post(
        f"/api/v1/governance-submissions/{submission['id']}/decision",
        headers={"X-DaCa-User": "thomas.kriegli", "If-Match": '"1"'},
        json={
            "decision": "approve",
            "policyRevision": submission["policyRevision"],
            "comment": "Gruppensnapshot und Anfrage geprüft.",
        },
    )
    assert approved.status_code == 200
    still_pending = client.get(
        f"/api/v1/data-products/{product_id}/access-requests/mine",
        headers={"X-DaCa-User": "beat.stalder"},
    ).json()[0]
    assert still_pending["status"] == "approved_policy_pending"
    policy = client.get(
        f"/api/v1/data-products/{product_id}/policies/latest",
        headers={"X-DaCa-User": "thomas.kriegli"},
    ).json()
    opa = next(item for item in policy["deployments"] if item["target"] == "opa")
    assert client.put(
        "/internal/v1/policy-deployments/acknowledge",
        headers={"Authorization": "Bearer test-internal-token"},
        json={
            "policyRevisionId": policy["id"],
            "target": "opa",
            "observedRevision": opa["desiredRevision"],
            "state": "deployed",
            "error": None,
        },
    ).status_code == 200
    granted = client.get(
        f"/api/v1/data-products/{product_id}/access-requests/mine",
        headers={"X-DaCa-User": "beat.stalder"},
    ).json()[0]
    assert granted["status"] == "granted_original"


def test_group_fulfillment_rejects_nonmember_without_partial_state(
    client, session_factory
):
    product_id = client.post(
        "/api/v1/metadata-publications", json=journey_payload(client, "wrong-group")
    ).json()["productId"]
    make_product_discoverable(session_factory, product_id)
    requested = client.post(
        f"/api/v1/data-products/{product_id}/access-requests",
        headers={"X-DaCa-User": "beat.stalder"},
        json={
            "consumerType": "person",
            "machineId": None,
            "purpose": "Kantonale Finanzanalyse mit aggregierten Gewerbesteuerwerten.",
            "legalBasis": "Amtshilfe",
            "requestedProtocol": "http",
            "requestedVariant": "original",
            "validFrom": "2026-08-13",
            "validUntil": "2027-08-13",
            "contactEmail": "beat.stalder@sg.ch",
            "notes": None,
            "conditionsAccepted": True,
        },
    ).json()
    complete_metadata_task(session_factory, product_id)
    body = governance_body()
    body["accessRequestFulfillments"] = [
        {
            "accessRequestId": requested["id"],
            "fulfillmentSubject": {
                "type": "group",
                "id": "efd-efv-bundestresorerie",
            },
        }
    ]
    rejected = client.post(
        f"/api/v1/data-products/{product_id}/governance-submissions",
        headers={"X-DaCa-User": "joel.ruod"},
        json=body,
    )
    assert rejected.status_code == 422
    with session_factory() as session:
        stored = session.get(AccessRequest, uuid.UUID(requested["id"]))
        assert stored.status == "submitted"
        assert stored.decision_policy_revision_id is None


@pytest.mark.parametrize(
    ("case", "consumer_type", "machine_id", "grant_change"),
    [
        ("machine-through-group", "machine", "svc-cantonal-tax", None),
        ("protocol-mismatch", "person", None, ("protocols", ["postgresql"])),
        ("period-mismatch", "person", None, ("validUntil", "2027-08-12")),
        ("variant-mismatch", "person", None, ("dataVariant", "modified")),
    ],
)
def test_group_fulfillment_requires_exact_request_coverage_without_partial_state(
    client,
    session_factory,
    case,
    consumer_type,
    machine_id,
    grant_change,
):
    product_id = client.post(
        "/api/v1/metadata-publications", json=journey_payload(client, case)
    ).json()["productId"]
    make_product_discoverable(session_factory, product_id)
    requested = client.post(
        f"/api/v1/data-products/{product_id}/access-requests",
        headers={"X-DaCa-User": "beat.stalder"},
        json={
            "consumerType": consumer_type,
            "machineId": machine_id,
            "purpose": "Kantonale Finanzanalyse mit aggregierten Gewerbesteuerwerten.",
            "legalBasis": "Amtshilfe",
            "requestedProtocol": "http",
            "requestedVariant": "original",
            "validFrom": "2026-08-13",
            "validUntil": "2027-08-13",
            "contactEmail": "beat.stalder@sg.ch",
            "notes": None,
            "conditionsAccepted": True,
        },
    ).json()
    complete_metadata_task(session_factory, product_id)
    body = governance_body()
    group_grant = next(
        grant
        for grant in body["grants"]
        if grant["subject"] == {"type": "group", "id": "kanton-st-gallen"}
    )
    if grant_change is not None:
        field, value = grant_change
        group_grant[field] = value
    body["accessRequestFulfillments"] = [
        {
            "accessRequestId": requested["id"],
            "fulfillmentSubject": {"type": "group", "id": "kanton-st-gallen"},
        }
    ]

    rejected = client.post(
        f"/api/v1/data-products/{product_id}/governance-submissions",
        headers={"X-DaCa-User": "joel.ruod"},
        json=body,
    )
    assert rejected.status_code == 422
    with session_factory() as session:
        stored = session.get(AccessRequest, uuid.UUID(requested["id"]))
        assert stored.status == "submitted"
        assert stored.decision_policy_revision_id is None
        assert session.scalar(
            select(GovernanceSubmission).where(
                GovernanceSubmission.data_product_id == uuid.UUID(product_id)
            )
        ) is None
