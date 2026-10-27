from concurrent.futures import ThreadPoolExecutor

from daca_catalog.modeling_seed import (
    PHYSICAL_SOURCE_ID,
    S3_PHYSICAL_SOURCE_ID,
    VEHICLE_MODEL_ID,
    VIBDBU_PHYSICAL_SOURCE_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import (
    AssetMapping,
    AuditEvent,
    DataModelRoleAssignment,
    PhysicalSchemaSnapshot,
    PhysicalSourceAccessRequest,
    PhysicalSourceAccessState,
    WorkflowTask,
)
from sqlalchemy import func, select

SOURCE = str(VIBDBU_PHYSICAL_SOURCE_ID)
ACTOR = "christian.man"
OWNER = "daniel.wenger"


def headers(actor=ACTOR):
    return {"X-DaCa-User": actor}


def prepare(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        return str(
            session.scalar(
                select(PhysicalSchemaSnapshot.id).where(
                    PhysicalSchemaSnapshot.source_id == VIBDBU_PHYSICAL_SOURCE_ID
                )
            )
        )


def relinquish(client, actor=ACTOR):
    return client.post(
        f"/api/v1/physical-sources/{SOURCE}/access/relinquish", headers=headers(actor)
    )


def request(client, actor=ACTOR):
    return client.post(
        f"/api/v1/physical-sources/{SOURCE}/access/requests",
        json={"reason": "Struktur für das Gebäudemodell erneut prüfen"},
        headers=headers(actor),
    )


def decision(client, request_id, actor=OWNER, decision="approve", comment=""):
    return client.post(
        f"/api/v1/physical-source-access-requests/{request_id}/decision",
        json={"decision": decision, "comment": comment},
        headers=headers(actor),
    )


def test_return_is_personal_idempotent_and_survives_seed(client, session_factory):
    snapshot_id = prepare(session_factory)
    assert relinquish(client).status_code == 204
    assert relinquish(client).status_code == 204
    with session_factory() as session:
        seed_modeling_catalog(session)
        state = session.get(PhysicalSourceAccessState, (VIBDBU_PHYSICAL_SOURCE_ID, ACTOR))
        assert state.revision == 1 and state.restored_at is None
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(
                    AuditEvent.resource_type == "physical-source-access",
                    AuditEvent.actor == ACTOR,
                    AuditEvent.action == "relinquished",
                )
            )
            == 1
        )
    sources = client.get("/api/v1/physical-sources", headers=headers()).json()["items"]
    assert all(item["id"] != SOURCE for item in sources)
    other_sources = client.get(
        "/api/v1/physical-sources", headers=headers("christian.spider")
    ).json()["items"]
    assert any(item["id"] == SOURCE for item in other_sources)
    assert (
        client.get(f"/api/v1/physical-snapshots/{snapshot_id}", headers=headers()).status_code
        == 403
    )
    assert (
        client.get(f"/api/v1/physical-snapshots/{snapshot_id}/drift", headers=headers()).status_code
        == 403
    )
    snapshots = client.get(
        f"/api/v1/physical-snapshots?sourceId={SOURCE}", headers=headers()
    ).json()
    assert snapshots["items"] == []
    assert (
        client.post(
            f"/api/v1/physical-sources/{SOURCE}/imports", json={}, headers=headers()
        ).status_code
        == 403
    )
    tree = client.get(
        f"/api/v1/physical-snapshots/{snapshot_id}", headers=headers("christian.spider")
    ).json()
    table = tree["databases"][0]["schemas"][0]["tables"][0]
    assert (
        client.post(
            f"/api/v1/physical-tables/{table['id']}/quick-derive-logical-model",
            json={},
            headers=headers(),
        ).status_code
        == 403
    )
    returned = client.get("/api/v1/physical-source-access/mine", headers=headers()).json()
    assert len(returned) == 1
    assert set(returned[0]) == {"sourceId", "sourceName", "organization", "revision", "request"}
    assert (
        client.get(
            "/api/v1/physical-source-access/mine", headers=headers("christian.spider")
        ).json()
        == []
    )


def test_restoration_requires_another_current_owner_and_preserves_history(client, session_factory):
    prepare(session_factory)
    assert relinquish(client).status_code == 204
    submitted = request(client)
    assert submitted.status_code == 201, submitted.text
    request_id = submitted.json()["id"]
    assert request(client).status_code == 409
    assert decision(client, request_id, actor=ACTOR).status_code == 403
    inbox = client.get("/api/v1/physical-source-access-requests/inbox", headers=headers(OWNER))
    assert inbox.status_code == 200 and inbox.json()[0]["id"] == request_id
    assert client.get("/api/v1/tasks/mine", headers=headers(OWNER)).status_code == 200
    assert decision(client, request_id, decision="reject").status_code == 422
    assert (
        decision(
            client, request_id, decision="reject", comment="Bitte Zweck präzisieren"
        ).status_code
        == 200
    )
    assert any(
        item["sourceId"] == SOURCE
        for item in client.get("/api/v1/physical-source-access/mine", headers=headers()).json()
    )
    approved = request(client)
    assert approved.status_code == 201
    approved_id = approved.json()["id"]
    assert decision(client, approved_id).status_code == 200
    assert decision(client, approved_id).status_code == 409
    assert client.get("/api/v1/physical-source-access/mine", headers=headers()).json() == []
    assert any(
        item["id"] == SOURCE
        for item in client.get("/api/v1/physical-sources", headers=headers()).json()["items"]
    )
    with session_factory() as session:
        state = session.get(PhysicalSourceAccessState, (VIBDBU_PHYSICAL_SOURCE_ID, ACTOR))
        assert state.revision == 2 and state.restored_at is not None
        requests = list(session.scalars(select(PhysicalSourceAccessRequest)))
        assert {item.status for item in requests} == {"approved", "rejected"}
        assert all(
            task.status == "completed"
            for task in session.scalars(
                select(WorkflowTask).where(
                    WorkflowTask.physical_source_access_request_id.is_not(None)
                )
            )
        )
    assert relinquish(client).status_code == 204
    assert decision(client, approved_id).status_code == 409
    returned = client.get("/api/v1/physical-source-access/mine", headers=headers()).json()[0]
    assert returned["revision"] == 3 and returned["request"] is None


def test_missing_owner_and_lost_owner_role_fail_closed(client, session_factory):
    prepare(session_factory)
    assert relinquish(client).status_code == 204
    submitted = request(client)
    assert submitted.status_code == 201
    with session_factory() as session:
        for role in session.scalars(
            select(DataModelRoleAssignment).where(DataModelRoleAssignment.role == "data_owner")
        ):
            role.active = False
        session.commit()
    assert decision(client, submitted.json()["id"]).status_code == 403
    # A second person has no owner available either.
    assert relinquish(client, actor="christian.spider").status_code == 204
    assert request(client, actor="christian.spider").status_code == 409


def test_lost_requester_scope_is_not_regranted(client, session_factory):
    prepare(session_factory)
    source = str(PHYSICAL_SOURCE_ID)
    assert (
        client.post(
            f"/api/v1/physical-sources/{source}/access/relinquish", headers=headers()
        ).status_code
        == 204
    )
    submitted = client.post(
        f"/api/v1/physical-sources/{source}/access/requests",
        json={"reason": "Restore my metadata access"},
        headers=headers(),
    )
    assert submitted.status_code == 201, submitted.text
    with session_factory() as session:
        for role in session.scalars(
            select(DataModelRoleAssignment).where(DataModelRoleAssignment.user_id == ACTOR)
        ):
            role.active = False
        session.commit()
    assert decision(client, submitted.json()["id"], actor="christian.spider").status_code == 409


def test_concurrent_returns_and_requests_are_serialized(client, session_factory):
    prepare(session_factory)
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: relinquish(client).status_code, range(2))) == [204, 204]
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: request(client).status_code, range(2))) == [201, 409]


def test_blank_reason_and_unknown_source_are_rejected(client, session_factory):
    prepare(session_factory)
    assert relinquish(client).status_code == 204
    assert (
        client.post(
            f"/api/v1/physical-sources/{SOURCE}/access/requests",
            json={"reason": "    "},
            headers=headers(),
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/physical-sources/00000000-0000-0000-0000-000000000000/access/relinquish",
            headers=headers(),
        ).status_code
        == 404
    )


def test_model_and_mapping_history_survive_without_exposing_returned_structures(
    client, session_factory
):
    prepare(session_factory)
    model_path = f"/api/v1/logical-models/{VEHICLE_MODEL_ID}"
    original = client.get(model_path, headers=headers()).json()
    mappings = client.get(
        f"/api/v1/asset-mappings?logicalModelId={VEHICLE_MODEL_ID}", headers=headers()
    ).json()["items"]
    assert mappings
    # Return both connected model sources, so the workspace cannot select an
    # unrelated fallback and conceal an accidental physical-metadata disclosure.
    for source_id in (PHYSICAL_SOURCE_ID, S3_PHYSICAL_SOURCE_ID):
        assert (
            client.post(
                f"/api/v1/physical-sources/{source_id}/access/relinquish", headers=headers()
            ).status_code
            == 204
        )
    assert client.get(model_path, headers=headers()).json() == original
    assert (
        client.get(
            f"/api/v1/asset-mappings?logicalModelId={VEHICLE_MODEL_ID}", headers=headers()
        ).json()["items"]
        == []
    )
    assert client.get(f"{model_path}/representations", headers=headers()).json()["items"] == []
    workspace = client.get(
        f"/api/v1/mapping-workspaces/{VEHICLE_MODEL_ID}", headers=headers()
    ).json()
    assert workspace["graph"]["physicalColumns"] == []
    assert workspace["graph"]["mappingVersions"] == []
    assert workspace["graph"]["logicalFields"]
    for mapping in mappings:
        assert (
            client.get(f"/api/v1/asset-mappings/{mapping['id']}", headers=headers()).status_code
            == 403
        )
        assert (
            client.get(
                f"/api/v1/asset-mappings/{mapping['id']}/versions", headers=headers()
            ).status_code
            == 403
        )
        assert (
            client.get(
                f"/api/v1/mapping-workspaces/{VEHICLE_MODEL_ID}?physicalSnapshotId={mapping['physicalSnapshotId']}",
                headers=headers(),
            ).status_code
            == 403
        )
    with session_factory() as session:
        assert session.scalar(
            select(func.count())
            .select_from(AssetMapping)
            .where(AssetMapping.logical_model_id == VEHICLE_MODEL_ID)
        ) == len(mappings)
    physical_models = client.get("/api/v1/physical-models", headers=headers()).json()["items"]
    assert all(
        item["sourceId"] not in {str(PHYSICAL_SOURCE_ID), str(S3_PHYSICAL_SOURCE_ID)}
        for item in physical_models
    )
    documentation = client.get("/api/v1/documentation/responsibilities", headers=headers()).json()
    assert not any(
        item["id"].startswith(f"physical_representation:{PHYSICAL_SOURCE_ID}:")
        for item in documentation["objects"]
    )


def test_multiple_owner_decisions_complete_all_tasks_once(client, session_factory):
    prepare(session_factory)
    source = str(PHYSICAL_SOURCE_ID)
    client.post(f"/api/v1/physical-sources/{source}/access/relinquish", headers=headers())
    submitted = client.post(
        f"/api/v1/physical-sources/{source}/access/requests",
        json={"reason": "Need model metadata again"},
        headers=headers(),
    ).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(
            pool.map(
                lambda actor: decision(client, submitted["id"], actor=actor).status_code,
                ["christian.spider", "lawrence.hill"],
            )
        )
    assert statuses == [200, 409]
    with session_factory() as session:
        tasks = list(
            session.scalars(
                select(WorkflowTask).where(
                    WorkflowTask.physical_source_access_request_id == submitted["id"]
                )
            )
        )
        assert len(tasks) >= 2
        assert all(task.status == "completed" for task in tasks)
