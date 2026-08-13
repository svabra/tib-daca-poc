from __future__ import annotations

import io
import json
import tarfile

from daca_catalog.policy import GENERATED_REGO, ProjectionResult
from daca_catalog.seed import ESTV_PRODUCT_ID, ESTV_PRODUCT_URN


def product_url() -> str:
    return f"/api/v1/data-products/{ESTV_PRODUCT_ID}"


def policy_definition() -> dict:
    return {
        "effect": "allow",
        "subjects": {"userIds": ["kanton-st-gallen"]},
        "resources": {"productUrns": [ESTV_PRODUCT_URN], "owners": ["ESTV"]},
        "actions": ["data.read"],
        "protocols": ["http", "postgresql"],
    }


def test_seed_policy_is_structured_and_rego_is_generated(client):
    latest = client.get(f"{product_url()}/policies/latest")
    assert latest.status_code == 200
    assert latest.headers["etag"] == '"1"'
    assert latest.json()["definition"]["subjects"]["userIds"] == ["kanton-st-gallen"]
    assert latest.json()["generatedRego"] == GENERATED_REGO
    assert "data.daca.policies" in latest.json()["generatedRego"]


def test_policy_edit_requires_etag_and_publish_creates_immutable_revision(client, monkeypatch):
    no_precondition = client.post(
        f"{product_url()}/policies",
        json={"definition": policy_definition()},
    )
    assert no_precondition.status_code == 428

    draft = client.post(
        f"{product_url()}/policies",
        headers={"If-Match": '"1"', "X-DaCa-User": "estv-owner"},
        json={"definition": policy_definition()},
    )
    assert draft.status_code == 201
    assert draft.headers["etag"] == '"2"'
    assert draft.json()["status"] == "draft"
    draft_id = draft.json()["id"]

    stale = client.post(
        f"{product_url()}/policies",
        headers={"If-Match": '"1"'},
        json={"definition": policy_definition()},
    )
    assert stale.status_code == 412

    monkeypatch.setattr(
        "daca_catalog.main.project_to_postgresql",
        lambda settings, product_id, revision, definition: ProjectionResult(
            "deployed", observed_revision=revision
        ),
    )

    published = client.post(
        f"{product_url()}/policies/{draft_id}/publish",
        headers={"If-Match": '"2"', "X-DaCa-User": "estv-owner"},
    )
    assert published.status_code == 201
    assert published.headers["etag"] == '"3"'
    assert published.json()["revision"] == 3
    assert published.json()["status"] == "published"
    deployments = {item["target"]: item for item in published.json()["deployments"]}
    assert deployments["opa"]["state"] == "pending"
    assert deployments["postgresql"]["state"] == "deployed"
    assert deployments["postgresql"]["observedRevision"] == 3

    revisions = client.get(f"{product_url()}/policies").json()["items"]
    assert [revision["revision"] for revision in revisions] == [3, 2, 1]
    assert [revision["status"] for revision in revisions] == ["published", "draft", "published"]


def test_policy_publish_retains_active_revision_until_postgresql_deploys(client):
    draft = client.post(
        f"{product_url()}/policies",
        headers={"If-Match": '"1"'},
        json={"definition": policy_definition()},
    )
    response = client.post(
        f"{product_url()}/policies/{draft.json()['id']}/publish",
        headers={"If-Match": '"2"'},
    )
    assert response.status_code == 503
    product = client.get(product_url()).json()
    assert product["activePolicyRevision"] == 1
    revisions = client.get(f"{product_url()}/policies").json()["items"]
    assert [revision["status"] for revision in revisions] == ["draft", "published"]


def test_policy_must_select_the_product_and_owner(client):
    invalid = policy_definition()
    invalid["resources"]["owners"] = ["NOT-ESTV"]
    response = client.post(
        f"{product_url()}/policies",
        headers={"If-Match": '"1"'},
        json={"definition": invalid},
    )
    assert response.status_code == 422


def test_opa_bundle_is_etagged_and_contains_policy_plus_pip_data(client):
    response = client.get("/api/v1/opa/bundles/catalog.tar.gz")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/vnd.openpolicyagent.bundles")
    assert response.headers["etag"]

    with tarfile.open(fileobj=io.BytesIO(response.content), mode="r:gz") as bundle:
        names = set(bundle.getnames())
        assert names == {".manifest", "data.json", "daca/authz/policy.rego"}
        data = json.load(bundle.extractfile("data.json"))
        rego = bundle.extractfile("daca/authz/policy.rego").read().decode()
        manifest = json.load(bundle.extractfile(".manifest"))
    assert data["daca"]["policies"][0]["subjects"]["userIds"] == ["kanton-st-gallen"]
    assert data["daca"]["resources"][ESTV_PRODUCT_URN]["owner"] == "ESTV"
    assert data["daca"]["resourcesById"][str(ESTV_PRODUCT_ID)]["urn"] == ESTV_PRODUCT_URN
    assert "decision :=" in rego
    assert manifest["roots"] == ["daca"]

    cached = client.get(
        "/api/v1/opa/bundles/catalog.tar.gz",
        headers={"If-None-Match": response.headers["etag"]},
    )
    assert cached.status_code == 304
    assert cached.content == b""


def test_opa_bundle_revision_changes_with_trusted_pip_attributes(client):
    before = client.get("/api/v1/opa/bundles/catalog.tar.gz")
    edited = client.patch(
        product_url(),
        headers={"If-Match": '"1"'},
        json={"classification": "internal"},
    )
    assert edited.status_code == 200
    after = client.get(
        "/api/v1/opa/bundles/catalog.tar.gz",
        headers={"If-None-Match": before.headers["etag"]},
    )
    assert after.status_code == 200
    assert after.headers["etag"] != before.headers["etag"]


def test_opa_status_acknowledges_the_active_bundle(client):
    bundle_response = client.get("/api/v1/opa/bundles/catalog.tar.gz")
    with tarfile.open(fileobj=io.BytesIO(bundle_response.content), mode="r:gz") as bundle:
        revision = json.load(bundle.extractfile(".manifest"))["revision"]
    observed = client.post(
        "/api/v1/internal/opa/status",
        headers={"Authorization": "Bearer test-internal-token"},
        json={"bundles": {"daca": {"active_revision": revision}}},
    )
    assert observed.status_code == 200
    assert observed.json()["deploymentsAcknowledged"] == 1
    deployments = client.get(f"{product_url()}/policy-deployments").json()
    opa = next(item for item in deployments if item["target"] == "opa")
    assert opa["state"] == "deployed"
    assert opa["observedRevision"] == 1


def test_internal_deployment_acknowledgement_is_authenticated(client):
    policy = client.get(f"{product_url()}/policies/latest").json()
    deployment_id = policy["deployments"][0]["id"]
    body = {
        "policyRevisionId": policy["id"],
        "target": policy["deployments"][0]["target"],
        "observedRevision": 1,
        "state": "deployed",
    }
    denied = client.put("/internal/v1/policy-deployments/acknowledge", json=body)
    assert denied.status_code == 401
    acknowledged = client.put(
        "/internal/v1/policy-deployments/acknowledge",
        headers={"Authorization": "Bearer test-internal-token"},
        json=body,
    )
    assert acknowledged.status_code == 200
    assert acknowledged.json()["id"] == deployment_id
