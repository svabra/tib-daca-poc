import copy
import uuid
from datetime import timedelta

import pytest
from daca_catalog.access_renewals import zurich_today
from daca_catalog.models import AuditEvent, DataProduct, PolicyDeployment, PolicyRevision
from daca_catalog.policy import ProjectionResult
from sqlalchemy import func, select

PRODUCT = uuid.UUID("11111111-1111-4111-8111-111111111111")
URL = f"/api/v1/data-products/{PRODUCT}/access-permissions"
LOG = f"/api/v1/data-products/{PRODUCT}/access-permission-events"
OWNER = {"X-DaCa-User": "kassandra.valdata"}
READER = {"X-DaCa-User": "beat.stalder"}
CONTROL = {"X-DaCa-User": "thomas.kriegli"}
INTERNAL = {"Authorization": "Bearer test-internal-token"}


@pytest.fixture
def prepared(session_factory, monkeypatch):
    monkeypatch.setattr("daca_catalog.main.requires_four_eyes", lambda session, product: False)
    monkeypatch.setattr("daca_catalog.product_permissions.project_to_postgresql", lambda settings, product, revision, definition: ProjectionResult("deployed", observed_revision=revision))
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        product.owner_user_id = "kassandra.valdata"
        product.control_person_user_id = "thomas.kriegli"
        product.discoverable = True
        product.lifecycle = "active"
        product.active_policy_revision = 1
        policy = session.scalar(select(PolicyRevision).where(PolicyRevision.data_product_id == PRODUCT, PolicyRevision.revision == 1))
        definition = copy.deepcopy(policy.definition)
        today = zurich_today()
        common = {"actions": ["data.read"], "protocols": ["http"], "validFrom": (today-timedelta(days=2)).isoformat(), "validUntil": "9999-12-31", "dataVariant": "original", "metadataChannels": {"kobyMcp": False, "i14y": False}}
        definition["grants"] = [
            {**common, "subject": {"type": "person", "id": "beat.stalder"}},
            {**common, "subject": {"type": "machine", "id": "qa-machine"}},
            {**common, "subject": {"type": "group", "id": "kanton-st-gallen"}, "groupSnapshot": {"groupId": "kanton-st-gallen", "membershipRevision": 1, "memberIds": ["beat.stalder"]}},
            {**common, "subject": {"type": "person", "id": "joel.ruod"}, "validUntil": (today-timedelta(days=1)).isoformat()},
        ]
        policy.definition = definition
        for deployment in session.scalars(select(PolicyDeployment).where(PolicyDeployment.policy_revision_id == policy.id)):
            deployment.state = "deployed"
            deployment.observed_revision = deployment.desired_revision = 1
        session.commit()


def registry(client, headers=OWNER):
    response = client.get(URL, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def remove(client, state, kind="person"):
    item = next(item for item in state["items"] if item["grant"]["subject"]["type"] == kind)
    response = client.delete(f"{URL}/{item['grantId']}", headers={**OWNER, "If-Match": f'"{state["latestRevision"]}"'})
    return response


def ack(client, policy, state="deployed"):
    response = client.put("/internal/v1/policy-deployments/acknowledge", headers=INTERNAL, json={
        "policyRevisionId": policy["policyId"], "target": "opa", "observedRevision": policy["policyRevision"], "state": state,
    })
    assert response.status_code == 200, response.text
    return response


def test_every_reader_can_view_current_people_machines_groups_and_complete_safe_history(client, prepared):
    state = registry(client, READER)
    assert not state["canManage"] and not state["canRevoke"]
    assert {item["grant"]["subject"]["type"] for item in state["items"]} == {"person", "machine", "group"}
    assert not any(item["grant"]["subject"]["id"] == "joel.ruod" for item in state["items"])
    group = next(item for item in state["items"] if item["grant"]["subject"]["type"] == "group")
    assert group["groupMembers"][0]["id"] == "beat.stalder"
    assert state["state"] == "confirmed"
    history = client.get(LOG, headers=READER)
    assert history.status_code == 200, history.text
    assert history.headers["Cache-Control"] == "no-store"
    assert client.get(URL, headers=READER).headers["Cache-Control"] == "no-store"
    assert history.json()["total"] == 4
    assert all(item["action"] == "granted" for item in history.json()["items"])
    assert all(item["source"] == "policy_history" for item in history.json()["items"])
    assert "purpose" not in history.text and "generatedRego" not in history.text


def test_permission_evidence_does_not_reveal_a_private_product(client, prepared, session_factory):
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        product.discoverable = False
        product.lifecycle = "draft"
        session.commit()
    for path in (URL, LOG):
        assert client.get(path, headers={"X-DaCa-User": "ariane.keller"}).status_code == 404
        assert client.get(path, headers=OWNER).status_code == 200


def test_single_revocation_waits_for_both_targets_retains_other_grants_and_logs_once(client, prepared, session_factory):
    initial = registry(client)
    result = remove(client, initial)
    assert result.status_code == 200, result.text
    policy = result.json()
    assert policy["state"] == "activating"
    pending = registry(client)
    assert pending["state"] == "pending" and len(pending["items"]) == 3
    assert not pending["canRevoke"]
    log = client.get(LOG, headers=READER).json()["items"]
    assert any(item["action"] == "revocation_requested" for item in log)
    assert not any(item["action"] == "revoked" for item in log)
    ack(client, policy)
    final = registry(client, READER)
    assert final["state"] == "confirmed" and final["policyRevision"] == policy["policyRevision"]
    assert {item["grant"]["subject"]["type"] for item in final["items"]} == {"machine", "group"}
    # The person's independent group access remains; only the direct grant was removed.
    assert final["items"][1]["groupMembers"] or final["items"][0]["groupMembers"]
    ack(client, policy)
    log = client.get(LOG, headers=READER).json()["items"]
    revoked = [item for item in log if item["action"] == "revoked"]
    assert len(revoked) == 1 and revoked[0]["subjectId"] == "beat.stalder"
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.resource_type == "access-permission", AuditEvent.action == "policy-activated")) == 1


def test_nonowners_and_stale_or_missing_preconditions_cannot_revoke(client, prepared, session_factory):
    state = registry(client)
    grant_id = state["items"][0]["grantId"]
    assert client.delete(f"{URL}/{grant_id}", headers={**READER, "If-Match": '"1"'}).status_code == 403
    assert client.delete(f"{URL}/{grant_id}", headers=OWNER).status_code == 428
    assert client.delete(f"{URL}/{grant_id}", headers={**OWNER, "If-Match": '"0"'}).status_code == 412
    assert client.delete(f"{URL}/unrelated-grant", headers={**OWNER, "If-Match": '"1"'}).status_code == 409
    assert registry(client)["latestRevision"] == 1
    with session_factory() as session:
        assert not session.scalar(select(AuditEvent.id).where(AuditEvent.resource_type == "access-permission"))


def test_failed_projection_retains_active_policy_and_does_not_record_a_success(client, prepared, monkeypatch):
    monkeypatch.setattr("daca_catalog.product_permissions.project_to_postgresql", lambda *args: ProjectionResult("failed", error="private internal diagnostic"))
    result = remove(client, registry(client))
    assert result.status_code == 503
    assert "private internal diagnostic" not in result.text
    assert registry(client)["latestRevision"] == 1
    assert not any(item["action"] == "revoked" for item in client.get(LOG, headers=READER).json()["items"])


def test_existing_policy_edit_path_logs_the_actual_change_after_activation(client, prepared, monkeypatch):
    monkeypatch.setattr("daca_catalog.main.project_to_postgresql", lambda settings, product, revision, definition: ProjectionResult("deployed", observed_revision=revision))
    grant = next(item["grant"] for item in registry(client)["items"] if item["grant"]["subject"]["type"] == "person")
    grant["dataVariant"] = "modified"
    draft = client.put(f"/api/v1/data-products/{PRODUCT}/access-settings", headers={**OWNER, "If-Match": '"1"'}, json={"grant": grant})
    assert draft.status_code == 201, draft.text
    policy = draft.json()
    published = client.post(f"/api/v1/data-products/{PRODUCT}/policies/{policy['id']}/publish", headers={**OWNER, "If-Match": f'"{policy["revision"]}"'}, json={})
    assert published.status_code == 201, published.text
    assert not any(item["action"] == "changed" for item in client.get(LOG, headers=READER).json()["items"])
    ack(client, {"policyId": published.json()["id"], "policyRevision": published.json()["revision"]})
    events = [item for item in client.get(LOG, headers=READER).json()["items"] if item["action"] == "changed"]
    assert len(events) == 1 and events[0]["subjectId"] == "beat.stalder"
    assert events[0]["before"][0]["dataVariant"] == "original"
    assert events[0]["after"][0]["dataVariant"] == "modified"


def test_removing_the_last_grant_cannot_resurrect_legacy_subject_selectors(client, prepared, session_factory):
    with session_factory() as session:
        policy = session.scalar(select(PolicyRevision).where(PolicyRevision.data_product_id == PRODUCT))
        definition = copy.deepcopy(policy.definition)
        definition["grants"] = [definition["grants"][0]]
        policy.definition = definition
        session.commit()
    result = remove(client, registry(client))
    assert result.status_code == 200, result.text
    ack(client, result.json())
    assert registry(client)["items"] == []
    with session_factory() as session:
        policy = session.get(PolicyRevision, uuid.UUID(result.json()["policyId"]))
        assert policy.definition["effect"] == "deny"
        assert all(not identifiers for identifiers in policy.definition["subjects"].values())
    access = client.get(f"/api/v1/data-products/{PRODUCT}/effective-access", headers=READER)
    assert access.status_code == 200 and not access.json()["granted"]


def test_whole_policy_revocation_also_appends_permission_events(client, prepared, session_factory, monkeypatch):
    monkeypatch.setattr("daca_catalog.main.project_to_postgresql", lambda settings, product, revision, definition: ProjectionResult("deployed", observed_revision=revision))
    with session_factory() as session:
        policy_id = session.scalar(select(PolicyRevision.id).where(PolicyRevision.data_product_id == PRODUCT))
    result = client.post(f"/api/v1/data-products/{PRODUCT}/policies/{policy_id}/revoke", headers={**OWNER, "If-Match": '"1"'}, json={})
    assert result.status_code == 201, result.text
    ack(client, {"policyId": result.json()["id"], "policyRevision": result.json()["revision"]})
    assert registry(client)["items"] == []
    assert len([item for item in client.get(LOG, headers=READER).json()["items"] if item["action"] == "revoked"]) == 4


@pytest.mark.parametrize("decision", ["approve", "reject"])
def test_governed_revocation_preserves_product_and_requires_independent_approval(client, prepared, session_factory, monkeypatch, decision):
    monkeypatch.setattr("daca_catalog.main.requires_four_eyes", lambda session, product: True)
    monkeypatch.setattr("daca_catalog.governance.project_to_postgresql", lambda settings, product, revision, definition: ProjectionResult("deployed", observed_revision=revision))
    state = registry(client)
    result = remove(client, state, "group")
    assert result.status_code == 200, result.text
    policy = result.json()
    assert policy["state"] == "pending_approval"
    assert registry(client)["policyRevision"] == 1 and len(registry(client)["items"]) == 3
    path = f"/api/v1/governance-submissions/{policy['governanceSubmissionId']}"
    submission = client.get(path, headers=CONTROL).json()
    assert submission["reviewSnapshot"]["workflowKind"] == "access_revocation"
    assert submission["reviewSnapshot"]["revocation"]["grant"]["subject"]["type"] == "group"
    body = {"decision": decision, "policyRevision": policy["policyRevision"]}
    assert client.post(path+'/decision', headers={**OWNER, "If-Match": '"1"'}, json=body).status_code == 403
    decided = client.post(path+'/decision', headers={**CONTROL, "If-Match": '"1"'}, json=body)
    assert decided.status_code == 200, decided.text
    if decision == "approve":
        assert decided.json()["status"] == "approved_deploying"
        assert registry(client)["policyRevision"] == 1
        ack(client, policy)
        assert len(registry(client)["items"]) == 2
        assert client.get(path, headers=CONTROL).json()["status"] == "approved"
    else:
        assert registry(client)["policyRevision"] == 1 and len(registry(client)["items"]) == 3
        assert any(item["action"] == "revocation_rejected" for item in client.get(LOG, headers=READER).json()["items"])
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT)
        assert product.discoverable and product.lifecycle == "active"
