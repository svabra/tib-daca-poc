from __future__ import annotations

from daca_catalog.mapping_inconsistencies import rebase_mapping_versions, sync_mapping_inconsistencies
from daca_catalog.modeling_seed import PERSONNEL_MODEL_ID, VEHICLE_MODEL_ID, seed_modeling_catalog
from daca_catalog.modeling_service import (
    create_logical_successor, get_logical_version, logical_version_payload,
    logical_write_from_payload, mapping_write_from_payload,
)
from daca_catalog.models import AssetMapping, AssetMappingVersion, LogicalMappingInconsistency, LogicalModel, WorkflowTask
from sqlalchemy import select


def _headers(user: str, etag: str | None = None) -> dict[str, str]:
    headers = {"X-DaCa-User": user}
    if etag:
        headers["If-Match"] = etag
    return headers


def test_unlinked_field_creates_owner_decision_and_steward_assignment(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        mapping = session.scalar(select(AssetMapping).order_by(AssetMapping.id).limit(1))
        assert mapping is not None
        version = session.scalar(select(AssetMappingVersion).where(
            AssetMappingVersion.asset_mapping_id == mapping.id,
        ).order_by(AssetMappingVersion.revision.desc()).limit(1))
        assert version is not None
        model_id = mapping.logical_model_id
        mapping_id = mapping.id
        version_id = version.id

    original = client.get(f"/api/v1/asset-mappings/{mapping_id}", headers=_headers("christian.man"))
    assert original.status_code == 200, original.text
    removed = client.post(
        f"/api/v1/asset-mappings/{mapping_id}/versions/{version_id}/supersede",
        headers=_headers("christian.man", original.headers["etag"]),
    )
    assert removed.status_code == 200, removed.text

    result = client.get(f"/api/v1/logical-models/{model_id}/mapping-inconsistencies",
                        headers=_headers("christian.man"))
    assert result.status_code == 200, result.text
    assert result.json()["qualityStatus"] == "error"
    issue = next(item for item in result.json()["items"] if item["status"] == "open")
    overview = client.get("/api/v1/logical-models", headers=_headers("christian.man"))
    assert overview.status_code == 200, overview.text
    affected = next(item for item in overview.json()["items"] if item["id"] == str(model_id))
    assert affected["mappingInconsistencyCount"] > 0
    assert result.json()["eligibleStewards"]
    owner = issue["ownerUserId"]
    steward = result.json()["eligibleStewards"][0]["id"]

    owner_tasks = client.get("/api/v1/tasks/mine", headers=_headers(owner))
    assert owner_tasks.status_code == 200
    assert any(item["logicalMappingIssueId"] == issue["id"]
               and item["taskType"] == "logical_mapping_inconsistency"
               for item in owner_tasks.json())

    wrong_actor = client.post(
        f"/api/v1/logical-models/{model_id}/mapping-inconsistencies/{issue['id']}/decision",
        json={"action": "accept", "comment": "Fachlich geprüft"},
        headers=_headers("christian.man"),
    )
    assert wrong_actor.status_code == 403

    dispatched = client.post(
        f"/api/v1/logical-models/{model_id}/mapping-inconsistencies/{issue['id']}/decision",
        json={"action": "dispatch", "stewardUserId": steward,
              "comment": "Bitte die physische Quelle prüfen"},
        headers=_headers(owner),
    )
    assert dispatched.status_code == 200, dispatched.text
    assert dispatched.json()["status"] == "assigned"
    assert dispatched.json()["assignedStewardUserId"] == steward
    with session_factory() as session:
        stored = session.get(LogicalMappingInconsistency, issue["id"])
        assert stored is not None and stored.status == "assigned"
        tasks = list(session.scalars(select(WorkflowTask).where(
            WorkflowTask.logical_mapping_issue_id == stored.id,
        )))
        assert any(task.task_type == "logical_mapping_investigation"
                   and task.assignee_user_id == steward and task.status == "open" for task in tasks)
        assert all(task.status == "completed" for task in tasks
                   if task.task_type == "logical_mapping_inconsistency")

    restored = client.post("/api/v1/asset-mappings", headers=_headers("christian.man"), json={
        "logicalModelVersionId": original.json()["logicalModelVersionId"],
        "logicalFieldVersionIds": original.json()["logicalFieldVersionIds"],
        "physicalSnapshotId": original.json()["physicalSnapshotId"],
        "physicalColumnIds": original.json()["physicalColumnIds"],
        "mappingType": original.json()["mappingType"],
        "classification": original.json()["classification"],
        "responsibleUserId": "christian.man",
        "validFrom": original.json()["validFrom"],
    })
    assert restored.status_code == 201, restored.text
    resolved = client.get(f"/api/v1/logical-models/{model_id}/mapping-inconsistencies",
                          headers=_headers("christian.man"))
    assert resolved.status_code == 200
    assert any(item["id"] == issue["id"] and item["status"] == "resolved"
               for item in resolved.json()["items"])


def test_field_removal_supersedes_its_connection_and_rebases_survivors(session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        model = session.get(LogicalModel, VEHICLE_MODEL_ID)
        assert model is not None
        source = get_logical_version(session, model.id)
        body = logical_write_from_payload(logical_version_payload(session, model, source))
        removed = body.entities[0].fields.pop(0)
        assert body.entities[0].fields
        successor = create_logical_successor(session, model, source, body, "christian.man")
        rebase_mapping_versions(session, model, successor, "christian.man")
        sync_mapping_inconsistencies(session, model.id)
        session.commit()

        versions = list(session.scalars(select(AssetMappingVersion)
            .join(AssetMapping, AssetMapping.id == AssetMappingVersion.asset_mapping_id)
            .where(AssetMapping.logical_model_id == model.id,
                   AssetMappingVersion.revision == AssetMapping.revision)))
        assert len(versions) == 5
        assert sum(version.status == "superseded" for version in versions) == 1
        assert all(version.logical_model_version_id == successor.id and version.status == "draft"
                   for version in versions if version.status != "superseded")
        assert not session.scalar(select(LogicalMappingInconsistency.id).where(
            LogicalMappingInconsistency.logical_model_id == model.id,
            LogicalMappingInconsistency.logical_field_id == removed.id,
        ))


def test_only_scoped_owner_or_steward_can_remove_a_logical_field(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        model = session.get(LogicalModel, PERSONNEL_MODEL_ID)
        assert model is not None
        version = get_logical_version(session, model.id)
        body = logical_write_from_payload(logical_version_payload(session, model, version))
        body.entities[0].fields.pop()
        request = body.model_dump(mode="json", by_alias=True)
        version_id = version.id
        etag = f'"{version.lock_version}"'

    url = f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions/{version_id}"
    forbidden = client.put(url, json=request, headers=_headers("sibilla.micheli", etag))
    assert forbidden.status_code == 403, forbidden.text
    allowed = client.put(url, json=request, headers=_headers("cinthya.thor", etag))
    assert allowed.status_code == 200, allowed.text


def test_deputy_cannot_remove_mapping_connection(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        mapping = session.scalar(select(AssetMapping).where(
            AssetMapping.logical_model_id == VEHICLE_MODEL_ID,
        ).limit(1))
        assert mapping is not None
        mapping_id = mapping.id

    original = client.get(f"/api/v1/asset-mappings/{mapping_id}", headers=_headers("christian.man"))
    assert original.status_code == 200, original.text
    payload = original.json()
    url = f"/api/v1/asset-mappings/{mapping_id}/versions/{payload['versionId']}/supersede"
    assert client.post(url, headers=_headers("sibilla.micheli", original.headers["etag"])).status_code == 403
    assert client.post(url, headers=_headers("christian.man", original.headers["etag"])).status_code == 200


def test_removing_one_of_two_physical_targets_preserves_the_other(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        mapping = session.scalar(select(AssetMapping).where(
            AssetMapping.logical_model_id == VEHICLE_MODEL_ID,
        ).limit(1))
        assert mapping is not None
        mapping_id = mapping.id

    original = client.get(f"/api/v1/asset-mappings/{mapping_id}", headers=_headers("christian.man"))
    assert original.status_code == 200, original.text
    payload = original.json()
    snapshot = client.get(
        f"/api/v1/physical-snapshots/{payload['physicalSnapshotId']}",
        headers=_headers("christian.man"),
    )
    assert snapshot.status_code == 200, snapshot.text
    all_columns = [column["id"] for database in snapshot.json()["databases"]
                   for schema in database["schemas"] for table in schema["tables"]
                   for column in table["columns"]]
    extra = next(column for column in all_columns if column not in payload["physicalColumnIds"])
    write = mapping_write_from_payload(payload).model_dump(mode="json", by_alias=True)
    write["physicalColumnIds"] = [*payload["physicalColumnIds"], extra]
    url = f"/api/v1/asset-mappings/{mapping_id}/versions/{payload['versionId']}"
    expanded = client.put(url, json=write, headers=_headers("christian.man", original.headers["etag"]))
    assert expanded.status_code == 200, expanded.text

    write["physicalColumnIds"] = [extra]
    url = f"/api/v1/asset-mappings/{mapping_id}/versions/{expanded.json()['versionId']}"
    denied = client.put(url, json=write, headers=_headers("sibilla.micheli", expanded.headers["etag"]))
    assert denied.status_code == 403, denied.text
    reduced = client.put(url, json=write, headers=_headers("christian.man", expanded.headers["etag"]))
    assert reduced.status_code == 200, reduced.text
    assert reduced.json()["physicalColumnIds"] == [extra]
    assert reduced.json()["revision"] == expanded.json()["revision"] + 1
