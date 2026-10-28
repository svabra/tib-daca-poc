import uuid

import pytest
from daca_catalog.modeling_api import _assignments, _require_publish_right, _require_scope
from daca_catalog.modeling_seed import (
    MODELING_ORGANIZATION_ID,
    PERSONNEL_MODEL_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import (
    AdministrativeOrganization,
    CatalogObjectResponsibility,
    DataModelRoleAssignment,
    DataProduct,
    DcatDatasetVersion,
    DemoUser,
    Domain,
    LogicalModelReview,
    LogicalModelVersion,
)
from fastapi import HTTPException
from sqlalchemy import select

PRODUCT_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")


def headers(actor, revision=1):
    return {"X-DaCa-User": actor, "If-Match": f'"{revision}"'}


def test_public_catalog_metadata_is_not_writable_by_an_unrelated_consumer(client, session_factory):
    with session_factory() as session:
        before = session.get(DataProduct, PRODUCT_ID).title
    result = client.patch(f"/api/v1/data-products/{PRODUCT_ID}", headers=headers("beat.stalder"), json={"title": "Unauthorized change"})
    assert result.status_code == 403, result.text
    with session_factory() as session:
        assert session.get(DataProduct, PRODUCT_ID).title == before


@pytest.mark.parametrize("role", ["deputy_data_owner", "deputy_data_steward"])
def test_explicit_product_deputies_have_only_their_assigned_object_rights(client, session_factory, role):
    actor = "beat.stalder"
    with session_factory() as session:
        session.add(CatalogObjectResponsibility(id=uuid.uuid4(), user_id=actor, role=role, data_product_id=PRODUCT_ID))
        session.get(DataProduct, PRODUCT_ID).discoverable = False
        session.commit()
    assert client.get(f"/api/v1/data-products/{PRODUCT_ID}", headers=headers(actor)).status_code == 200
    listed = client.get("/api/v1/data-products", headers=headers(actor))
    assert listed.status_code == 200, listed.text
    assert str(PRODUCT_ID) in {item["id"] for item in listed.json()["items"]}
    result = client.patch(f"/api/v1/data-products/{PRODUCT_ID}", headers=headers(actor), json={"title": "Assigned deputy metadata"})
    assert result.status_code == 200, result.text
    result = client.patch(f"/api/v1/data-products/{PRODUCT_ID}", headers=headers(actor, 2), json={"classification": "public"})
    assert result.status_code == (200 if role == "deputy_data_owner" else 403), result.text
    with session_factory() as session:
        assignment = session.scalar(select(CatalogObjectResponsibility).where(
            CatalogObjectResponsibility.user_id == actor,
            CatalogObjectResponsibility.data_product_id == PRODUCT_ID,
        ))
        assignment.active = False
        session.commit()
    assert client.get(f"/api/v1/data-products/{PRODUCT_ID}", headers=headers(actor)).status_code == 404
    assert str(PRODUCT_ID) not in {item["id"] for item in client.get("/api/v1/data-products", headers=headers(actor)).json()["items"]}
    assert client.patch(f"/api/v1/data-products/{PRODUCT_ID}", headers=headers(actor, 3), json={"title": "Revoked assignment"}).status_code == 403


def test_product_named_deputy_can_read_and_edit_but_another_global_owner_cannot(client, session_factory):
    with session_factory() as session:
        product = session.get(DataProduct, PRODUCT_ID)
        product.deputy_owner_user_id = "sandro.wenger"
        product.discoverable = False
        session.commit()
    assert client.get(f"/api/v1/data-products/{PRODUCT_ID}", headers=headers("sandro.wenger")).status_code == 200
    listed = client.get("/api/v1/data-products", headers=headers("sandro.wenger")).json()
    assert str(PRODUCT_ID) in {item["id"] for item in listed["items"]}
    assert client.patch(f"/api/v1/data-products/{PRODUCT_ID}", headers=headers("noemie.rochat"), json={"title": "Other owner"}).status_code == 403
    result = client.patch(f"/api/v1/data-products/{PRODUCT_ID}", headers=headers("sandro.wenger"), json={"title": "Named deputy"})
    assert result.status_code == 200, result.text


def test_an_org_delegation_does_not_make_every_model_the_deputys_object(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        version = session.scalar(select(LogicalModelVersion).where(LogicalModelVersion.logical_model_id == PERSONNEL_MODEL_ID).order_by(LogicalModelVersion.revision.desc()))
        dataset = session.get(DcatDatasetVersion, version.dataset_version_id)
        dataset.data_owner_user_id = "christian.spider"
        dataset.deputy_owner_user_id = "hong.an.captain"
        with pytest.raises(HTTPException) as denied:
            _require_publish_right(session, "sibilla.micheli", version)
        assert denied.value.status_code == 403
        dataset.deputy_owner_user_id = "sibilla.micheli"
        _require_publish_right(session, "sibilla.micheli", version)


def test_deputy_steward_is_a_scoped_operational_role_without_owner_decision_rights(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        session.add(DemoUser(id="audit-deputy-steward", display_name="Deputy Steward", organization="Demo", email="deputy@example.test", active=True, roles=["data_consumer"]))
        session.flush()
        session.add(DataModelRoleAssignment(id=uuid.uuid4(), user_id="audit-deputy-steward", department_code="VBS", organization_id=MODELING_ORGANIZATION_ID, role="deputy_data_steward", active=True))
        session.flush()
        _require_scope(session, "audit-deputy-steward", "VBS", MODELING_ORGANIZATION_ID, roles={"data_steward"})
        with pytest.raises(HTTPException):
            _require_scope(session, "audit-deputy-steward", "VBS", MODELING_ORGANIZATION_ID, roles={"data_owner"})
        session.get(DemoUser, "audit-deputy-steward").active = False
        session.flush()
        assert _assignments(session, "audit-deputy-steward") == []
        session.get(DemoUser, "audit-deputy-steward").active = True
        session.get(AdministrativeOrganization, MODELING_ORGANIZATION_ID).active = False
        session.flush()
        assert _assignments(session, "audit-deputy-steward") == []


def submit_personnel(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
    model = client.get(f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}", headers=headers("cinthya.thor")).json()
    submitted = client.post(f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions/{model['versionId']}/submit", headers={"X-DaCa-User": "cinthya.thor", "If-Match": f'"{model["lockVersion"]}"'})
    assert submitted.status_code == 200, submitted.text
    return submitted.json(), submitted.headers["etag"]


def test_model_review_uses_current_domain_owner_and_deputy_not_the_historic_assignee(client, session_factory):
    model, etag = submit_personnel(client, session_factory)
    with session_factory() as session:
        review = session.get(LogicalModelReview, uuid.UUID(model["reviewId"]))
        session.get(Domain, review.domain_id).owner_user_id = "lawrence.hill"
        session.commit()
    path = f"/api/v1/logical-model-reviews/{model['reviewId']}"
    assert client.post(path+"/decision", headers={"X-DaCa-User": "christian.spider", "If-Match": etag}, json={"decision": "reject", "comment": "Stale role"}).status_code == 403
    read = client.get(path, headers=headers("sibilla.micheli"))
    assert read.status_code == 200 and read.json()["canDecide"] is True
    result = client.post(path+"/decision", headers={"X-DaCa-User": "sibilla.micheli", "If-Match": etag}, json={"decision": "reject", "comment": "Current deputy review"})
    assert result.status_code == 200, result.text


def test_model_submitter_cannot_approve_after_becoming_domain_owner(client, session_factory):
    model, etag = submit_personnel(client, session_factory)
    with session_factory() as session:
        review = session.get(LogicalModelReview, uuid.UUID(model["reviewId"]))
        session.get(Domain, review.domain_id).owner_user_id = "cinthya.thor"
        session.commit()
    path = f"/api/v1/logical-model-reviews/{model['reviewId']}"
    assert client.get(path, headers=headers("cinthya.thor")).json()["canDecide"] is False
    assert client.post(path+"/decision", headers={"X-DaCa-User": "cinthya.thor", "If-Match": etag}, json={"decision": "accept"}).status_code == 403
