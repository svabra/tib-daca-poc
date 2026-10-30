import uuid

import pytest
from daca_catalog import mapping_workspace_history_api as history_api
from daca_catalog.modeling_seed import (
    PERSONNEL_MODEL_ID,
    VEHICLE_MODEL_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import (
    AuditEvent,
    DataModelRoleAssignment,
    LogicalModel,
    MappingWorkspaceVisit,
    PhysicalDatabase,
    PhysicalSchema,
    PhysicalSource,
    PhysicalTable,
)
from sqlalchemy import func, select, update

PATH = "/api/v1/me/mapping-workspaces"
HEADERS = {"X-DaCa-User": "christian.man"}


@pytest.fixture
def history(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
    return client


def remember(client, model_id=PERSONNEL_MODEL_ID, **selection):
    response = client.put(f"{PATH}/{model_id}", headers=HEADERS, json=selection)
    assert response.status_code == 204, response.text


def physical_selection(session_factory):
    with session_factory() as session:
        table, database = session.execute(
            select(PhysicalTable, PhysicalDatabase)
            .join(PhysicalSchema, PhysicalTable.physical_schema_id == PhysicalSchema.id)
            .join(PhysicalDatabase, PhysicalSchema.physical_database_id == PhysicalDatabase.id)
        ).first()
        return {"physicalSnapshotId": str(database.snapshot_id), "physicalTableId": str(table.id)}


def test_history_survives_requests_is_private_and_does_not_change_catalog(history, session_factory):
    with session_factory() as session:
        before = (session.get(LogicalModel, PERSONNEL_MODEL_ID).revision, session.scalar(select(func.count(AuditEvent.id))))
    selection = physical_selection(session_factory)
    remember(history, view="table", **selection)
    response = history.get(PATH, headers=HEADERS)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    item = response.json()[0]
    assert item["logicalModelId"] == str(PERSONNEL_MODEL_ID)
    assert item["title"]["de"] == "Mitarbeitende"
    assert item["view"] == "table" and item["physicalLabel"]
    assert all(item[key] == value for key, value in selection.items())
    assert history.get(PATH, headers={"X-DaCa-User": "cinthya.thor"}).json() == []
    with session_factory() as session:
        assert session.get(MappingWorkspaceVisit, ("christian.man", PERSONNEL_MODEL_ID)) is not None
        assert before == (session.get(LogicalModel, PERSONNEL_MODEL_ID).revision, session.scalar(select(func.count(AuditEvent.id))))


def test_history_deduplicates_models_and_orders_by_last_work(history):
    remember(history)
    remember(history, VEHICLE_MODEL_ID)
    remember(history, view="drift")
    items = history.get(PATH, headers=HEADERS).json()
    assert [item["logicalModelId"] for item in items] == [str(PERSONNEL_MODEL_ID), str(VEHICLE_MODEL_ID)]
    assert items[0]["view"] == "drift"


def test_history_has_a_hard_per_user_bound(history, session_factory, monkeypatch):
    monkeypatch.setattr(history_api, "HISTORY_LIMIT", 1)
    remember(history)
    remember(history, VEHICLE_MODEL_ID)
    with session_factory() as session:
        assert list(session.scalars(select(MappingWorkspaceVisit.logical_model_id))) == [VEHICLE_MODEL_ID]


def test_invalid_physical_pairs_never_replace_the_last_valid_context(history, session_factory):
    remember(history, view="table")
    invalid = [
        {"physicalSnapshotId": str(uuid.uuid4())},
        {"view": "unknown"},
        {**physical_selection(session_factory), "physicalTableId": str(uuid.uuid4())},
    ]
    for body in invalid:
        response = history.put(f"{PATH}/{PERSONNEL_MODEL_ID}", headers=HEADERS, json=body)
        assert response.status_code == 422, response.text
    assert history.get(PATH, headers=HEADERS).json()[0]["view"] == "table"


def test_history_rechecks_model_permissions_and_blocks_forged_identity(history, session_factory):
    remember(history)
    with session_factory() as session:
        session.execute(update(DataModelRoleAssignment).where(DataModelRoleAssignment.user_id == "christian.man").values(active=False))
        session.commit()
    assert history.get(PATH, headers=HEADERS).json() == []
    denied = history.put(f"{PATH}/{PERSONNEL_MODEL_ID}", headers=HEADERS, json={})
    assert denied.status_code == 403
    assert history.get(PATH, headers={"X-DaCa-User": "unknown-person"}).status_code == 401


def test_unavailable_physical_context_is_removed_without_losing_the_logical_entry(history, session_factory):
    selection = physical_selection(session_factory)
    remember(history, **selection)
    with session_factory() as session:
        # Retire the source actually referenced by the saved snapshot.
        database = session.scalar(select(PhysicalDatabase).where(PhysicalDatabase.snapshot_id == uuid.UUID(selection["physicalSnapshotId"])))
        from daca_catalog.models import PhysicalSchemaSnapshot
        source_id = session.get(PhysicalSchemaSnapshot, database.snapshot_id).source_id
        source = session.get(PhysicalSource, source_id)
        source.lifecycle = "retired"
        session.commit()
    item = history.get(PATH, headers=HEADERS).json()[0]
    assert item["logicalModelId"] == str(PERSONNEL_MODEL_ID)
    assert item["physicalSnapshotId"] is None and item["physicalTableId"] is None and item["physicalLabel"] is None
