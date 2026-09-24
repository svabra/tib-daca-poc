from __future__ import annotations

import pytest
from daca_catalog.modeling_seed import (
    REAL_ESTATE_DOMAIN_ID,
    REAL_ESTATE_ORGANIZATION_ID,
    VIBDBU_PHYSICAL_SOURCE_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import (
    CatalogObjectResponsibility,
    DataModelRoleAssignment,
    DataProduct,
    RoleChangeEvent,
)
from daca_catalog.role_change_sql import install_statements
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError


def _install_triggers(session_factory) -> None:
    # The API test fixture creates ORM metadata directly, rather than running Alembic.
    with session_factory() as session:
        for statement in install_statements():
            session.execute(text(statement))
        session.commit()


def test_role_changes_are_sequential_and_visible_without_overwriting_history(client, session_factory) -> None:
    _install_triggers(session_factory)
    with session_factory() as session:
        seed_modeling_catalog(session)
        assert session.scalar(select(RoleChangeEvent).where(
            RoleChangeEvent.scope_type == "domain",
            RoleChangeEvent.scope_id == str(REAL_ESTATE_DOMAIN_ID),
            RoleChangeEvent.role == "data_owner",
            RoleChangeEvent.subject_user_id == "daniel.wenger",
        )) is not None
        assert session.scalar(select(RoleChangeEvent).where(
            RoleChangeEvent.scope_type == "dataset_version",
            RoleChangeEvent.role == "data_owner",
        )) is not None
        assignment = session.scalar(select(DataModelRoleAssignment).where(
            DataModelRoleAssignment.organization_id == REAL_ESTATE_ORGANIZATION_ID,
            DataModelRoleAssignment.user_id == "christian.man",
        ))
        assert assignment is not None
        assignment_id = str(assignment.id)
        session.execute(text("SELECT set_config('daca.role_actor', 'daniel.wenger', true)"))
        assignment.role = "data_owner"
        session.commit()

        session.execute(text("SELECT set_config('daca.role_actor', 'daniel.wenger', true)"))
        assignment.active = False
        session.commit()

        session.execute(text("SELECT set_config('daca.role_actor', 'daniel.wenger', true)"))
        session.delete(assignment)
        session.commit()

        object_assignment = session.scalar(select(CatalogObjectResponsibility).where(
            CatalogObjectResponsibility.physical_source_id == VIBDBU_PHYSICAL_SOURCE_ID,
            CatalogObjectResponsibility.user_id == "christian.man",
        ))
        assert object_assignment is not None
        object_assignment_id = object_assignment.id
        session.delete(object_assignment)
        session.commit()
        seed_modeling_catalog(session)
        assert session.get(DataModelRoleAssignment, assignment.id) is None
        assert session.get(CatalogObjectResponsibility, object_assignment_id) is None

        entries = list(session.scalars(select(RoleChangeEvent).where(
            RoleChangeEvent.entity_id == assignment_id
        ).order_by(RoleChangeEvent.sequence)))
        assert [entry.action for entry in entries] == ["assigned", "changed", "removed"]
        assert [entry.sequence for entry in entries] == sorted(entry.sequence for entry in entries)
        assert entries[1].before_state["role"] == "data_steward"
        assert entries[1].after_state["role"] == "data_owner"
        assert entries[1].actor_user_id == "daniel.wenger"

        with pytest.raises(DBAPIError, match="append-only"):
            session.execute(text("DELETE FROM role_change_events WHERE sequence = :sequence"), {"sequence": entries[0].sequence})
            session.commit()
        session.rollback()

        private_product = session.scalar(select(DataProduct).where(DataProduct.owner_user_id != "daca-test-editor"))
        assert private_product is not None
        private_product_id = str(private_product.id)
        private_product.owner_user_id = "daca-test-editor"
        private_product.discoverable = False
        session.commit()
        assert session.scalar(select(RoleChangeEvent).where(
            RoleChangeEvent.scope_type == "data_product",
            RoleChangeEvent.scope_id == private_product_id,
        )) is not None
        with pytest.raises(DBAPIError, match="append-only"):
            session.execute(text("UPDATE role_change_events SET action = 'removed' WHERE sequence = :sequence"), {"sequence": entries[0].sequence})
            session.commit()
        session.rollback()

    response = client.get("/api/v1/documentation/role-changes?lang=de&limit=100", headers={"X-DaCa-User": "christian.man"})
    assert response.status_code == 200, response.text
    protocol = response.json()["items"]
    assert [row["sequence"] for row in protocol] == sorted((row["sequence"] for row in protocol), reverse=True)
    matching = [row for row in protocol if row["entityId"] == assignment_id]
    assert {row["action"] for row in matching} >= {"assigned", "changed", "removed"}
    assert any(row["actorName"] == "Daniel Wenger" for row in matching)
    assert not any(row["scopeType"] == "data_product" and row["scopeId"] == private_product_id for row in protocol)


def test_role_protocol_requires_identity(client) -> None:
    response = client.get("/api/v1/documentation/role-changes", headers={"X-DaCa-User": ""})
    assert response.status_code == 401
