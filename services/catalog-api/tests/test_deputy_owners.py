from __future__ import annotations

import uuid

import pytest
from daca_catalog.deputy_owners import default_deputy_owner
from daca_catalog.models import DataProduct, DemoUser
from daca_catalog.workflow_seed import seed_workflow_reference_data
from sqlalchemy.exc import IntegrityError


def test_preferred_deputies_cover_product_and_source_owner_organizations(session_factory):
    expected = {
        "kassandra.valdata": "joel.ruod",
        "ariane.keller": "kassandra.valdata",
        "noemie.rochat": "lucien.morel",
        "beat.stalder": "sarah.brunner",
        "daniel.aebischer": "simone.wyss",
        "sandro.wenger": "lea.hofmann",
    }

    with session_factory() as session:
        deputies = {
            owner_id: default_deputy_owner(session, owner_id).id
            for owner_id in expected
        }
        assert deputies == expected
        for owner_id, deputy_id in deputies.items():
            owner = session.get(DemoUser, owner_id)
            deputy = session.get(DemoUser, deputy_id)
            assert owner is not None and deputy is not None
            assert deputy.id != owner.id
            assert deputy.organization == owner.organization
            assert deputy.avatar_url
            assert "data_owner" in deputy.roles


def test_resolver_falls_back_to_another_eligible_same_organization_owner(session_factory):
    with session_factory() as session:
        preferred = session.get(DemoUser, "joel.ruod")
        assert preferred is not None
        preferred.active = False
        session.flush()

        deputy = default_deputy_owner(session, "kassandra.valdata")
        assert deputy is not None
        assert deputy.id == "ariane.keller"
        assert deputy.organization == "ESTV"


def test_deputies_are_data_owners_without_implicit_reviewer_permissions(session_factory):
    deputy_ids = {"joel.ruod", "lucien.morel", "sarah.brunner", "simone.wyss", "lea.hofmann"}

    with session_factory() as session:
        deputies = [session.get(DemoUser, user_id) for user_id in deputy_ids]
        assert all(deputy is not None and "data_owner" in deputy.roles for deputy in deputies)
        assert all("publication_approver" not in deputy.roles for deputy in deputies if deputy)


def test_data_product_rejects_same_owner_and_deputy(session_factory):
    with session_factory() as session:
        product = session.get(
            DataProduct,
            uuid.UUID("11111111-1111-4111-8111-111111111111"),
        )
        assert product is not None
        product.deputy_owner_user_id = product.owner_user_id

        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()


def test_seed_preserves_valid_noncanonical_deputy_on_imported_product(client, session_factory):
    payload = next(
        item["payload"]
        for item in client.get("/api/v1/poc/product-fixtures").json()
        if item["id"] == "kassandra-bronze"
    )
    payload["sourceProductId"] = "deputy-preservation-test-v1"
    created = client.post("/api/v1/metadata-publications", json=payload)
    assert created.status_code == 201
    product_id = uuid.UUID(created.json()["productId"])

    with session_factory() as session:
        product = session.get(DataProduct, product_id)
        assert product is not None
        product.deputy_owner_user_id = "ariane.keller"
        session.commit()

    with session_factory() as session:
        seed_workflow_reference_data(session)
        product = session.get(DataProduct, product_id)
        assert product is not None
        assert product.deputy_owner_user_id == "ariane.keller"


def test_deputy_field_does_not_grant_product_owner_permissions(client):
    response = client.get(
        "/api/v1/data-products/11111111-1111-4111-8111-111111111111/metadata-deliveries",
        headers={"X-DaCa-User": "joel.ruod"},
    )

    assert response.status_code == 403
