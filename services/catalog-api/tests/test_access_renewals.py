from __future__ import annotations

import copy
import io
import json
import tarfile
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from daca_catalog import access_renewals
from daca_catalog.access_renewals import (
    ACCESS_RENEWAL_BASE_POLICY_ID,
    ACCESS_RENEWAL_POLICY_ID,
    ACCESS_RENEWAL_PRODUCT_ID,
    ACCESS_RENEWAL_SOURCE_REQUEST_ID,
)
from daca_catalog.models import (
    AccessRequest,
    AuditEvent,
    DataProduct,
    GovernanceSubmission,
    PolicyDeployment,
    PolicyRevision,
    WorkflowTask,
)
from daca_catalog.policy import ProjectionResult
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

OWNER = {"X-DaCa-User": "kassandra.valdata"}
CONSUMER = {"X-DaCa-User": "beat.stalder"}
CONTROL_PERSON = {"X-DaCa-User": "thomas.kriegli"}
INTERNAL = {"Authorization": "Bearer test-internal-token"}
FIXTURE_URL = "/api/v1/poc/access-renewal-fixture"
EFFECTIVE_URL = f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/effective-access"
RENEWAL_URL = f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/access-renewals"
NEW_PURPOSE = (
    "Kantonale Finanzanalyse und Plausibilisierung der aggregierten Steuerstatistik "
    "für die kommenden Berichtsperioden."
)


@pytest.fixture(autouse=True)
def confirmed_fixture_postgres_projection(monkeypatch):
    monkeypatch.setattr(
        access_renewals,
        "project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )


def prepare(client) -> dict:
    response = client.post(f"{FIXTURE_URL}/prepare", headers=OWNER, json={})
    assert response.status_code == 200, response.text
    return response.json()


def effective_grant(client) -> dict:
    response = client.get(EFFECTIVE_URL, headers=CONSUMER)
    assert response.status_code == 200, response.text
    assert response.json()["granted"] is True
    grants = response.json()["grants"]
    assert len(grants) == 1
    return grants[0]


def submit_renewal(client, *, valid_until: str = "2027-12-31") -> dict:
    grant = effective_grant(client)
    response = client.post(
        RENEWAL_URL,
        headers=CONSUMER,
        json={
            "sourceGrantId": grant["grantId"],
            "purpose": NEW_PURPOSE,
            "validUntil": valid_until,
            "conditionsAccepted": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def owner_approves(client, renewal: dict) -> dict:
    response = client.post(
        f"/api/v1/access-requests/{renewal['id']}/decision",
        headers=OWNER,
        json={
            "decision": "approve",
            "grantedVariant": renewal["requestedVariant"],
            "comment": "Umfang und bestehende Freigabe wurden abgeglichen.",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def governance_decision(client, submission: dict, decision: str = "approve") -> dict:
    response = client.post(
        f"/api/v1/governance-submissions/{submission['id']}/decision",
        headers={**CONTROL_PERSON, "If-Match": f'"{submission["revision"]}"'},
        json={
            "decision": decision,
            "policyRevision": submission["policyRevision"],
            "comment": "Unabhängige Vier-Augen-Prüfung abgeschlossen.",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def acknowledge(client, policy_id: str, revision: int, state: str, error: str | None = None):
    return client.put(
        "/internal/v1/policy-deployments/acknowledge",
        headers=INTERNAL,
        json={
            "policyRevisionId": policy_id,
            "target": "opa",
            "observedRevision": revision,
            "state": state,
            "error": error,
        },
    )


def product_state(session_factory) -> tuple[int | None, bool, str]:
    with session_factory() as session:
        product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
        assert product is not None
        return product.active_policy_revision, product.discoverable, product.lifecycle


def test_fixture_is_explicit_owner_only_and_keeps_seed_policy_immutable(client, session_factory):
    with session_factory() as session:
        product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
        baseline = session.get(PolicyRevision, ACCESS_RENEWAL_BASE_POLICY_ID)
        assert product is not None and baseline is not None
        original_definition = copy.deepcopy(baseline.definition)
        assert product.active_policy_revision == 1
        assert session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID) is None
        assert session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID) is None

    assert client.get(FIXTURE_URL, headers=CONSUMER).status_code == 403
    status = client.get(FIXTURE_URL, headers=OWNER)
    assert status.status_code == 200
    assert status.json() == {
        "fixtureId": "access-renewal-expiring",
        "productId": str(ACCESS_RENEWAL_PRODUCT_ID),
        "productTitle": "ESTV-Steuerstatistik nach Kanton",
        "state": "notPrepared",
        "asOfDate": status.json()["asOfDate"],
        "validFrom": None,
        "validUntil": None,
        "daysUntilExpiry": None,
        "openRenewalCount": 0,
        "activePolicyRevision": 1,
    }
    assert client.post(f"{FIXTURE_URL}/prepare", headers=CONSUMER, json={}).status_code == 403

    prepared = prepare(client)
    assert prepared["state"] == "ready"
    assert prepared["activePolicyRevision"] == 2
    assert prepared["daysUntilExpiry"] == 14
    assert date.fromisoformat(prepared["validUntil"]) == date.fromisoformat(
        prepared["asOfDate"]
    ) + timedelta(days=14)
    # Prepare is deliberately idempotent only while an owned fixture policy is active.
    assert prepare(client) == prepared

    with session_factory() as session:
        baseline = session.get(PolicyRevision, ACCESS_RENEWAL_BASE_POLICY_ID)
        fixture = session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID)
        source = session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID)
        assert baseline is not None and baseline.definition == original_definition
        assert fixture is not None and fixture.status == "published"
        assert source is not None
        assert source.decision_policy_revision_id == fixture.id
        deployments = list(
            session.scalars(
                select(PolicyDeployment).where(PolicyDeployment.policy_revision_id == fixture.id)
            )
        )
        assert {(item.target, item.state) for item in deployments} == {
            ("opa", "pending"),
            ("postgresql", "deployed"),
        }


@pytest.mark.parametrize("inconsistency", ["missing", "invalid"])
def test_owned_access_projection_fails_closed_for_invalid_active_policy(
    client, session_factory, inconsistency
):
    with session_factory() as session:
        product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
        baseline = session.get(PolicyRevision, ACCESS_RENEWAL_BASE_POLICY_ID)
        assert product is not None and baseline is not None
        if inconsistency == "missing":
            product.active_policy_revision = 999
        else:
            invalid_definition = copy.deepcopy(baseline.definition)
            invalid_definition["effect"] = "invalid"
            baseline.definition = invalid_definition
        session.commit()

    response = client.get("/api/v1/access-consumers/owned", headers=OWNER)
    assert response.status_code == 503
    assert response.json()["detail"] == "Active access policy is unavailable"


def test_fixture_prepare_and_reset_fail_closed_without_postgres_confirmation(
    client, session_factory, monkeypatch
):
    monkeypatch.setattr(
        access_renewals,
        "project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "pending", error="projection not confirmed"
        ),
    )
    failed_prepare = client.post(f"{FIXTURE_URL}/prepare", headers=OWNER, json={})
    assert failed_prepare.status_code == 503
    assert client.get(FIXTURE_URL, headers=OWNER).json()["state"] == "notPrepared"
    with session_factory() as session:
        product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
        assert product is not None and product.active_policy_revision == 1
        assert session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID) is None
        assert session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID) is None

    monkeypatch.setattr(
        access_renewals,
        "project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )
    prepare(client)
    renewal = submit_renewal(client)
    monkeypatch.setattr(
        access_renewals,
        "project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "failed", error="baseline projection rejected"
        ),
    )
    failed_reset = client.post(
        f"{FIXTURE_URL}/reset",
        headers=OWNER,
        json={"confirmationName": "ESTV-Steuerstatistik nach Kanton"},
    )
    assert failed_reset.status_code == 503
    with session_factory() as session:
        product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
        assert product is not None and product.active_policy_revision == 2
        assert session.get(AccessRequest, uuid.UUID(renewal["id"])) is not None
        assert (
            session.scalar(
                select(AuditEvent.id).where(AuditEvent.action == "access-renewal-fixture-reset")
            )
            is None
        )


def test_raw_policy_evidence_is_owner_or_control_person_only(client, session_factory):
    prepare(client)
    private_values = {
        "private-policy-group",
        "private-policy-member",
        "private-policy-creator",
        "private-generated-rego",
        "private deployment failure",
    }
    with session_factory() as session:
        policy = session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID)
        assert policy is not None
        definition = copy.deepcopy(policy.definition)
        definition["subjects"]["groupIds"] = ["private-policy-group"]
        definition["grants"].append(
            {
                "subject": {"type": "group", "id": "private-policy-group"},
                "actions": ["data.read"],
                "protocols": ["http"],
                "validFrom": "0001-01-01",
                "validUntil": "9999-12-31",
                "dataVariant": "modified",
                "groupSnapshot": {
                    "groupId": "private-policy-group",
                    "membershipRevision": 42,
                    "memberIds": ["beat.stalder", "private-policy-member"],
                },
            }
        )
        policy.definition = definition
        policy.created_by = "private-policy-creator"
        policy.generated_rego = "private-generated-rego"
        deployment = session.scalar(
            select(PolicyDeployment).where(
                PolicyDeployment.policy_revision_id == policy.id,
                PolicyDeployment.target == "opa",
            )
        )
        assert deployment is not None
        deployment.error = "private deployment failure"
        session.commit()

    paths = (
        f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/policies",
        f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/policies/latest",
        f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/policy-deployments",
    )
    for headers in (
        {"X-DaCa-User": ""},
        CONSUMER,
        {"X-DaCa-User": "daca-test-editor"},
    ):
        for path in paths:
            denied = client.get(path, headers=headers)
            assert denied.status_code == 403
            assert all(value not in denied.text for value in private_values)

    for headers in (OWNER, CONTROL_PERSON):
        visible_policy = client.get(paths[1], headers=headers)
        assert visible_policy.status_code == 200
        assert all(value in visible_policy.text for value in private_values)
        visible_deployments = client.get(paths[2], headers=headers)
        assert visible_deployments.status_code == 200
        assert "private deployment failure" in visible_deployments.text


def test_effective_access_uses_zurich_boundary_and_exact_policy_evidence(
    client, session_factory, monkeypatch
):
    # 22:30 UTC is the next civil day in Zurich in summer.
    monkeypatch.setattr(
        access_renewals,
        "utc_now",
        lambda: datetime(2026, 8, 12, 22, 30, tzinfo=UTC),
    )
    prepared = prepare(client)
    assert prepared["asOfDate"] == "2026-08-13"
    assert prepared["validUntil"] == "2026-08-27"

    with session_factory() as session:
        source = session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID)
        assert source is not None
        impostor = AccessRequest(
            id=uuid.uuid4(),
            request_number="ZA-2026-WRONG-EVIDENCE",
            data_product_id=source.data_product_id,
            requester_id=source.requester_id,
            requester_name="Falscher Workflow-Beleg",
            requester_organization=source.requester_organization,
            contact_email=source.contact_email,
            consumer_type=source.consumer_type,
            purpose="Diese fachliche Begründung darf nicht als Quelle ausgewählt werden.",
            legal_basis="Nicht die Rechtsgrundlage des aktiven Policy-Belegs",
            requested_protocol=source.requested_protocol,
            requested_variant=source.requested_variant,
            valid_from=source.valid_from,
            valid_until=source.valid_until,
            status=source.status,
            fulfillment_subject_type=source.fulfillment_subject_type,
            fulfillment_subject_id=source.fulfillment_subject_id,
            decision_policy_revision_id=ACCESS_RENEWAL_BASE_POLICY_ID,
            granted_variant=source.granted_variant,
            request_kind="initial",
            created_at=datetime(2026, 8, 13, 10, tzinfo=UTC),
            updated_at=datetime(2026, 8, 13, 10, tzinfo=UTC),
        )
        session.add(impostor)
        session.commit()

    response = client.get(EFFECTIVE_URL, headers=CONSUMER)
    assert response.status_code == 200
    payload = response.json()
    assert payload["asOfDate"] == "2026-08-13"
    assert payload["policyRevision"] == 2
    grant = payload["grants"][0]
    assert grant["expiresInDays"] == 14
    assert grant["sourceRequestId"] == str(ACCESS_RENEWAL_SOURCE_REQUEST_ID)
    assert grant["sourceRequestNumber"] == "ZA-2026-RENEW-BASE"
    assert grant["renewalEligibility"] == {
        "eligible": True,
        "reason": "eligible",
        "renewalRequestId": None,
    }
    for private_value in (
        "beat.stalder",
        "Falscher Workflow-Beleg",
        "Nicht die Rechtsgrundlage",
    ):
        assert private_value not in response.text


def test_renewal_copies_immutable_context_rejects_scope_fields_and_guards_duplicates(
    client, session_factory
):
    prepare(client)
    grant = effective_grant(client)
    invalid_scope = client.post(
        RENEWAL_URL,
        headers=CONSUMER,
        json={
            "sourceGrantId": grant["grantId"],
            "purpose": NEW_PURPOSE,
            "validUntil": "2027-12-31",
            "conditionsAccepted": True,
            "protocols": ["http", "postgresql"],
        },
    )
    assert invalid_scope.status_code == 422

    renewal = submit_renewal(client)
    assert renewal["requestKind"] == "renewal"
    assert renewal["renewalOfRequestId"] == str(ACCESS_RENEWAL_SOURCE_REQUEST_ID)
    assert renewal["renewalOfRequestNumber"] == "ZA-2026-RENEW-BASE"
    context = renewal["renewalContext"]
    assert context["sourceGrantId"] == grant["grantId"]
    assert context["policyRevision"] == 2
    assert context["subject"] == {"type": "person", "id": "beat.stalder"}
    assert context["actions"] == ["data.read"]
    assert context["protocols"] == ["http"]
    assert context["dataVariant"] == "modified"
    assert context["validUntil"] == grant["validUntil"]
    assert context["purpose"] == grant["purpose"]
    assert context["legalBasis"] == "Amtshilfe zwischen Behörden"
    assert renewal["purpose"] == NEW_PURPOSE
    assert renewal["legalBasis"] == context["legalBasis"]

    duplicate = client.post(
        RENEWAL_URL,
        headers=CONSUMER,
        json={
            "sourceGrantId": grant["grantId"],
            "purpose": NEW_PURPOSE,
            "validUntil": "2028-12-31",
            "conditionsAccepted": True,
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "A renewal for this grant is already in progress"

    with session_factory() as session:
        stored = session.get(AccessRequest, uuid.UUID(renewal["id"]))
        assert stored is not None
        simultaneous = AccessRequest(
            id=uuid.uuid4(),
            request_number="ZA-2026-CONCURRENT",
            data_product_id=stored.data_product_id,
            requester_id=stored.requester_id,
            requester_name=stored.requester_name,
            requester_organization=stored.requester_organization,
            contact_email=stored.contact_email,
            consumer_type=stored.consumer_type,
            purpose=stored.purpose,
            legal_basis=stored.legal_basis,
            requested_protocol=stored.requested_protocol,
            requested_variant=stored.requested_variant,
            valid_from=stored.valid_from,
            valid_until=stored.valid_until + timedelta(days=1),
            status="submitted",
            request_kind="renewal",
            renewal_of_request_id=stored.renewal_of_request_id,
            renewal_context=copy.deepcopy(stored.renewal_context),
        )
        session.add(simultaneous)
        with pytest.raises(IntegrityError):
            session.flush()

    owner_rejected = client.post(
        f"/api/v1/access-requests/{renewal['id']}/decision",
        headers=OWNER,
        json={
            "decision": "reject",
            "comment": "Verlängerung ist fachlich nicht mehr erforderlich.",
        },
    )
    assert owner_rejected.status_code == 200
    assert owner_rejected.json()["request"]["status"] == "rejected"
    assert effective_grant(client)["renewalEligibility"]["eligible"] is True
    assert submit_renewal(client, valid_until="2028-12-31")["status"] == "submitted"


def test_owner_cannot_expand_scope_and_four_eyes_rejection_releases_new_renewal(
    client, session_factory
):
    prepare(client)
    renewal = submit_renewal(client)
    with session_factory() as session:
        stored = session.get(AccessRequest, uuid.UUID(renewal["id"]))
        assert stored is not None
        stored.requested_protocol = "both"
        session.commit()
    expanded = client.post(
        f"/api/v1/access-requests/{renewal['id']}/decision",
        headers=OWNER,
        json={"decision": "approve", "grantedVariant": "modified"},
    )
    assert expanded.status_code == 422
    with session_factory() as session:
        stored = session.get(AccessRequest, uuid.UUID(renewal["id"]))
        assert stored is not None
        stored.requested_protocol = "http"
        session.commit()

    owner_result = owner_approves(client, renewal)
    policy = owner_result["policy"]
    submission = owner_result["governanceSubmission"]
    duplicate_decision = client.post(
        f"/api/v1/access-requests/{renewal['id']}/decision",
        headers=OWNER,
        json={"decision": "approve", "grantedVariant": "modified"},
    )
    assert duplicate_decision.status_code == 409
    assert duplicate_decision.json()["detail"] == "Only an open access request can be decided"
    with session_factory() as session:
        duplicate_policies = list(
            session.scalars(
                select(PolicyRevision).where(
                    PolicyRevision.data_product_id == ACCESS_RENEWAL_PRODUCT_ID,
                    PolicyRevision.revision == policy["revision"],
                )
            )
        )
        duplicate_submissions = list(
            session.scalars(
                select(GovernanceSubmission).where(
                    GovernanceSubmission.policy_revision_id == uuid.UUID(policy["id"])
                )
            )
        )
        assert len(duplicate_policies) == len(duplicate_submissions) == 1
    assert submission["reviewSnapshot"]["workflowKind"] == "access_renewal"
    assert submission["reviewSnapshot"]["renewal"]["originalGrant"] == renewal["renewalContext"]
    assert submission["reviewSnapshot"]["renewal"]["requestedPurpose"] == NEW_PURPOSE

    with session_factory() as session:
        fixture = session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID)
        assert fixture is not None
        old_definition = copy.deepcopy(fixture.definition)
    new_definition = copy.deepcopy(policy["definition"])
    old_beat = next(
        item for item in old_definition["grants"] if item["subject"]["id"] == "beat.stalder"
    )
    new_beat = next(
        item for item in new_definition["grants"] if item["subject"]["id"] == "beat.stalder"
    )
    assert new_beat["validUntil"] == renewal["validUntil"]
    new_beat["validUntil"] = old_beat["validUntil"]
    # Pydantic fills explicit optional nulls in the API response; compare normalized forms.
    from daca_catalog.schemas import PolicyDefinition

    assert PolicyDefinition.model_validate(new_definition) == PolicyDefinition.model_validate(
        old_definition
    )
    assert product_state(session_factory) == (2, True, "active")
    assert effective_grant(client)["validUntil"] == renewal["renewalContext"]["validUntil"]

    # Neither an unrelated actor nor the owner may supersede the reviewed
    # revision through a legacy policy route while this submission is active.
    outsider_draft = client.post(
        f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/policies",
        headers={"X-DaCa-User": "daca-test-editor", "If-Match": '"3"'},
        json={"definition": policy["definition"]},
    )
    assert outsider_draft.status_code == 403
    owner_draft = client.post(
        f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/policies",
        headers={**OWNER, "If-Match": '"3"'},
        json={"definition": policy["definition"]},
    )
    assert owner_draft.status_code == 409
    assert "active governance submission" in owner_draft.json()["detail"]
    outsider_publish = client.post(
        f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/policies/{policy['id']}/publish",
        headers={"X-DaCa-User": "daca-test-editor", "If-Match": '"3"'},
    )
    assert outsider_publish.status_code == 403
    assert product_state(session_factory) == (2, True, "active")

    rejected = governance_decision(client, submission, "reject")
    assert rejected["status"] == "rejected"
    assert product_state(session_factory) == (2, True, "active")
    with session_factory() as session:
        stored = session.get(AccessRequest, uuid.UUID(renewal["id"]))
        assert stored is not None and stored.status == "rejected"
        tasks = list(
            session.scalars(select(WorkflowTask).where(WorkflowTask.access_request_id == stored.id))
        )
        assert tasks and all(item.status == "completed" for item in tasks)
    assert effective_grant(client)["renewalEligibility"]["eligible"] is True
    assert submit_renewal(client, valid_until="2028-12-31")["status"] == "submitted"


@pytest.mark.parametrize(
    ("winner", "loser", "expected_status", "expected_action"),
    [
        (
            "approve",
            "reject",
            "approved_deploying",
            "access-renewal-approved-deployment-started",
        ),
        ("reject", "approve", "rejected", "access-renewal-rejected"),
    ],
)
def test_governance_decision_lock_makes_stale_competitor_lose(
    client,
    session_factory,
    winner,
    loser,
    expected_status,
    expected_action,
):
    prepare(client)
    renewal = submit_renewal(client)
    owner_result = owner_approves(client, renewal)
    submission = owner_result["governanceSubmission"]
    decision_url = f"/api/v1/governance-submissions/{submission['id']}/decision"
    stale_headers = {**CONTROL_PERSON, "If-Match": f'"{submission["revision"]}"'}

    won = client.post(
        decision_url,
        headers=stale_headers,
        json={
            "decision": winner,
            "policyRevision": submission["policyRevision"],
            "comment": "Erster atomarer Kontrollentscheid.",
        },
    )
    assert won.status_code == 200, won.text
    assert won.json()["status"] == expected_status
    lost = client.post(
        decision_url,
        headers=stale_headers,
        json={
            "decision": loser,
            "policyRevision": submission["policyRevision"],
            "comment": "Konkurrierender veralteter Kontrollentscheid.",
        },
    )
    assert lost.status_code == 412

    with session_factory() as session:
        stored = session.get(GovernanceSubmission, uuid.UUID(submission["id"]))
        assert stored is not None
        assert stored.status == expected_status
        assert stored.revision == won.json()["revision"] == 2
        decision_events = list(
            session.scalars(
                select(AuditEvent).where(
                    AuditEvent.resource_id == submission["id"],
                    AuditEvent.action.in_(
                        (
                            "access-renewal-approved-deployment-started",
                            "access-renewal-rejected",
                        )
                    ),
                )
            )
        )
        assert [event.action for event in decision_events] == [expected_action]


def test_renewal_switches_active_policy_only_after_opa_and_postgres_converge(
    client, session_factory, monkeypatch
):
    prepare(client)
    renewal = submit_renewal(client)
    owner_result = owner_approves(client, renewal)
    submission = owner_result["governanceSubmission"]
    policy = owner_result["policy"]
    old_until = renewal["renewalContext"]["validUntil"]
    preserved_state = product_state(session_factory)

    projection_calls: list[int] = []

    def deployed_projection(settings, product_id, revision, definition):
        projection_calls.append(revision)
        return ProjectionResult("deployed", observed_revision=revision)

    monkeypatch.setattr("daca_catalog.governance.project_to_postgresql", deployed_projection)
    approved = governance_decision(client, submission)
    assert approved["status"] == "approved_deploying"
    assert product_state(session_factory) == preserved_state == (2, True, "active")
    assert projection_calls == []
    assert effective_grant(client)["validUntil"] == old_until
    with session_factory() as session:
        deployments = list(
            session.scalars(
                select(PolicyDeployment).where(
                    PolicyDeployment.policy_revision_id == uuid.UUID(policy["id"])
                )
            )
        )
        assert {(item.target, item.state) for item in deployments} == {
            ("opa", "pending"),
            ("postgresql", "pending"),
        }

    opa_failed = acknowledge(
        client, policy["id"], policy["revision"], "failed", "OPA bundle rejected"
    )
    assert opa_failed.status_code == 200
    assert projection_calls == []  # PostgreSQL never received the extension.
    assert product_state(session_factory) == preserved_state
    assert effective_grant(client)["validUntil"] == old_until
    failed_submission = client.get(
        f"/api/v1/governance-submissions/{submission['id']}", headers=CONTROL_PERSON
    ).json()
    assert failed_submission["status"] == "deployment_failed"
    failed_revision = failed_submission["revision"]
    replayed_failure = acknowledge(
        client, policy["id"], policy["revision"], "failed", "OPA bundle rejected"
    )
    assert replayed_failure.status_code == 200
    replayed_submission = client.get(
        f"/api/v1/governance-submissions/{submission['id']}", headers=CONTROL_PERSON
    ).json()
    assert replayed_submission["revision"] == failed_revision
    losing_success = acknowledge(client, policy["id"], policy["revision"], "deployed")
    assert losing_success.status_code == 200
    assert losing_success.json()["state"] == "failed"
    with session_factory() as session:
        failure_events = list(
            session.scalars(
                select(AuditEvent).where(
                    AuditEvent.resource_id == submission["id"],
                    AuditEvent.action == "access-renewal-deployment-failed",
                )
            )
        )
        assert len(failure_events) == 1
    pending_grant = effective_grant(client)
    assert pending_grant["renewalEligibility"] == {
        "eligible": False,
        "reason": "pending",
        "renewalRequestId": renewal["id"],
    }
    duplicate_while_retryable = client.post(
        RENEWAL_URL,
        headers=CONSUMER,
        json={
            "sourceGrantId": pending_grant["grantId"],
            "purpose": NEW_PURPOSE,
            "validUntil": "2028-12-31",
            "conditionsAccepted": True,
        },
    )
    assert duplicate_while_retryable.status_code == 409

    beat_grant = next(
        grant
        for grant in policy["definition"]["grants"]
        if grant["subject"] == {"type": "person", "id": "beat.stalder"}
    )
    generic_while_retryable = client.post(
        f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/governance-submissions",
        headers=OWNER,
        json={
            "discoverable": True,
            "discoverabilityConfirmed": True,
            "grants": [beat_grant],
            "barArchive": {"enabled": False, "retentionYears": 20},
        },
    )
    assert generic_while_retryable.status_code == 409
    assert generic_while_retryable.json()["detail"] == (
        "An active governance submission already exists"
    )

    retried = governance_decision(client, failed_submission)
    assert retried["status"] == "approved_deploying"

    monkeypatch.setattr(
        "daca_catalog.governance.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "pending", error="PostgreSQL projector unavailable"
        ),
    )
    pg_failed = acknowledge(client, policy["id"], policy["revision"], "deployed")
    assert pg_failed.status_code == 200
    assert product_state(session_factory) == preserved_state
    assert effective_grant(client)["validUntil"] == old_until
    failed_submission = client.get(
        f"/api/v1/governance-submissions/{submission['id']}", headers=CONTROL_PERSON
    ).json()
    assert failed_submission["status"] == "deployment_failed"
    with session_factory() as session:
        postgres = session.scalar(
            select(PolicyDeployment).where(
                PolicyDeployment.policy_revision_id == uuid.UUID(policy["id"]),
                PolicyDeployment.target == "postgresql",
            )
        )
        assert postgres is not None and postgres.state == "failed"

    retried = governance_decision(client, failed_submission)
    monkeypatch.setattr("daca_catalog.governance.project_to_postgresql", deployed_projection)
    converged = acknowledge(client, policy["id"], policy["revision"], "deployed")
    assert converged.status_code == 200
    final_submission = client.get(
        f"/api/v1/governance-submissions/{submission['id']}", headers=CONTROL_PERSON
    ).json()
    assert final_submission["status"] == "approved"
    final_submission_revision = final_submission["revision"]
    replayed_success = acknowledge(client, policy["id"], policy["revision"], "deployed")
    assert replayed_success.status_code == 200
    replayed_submission = client.get(
        f"/api/v1/governance-submissions/{submission['id']}", headers=CONTROL_PERSON
    ).json()
    assert replayed_submission["revision"] == final_submission_revision
    losing_failure = acknowledge(
        client, policy["id"], policy["revision"], "failed", "late conflicting result"
    )
    assert losing_failure.status_code == 200
    assert losing_failure.json()["state"] == "deployed"
    assert projection_calls == [policy["revision"]]
    with session_factory() as session:
        activation_events = list(
            session.scalars(
                select(AuditEvent).where(
                    AuditEvent.resource_id == submission["id"],
                    AuditEvent.action == "access-renewal-deployment-confirmed",
                )
            )
        )
        assert len(activation_events) == 1
    assert product_state(session_factory) == (policy["revision"], True, "active")
    final_grant = effective_grant(client)
    assert final_grant["validUntil"] == renewal["validUntil"]
    assert final_grant["sourceRequestId"] == renewal["id"]
    with session_factory() as session:
        stored = session.get(AccessRequest, uuid.UUID(renewal["id"]))
        assert stored is not None and stored.status == "granted_modified"
        tasks = list(
            session.scalars(select(WorkflowTask).where(WorkflowTask.access_request_id == stored.id))
        )
        assert tasks and all(item.status == "completed" for item in tasks)

    before_reset_bundle = client.get("/api/v1/opa/bundles/catalog.tar.gz")
    # The sample target rejects stale revisions. Model that monotonic contract
    # so a reset cannot accidentally reuse fixture revision 2 after revision 3.
    projected_runtime: dict = {"revision": policy["revision"]}

    def restore_fixture_runtime(settings, product_id, revision, definition):
        if revision <= projected_runtime["revision"]:
            return ProjectionResult("failed", error="stale policy revision")
        projected_runtime.update(
            {
                "productId": str(product_id),
                "revision": revision,
                "definition": copy.deepcopy(definition),
            }
        )
        return ProjectionResult("deployed", observed_revision=revision)

    monkeypatch.setattr(access_renewals, "project_to_postgresql", restore_fixture_runtime)
    reset = client.post(
        f"{FIXTURE_URL}/reset",
        headers=OWNER,
        json={"confirmationName": "ESTV-Steuerstatistik nach Kanton"},
    )
    assert reset.status_code == 200, reset.text
    assert projected_runtime["revision"] > policy["revision"]
    assert reset.json()["activePolicyRevision"] == projected_runtime["revision"]
    projected_beat = next(
        item
        for item in projected_runtime["definition"]["grants"]
        if item["subject"] == {"type": "person", "id": "beat.stalder"}
    )
    assert projected_beat["validUntil"] == reset.json()["validUntil"]

    restored_bundle = client.get(
        "/api/v1/opa/bundles/catalog.tar.gz",
        headers={"If-None-Match": before_reset_bundle.headers["etag"]},
    )
    assert restored_bundle.status_code == 200
    with tarfile.open(fileobj=io.BytesIO(restored_bundle.content), mode="r:gz") as bundle:
        data = json.load(bundle.extractfile("data.json"))
    restored_policy = next(
        item
        for item in data["daca"]["policies"]
        if item["productId"] == str(ACCESS_RENEWAL_PRODUCT_ID)
    )
    assert restored_policy["revision"] == projected_runtime["revision"]
    restored_beat = next(
        item
        for item in restored_policy["grants"]
        if item["subject"] == {"type": "person", "id": "beat.stalder"}
    )
    assert restored_beat["validUntil"] == reset.json()["validUntil"]
    with session_factory() as session:
        product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
        assert product is not None
        restored_revision = session.scalar(
            select(PolicyRevision).where(
                PolicyRevision.data_product_id == product.id,
                PolicyRevision.revision == product.active_policy_revision,
            )
        )
        assert restored_revision is not None
        deployments = list(
            session.scalars(
                select(PolicyDeployment).where(
                    PolicyDeployment.policy_revision_id == restored_revision.id
                )
            )
        )
        assert {(item.target, item.state) for item in deployments} == {
            ("opa", "pending"),
            ("postgresql", "deployed"),
        }


def test_opa_status_replay_projects_renewal_to_postgres_once(client, session_factory, monkeypatch):
    prepare(client)
    renewal = submit_renewal(client)
    owner_result = owner_approves(client, renewal)
    submission = owner_result["governanceSubmission"]
    policy = owner_result["policy"]
    assert governance_decision(client, submission)["status"] == "approved_deploying"

    projection_calls: list[int] = []

    def project_once(settings, product_id, revision, definition):
        projection_calls.append(revision)
        return ProjectionResult("deployed", observed_revision=revision)

    monkeypatch.setattr("daca_catalog.governance.project_to_postgresql", project_once)
    bundle_response = client.get("/api/v1/opa/bundles/catalog.tar.gz")
    with tarfile.open(fileobj=io.BytesIO(bundle_response.content), mode="r:gz") as bundle:
        manifest = json.load(bundle.extractfile(".manifest"))
    status_payload = {"bundles": {"daca": {"active_revision": manifest["revision"]}}}

    first = client.post(
        "/api/v1/internal/opa/status",
        headers=INTERNAL,
        json=status_payload,
    )
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "observed"
    assert projection_calls == [policy["revision"]]
    second = client.post(
        "/api/v1/internal/opa/status",
        headers=INTERNAL,
        json=status_payload,
    )
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "observed"
    assert second.json()["deploymentsAcknowledged"] == 0
    assert projection_calls == [policy["revision"]]

    final = client.get(
        f"/api/v1/governance-submissions/{submission['id']}", headers=CONTROL_PERSON
    ).json()
    assert final["status"] == "approved"
    assert product_state(session_factory) == (policy["revision"], True, "active")
    with session_factory() as session:
        activation_events = list(
            session.scalars(
                select(AuditEvent).where(
                    AuditEvent.resource_id == submission["id"],
                    AuditEvent.action == "access-renewal-deployment-confirmed",
                )
            )
        )
        assert len(activation_events) == 1


def test_rejected_failed_renewal_ignores_late_deployment_ack(client, session_factory, monkeypatch):
    prepare(client)
    old_grant = effective_grant(client)
    renewal = submit_renewal(client)
    owner_result = owner_approves(client, renewal)
    submission = owner_result["governanceSubmission"]
    policy = owner_result["policy"]
    monkeypatch.setattr(
        "daca_catalog.governance.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )
    assert governance_decision(client, submission)["status"] == "approved_deploying"
    assert (
        acknowledge(
            client, policy["id"], policy["revision"], "failed", "OPA bundle rejected"
        ).status_code
        == 200
    )
    failed = client.get(
        f"/api/v1/governance-submissions/{submission['id']}", headers=CONTROL_PERSON
    ).json()
    assert failed["status"] == "deployment_failed"

    rejected = governance_decision(client, failed, "reject")
    assert rejected["status"] == "rejected"
    rejected_revision = rejected["revision"]
    late = acknowledge(client, policy["id"], policy["revision"], "deployed")
    assert late.status_code == 200
    assert late.json()["state"] == "failed"
    unchanged = client.get(
        f"/api/v1/governance-submissions/{submission['id']}", headers=CONTROL_PERSON
    ).json()
    assert unchanged["status"] == "rejected"
    assert unchanged["revision"] == rejected_revision
    assert product_state(session_factory) == (2, True, "active")
    assert effective_grant(client)["validUntil"] == old_grant["validUntil"]
    with session_factory() as session:
        candidate = session.get(PolicyRevision, uuid.UUID(policy["id"]))
        assert candidate is not None and candidate.status == "revoked"
        activation_events = list(
            session.scalars(
                select(AuditEvent).where(
                    AuditEvent.resource_id == submission["id"],
                    AuditEvent.action == "access-renewal-deployment-confirmed",
                )
            )
        )
        assert activation_events == []


def test_fixture_reset_deletes_only_its_request_chain_and_preserves_unrelated_artifacts(
    client, session_factory
):
    prepare(client)
    fixture_renewal = submit_renewal(client)
    owner_result = owner_approves(client, fixture_renewal)
    fixture_policy_id = uuid.UUID(owner_result["policy"]["id"])
    fixture_submission_id = uuid.UUID(owner_result["governanceSubmission"]["id"])

    unrelated_source_id = uuid.uuid4()
    unrelated_renewal_id = uuid.uuid4()
    unrelated_policy_id = uuid.uuid4()
    unrelated_submission_id = uuid.uuid4()
    unrelated_task_id = uuid.uuid4()
    descendant_id = uuid.uuid4()
    now = datetime.now(UTC)
    with session_factory() as session:
        session.add(
            PolicyRevision(
                id=unrelated_policy_id,
                data_product_id=ACCESS_RENEWAL_PRODUCT_ID,
                revision=99,
                status="draft",
                definition=copy.deepcopy(
                    session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID).definition
                ),
                generated_rego="package daca.authz\n",
                created_by="unrelated.owner",
            )
        )
        session.flush()
        common = {
            "data_product_id": ACCESS_RENEWAL_PRODUCT_ID,
            "requester_id": "unrelated.consumer",
            "requester_name": "Unrelated Consumer",
            "requester_organization": "Unrelated Organization",
            "contact_email": "unrelated@example.invalid",
            "consumer_type": "person",
            "purpose": "Unabhängiger Workflow, der beim Fixture-Reset erhalten bleiben muss.",
            "legal_basis": "Unabhängige Testgrundlage für die Reset-Isolation",
            "requested_protocol": "http",
            "requested_variant": "modified",
            "valid_from": date(2026, 1, 1),
            "valid_until": date(2026, 12, 31),
            "created_at": now,
            "updated_at": now,
        }
        session.add_all(
            [
                AccessRequest(
                    id=unrelated_source_id,
                    request_number="ZA-UNRELATED-SOURCE",
                    status="rejected",
                    request_kind="initial",
                    **common,
                ),
                AccessRequest(
                    id=unrelated_renewal_id,
                    request_number="ZA-UNRELATED-RENEWAL",
                    status="rejected",
                    request_kind="renewal",
                    renewal_of_request_id=unrelated_source_id,
                    renewal_context={"fixture": False},
                    **common,
                ),
                AccessRequest(
                    id=descendant_id,
                    request_number="ZA-FIXTURE-DESCENDANT",
                    status="rejected",
                    request_kind="renewal",
                    renewal_of_request_id=uuid.UUID(fixture_renewal["id"]),
                    renewal_context={"fixture": True},
                    **common,
                ),
            ]
        )
        session.flush()
        session.add(
            GovernanceSubmission(
                id=unrelated_submission_id,
                data_product_id=ACCESS_RENEWAL_PRODUCT_ID,
                policy_revision_id=unrelated_policy_id,
                owner_user_id="kassandra.valdata",
                approver_user_id="thomas.kriegli",
                status="rejected",
                revision=1,
                review_snapshot={"workflowKind": "unrelated"},
                archive_evidence={},
                decision="reject",
                submitted_at=now,
                decided_at=now,
                updated_at=now,
            )
        )
        session.flush()
        session.add(
            WorkflowTask(
                id=unrelated_task_id,
                task_type="access_request_review",
                status="open",
                assignee_user_id="kassandra.valdata",
                data_product_id=ACCESS_RENEWAL_PRODUCT_ID,
                access_request_id=unrelated_renewal_id,
                governance_submission_id=unrelated_submission_id,
                title="Unabhängige Aufgabe",
                detail="Darf beim Fixture-Reset nicht gelöscht werden.",
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()

    reset = client.post(
        f"{FIXTURE_URL}/reset",
        headers=OWNER,
        json={"confirmationName": "ESTV-Steuerstatistik nach Kanton"},
    )
    assert reset.status_code == 200, reset.text
    assert reset.json()["state"] == "ready"
    assert reset.json()["openRenewalCount"] == 0
    assert reset.json()["activePolicyRevision"] > 99

    with session_factory() as session:
        assert session.get(AccessRequest, uuid.UUID(fixture_renewal["id"])) is None
        assert session.get(AccessRequest, descendant_id) is None
        assert session.get(PolicyRevision, fixture_policy_id) is None
        assert session.get(GovernanceSubmission, fixture_submission_id) is None
        assert session.get(AccessRequest, unrelated_source_id) is not None
        assert session.get(AccessRequest, unrelated_renewal_id) is not None
        assert session.get(PolicyRevision, unrelated_policy_id) is not None
        assert session.get(GovernanceSubmission, unrelated_submission_id) is not None
        assert session.get(WorkflowTask, unrelated_task_id) is not None
        product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
        source = session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID)
        assert product is not None and source is not None
        restored_policy = session.scalar(
            select(PolicyRevision).where(
                PolicyRevision.data_product_id == product.id,
                PolicyRevision.revision == product.active_policy_revision,
            )
        )
        assert restored_policy is not None
        assert restored_policy.created_by == "daca-fixture"
        assert source.decision_policy_revision_id == restored_policy.id
        reset_event = session.scalar(
            select(AuditEvent)
            .where(AuditEvent.action == "access-renewal-fixture-reset")
            .order_by(AuditEvent.occurred_at.desc())
        )
        assert reset_event is not None
        assert reset_event.details == {
            "fixtureId": "access-renewal-expiring",
            "validUntil": reset.json()["validUntil"],
        }


@pytest.mark.parametrize(
    "submission_status",
    [None, "pending_approval", "approved_deploying", "deployment_failed"],
)
def test_fixture_reset_blocks_unrelated_open_policy_work_without_runtime_change(
    client, session_factory, monkeypatch, submission_status
):
    prepare(client)
    policy_id = uuid.uuid4()
    submission_id = uuid.uuid4()
    now = datetime.now(UTC)
    with session_factory() as session:
        fixture = session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID)
        assert fixture is not None
        policy_status = "draft" if submission_status in {None, "pending_approval"} else "published"
        session.add(
            PolicyRevision(
                id=policy_id,
                data_product_id=ACCESS_RENEWAL_PRODUCT_ID,
                revision=99,
                status=policy_status,
                definition=copy.deepcopy(fixture.definition),
                generated_rego=fixture.generated_rego,
                created_by="unrelated.owner",
                published_at=now if policy_status == "published" else None,
            )
        )
        session.flush()
        if submission_status is not None:
            session.add(
                GovernanceSubmission(
                    id=submission_id,
                    data_product_id=ACCESS_RENEWAL_PRODUCT_ID,
                    policy_revision_id=policy_id,
                    owner_user_id="joel.ruod",
                    approver_user_id="thomas.kriegli",
                    status=submission_status,
                    revision=1,
                    review_snapshot={
                        "workflowKind": "unrelated",
                        "dataProduct": {"revision": 1},
                    },
                    archive_evidence={},
                    decision=(
                        "approve"
                        if submission_status in {"approved_deploying", "deployment_failed"}
                        else None
                    ),
                    submitted_at=now,
                    decided_at=(
                        now
                        if submission_status in {"approved_deploying", "deployment_failed"}
                        else None
                    ),
                    updated_at=now,
                )
            )
        session.commit()

    before_bundle = client.get("/api/v1/opa/bundles/catalog.tar.gz")
    projection_calls: list[int] = []

    def must_not_project(settings, product_id, revision, definition):
        projection_calls.append(revision)
        return ProjectionResult("deployed", observed_revision=revision)

    monkeypatch.setattr(access_renewals, "project_to_postgresql", must_not_project)
    blocked = client.post(
        f"{FIXTURE_URL}/reset",
        headers=OWNER,
        json={"confirmationName": "ESTV-Steuerstatistik nach Kanton"},
    )
    assert blocked.status_code == 409
    assert projection_calls == []
    unchanged_bundle = client.get(
        "/api/v1/opa/bundles/catalog.tar.gz",
        headers={"If-None-Match": before_bundle.headers["etag"]},
    )
    assert unchanged_bundle.status_code == 304
    with session_factory() as session:
        product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
        assert product is not None and product.active_policy_revision == 2
        policy = session.get(PolicyRevision, policy_id)
        assert policy is not None and policy.revision == 99
        if submission_status is not None:
            submission = session.get(GovernanceSubmission, submission_id)
            assert submission is not None and submission.status == submission_status
        assert session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID) is not None
        assert (
            session.scalar(
                select(AuditEvent.id).where(AuditEvent.action == "access-renewal-fixture-reset")
            )
            is None
        )


def test_fixture_reset_blocks_an_unrelated_active_policy(client, session_factory):
    prepare(client)
    unrelated_policy_id = uuid.uuid4()
    with session_factory() as session:
        product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
        fixture = session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID)
        assert product is not None and fixture is not None
        session.add(
            PolicyRevision(
                id=unrelated_policy_id,
                data_product_id=product.id,
                revision=99,
                status="published",
                definition=copy.deepcopy(fixture.definition),
                generated_rego=fixture.generated_rego,
                created_by="unrelated.owner",
            )
        )
        product.active_policy_revision = 99
        session.commit()

    blocked = client.post(
        f"{FIXTURE_URL}/reset",
        headers=OWNER,
        json={"confirmationName": "ESTV-Steuerstatistik nach Kanton"},
    )
    assert blocked.status_code == 409
    with session_factory() as session:
        assert session.get(PolicyRevision, unrelated_policy_id) is not None
        assert session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID) is not None


def test_product_activity_uses_safe_renewal_wording_facts_and_roles(client):
    prepare(client)
    renewal = submit_renewal(client)
    owner_result = owner_approves(client, renewal)
    rejected = governance_decision(client, owner_result["governanceSubmission"], "reject")
    assert rejected["status"] == "rejected"

    summary = client.get(
        f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/activity",
        headers={"X-DaCa-User": ""},
    )
    assert summary.status_code == 200
    summary_by_type = {item["eventType"]: item for item in summary.json()["items"]}
    assert summary_by_type["access-renewal-submitted"]["actor"] == {
        "displayName": "Datenkonsument/in",
        "kind": "role",
    }

    activity = client.get(
        f"/api/v1/data-products/{ACCESS_RENEWAL_PRODUCT_ID}/activity",
        headers=OWNER,
    )
    assert activity.status_code == 200
    payload = activity.json()
    by_type = {item["eventType"]: item for item in payload["items"]}
    assert {
        "access-renewal-fixture-prepared",
        "access-renewal-submitted",
        "access-renewal-policy-prepared",
        "access-renewal-governance-submitted",
        "access-renewal-governance-rejected",
        "access-renewal-rejected",
    }.issubset(by_type)
    assert by_type["access-renewal-fixture-prepared"]["actor"] == {
        "displayName": "DaCa PoC-Fixture",
        "kind": "system",
    }
    assert by_type["access-renewal-submitted"]["actor"] == {
        "displayName": "Beat Stalder",
        "kind": "person",
    }
    assert by_type["access-renewal-governance-rejected"]["actor"] == {
        "displayName": "Thomas Kriegli",
        "kind": "person",
    }
    assert "bisherigen Enddatum" in by_type["access-renewal-governance-rejected"]["description"]
    submitted_facts = {
        item["label"]: item["value"] for item in by_type["access-renewal-submitted"]["facts"]
    }
    assert submitted_facts == {
        "Bisher gültig bis": renewal["renewalContext"]["validUntil"],
        "Beantragt bis": renewal["validUntil"],
    }
    serialized = json.dumps(payload, ensure_ascii=False)
    for private_value in (
        NEW_PURPOSE,
        renewal["renewalContext"]["legalBasis"],
        renewal["renewalContext"]["sourceGrantId"],
        renewal["id"],
        renewal["renewalOfRequestId"],
        "Unabhängige Vier-Augen-Prüfung abgeschlossen.",
    ):
        assert private_value not in serialized
