from __future__ import annotations

import uuid

import pytest
from daca_catalog.modeling_seed import (
    PHYSICAL_SOURCE_ID,
    S3_PHYSICAL_SOURCE_ID,
    VEHICLE_MODEL_ID,
    seed_modeling_catalog,
)
from daca_catalog.modeling_service import logical_write_from_payload
from daca_catalog.models import AssetMapping, LogicalModelRepresentation, PhysicalSchemaSnapshot
from sqlalchemy import func, select

HEADERS = {"X-DaCa-User": "christian.man"}


def context(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        snapshot_id = session.scalar(
            select(PhysicalSchemaSnapshot.id).where(
                PhysicalSchemaSnapshot.source_id == S3_PHYSICAL_SOURCE_ID
            )
        )
    response = client.get(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}", headers=HEADERS)
    assert response.status_code == 200, response.text
    snapshot = client.get(f"/api/v1/physical-snapshots/{snapshot_id}", headers=HEADERS).json()
    snapshot["id"] = snapshot["snapshot"]["id"]
    table = next(
        table
        for database in snapshot["databases"]
        for schema in database["schemas"]
        for table in schema["tables"]
        if table["name"] == "vehicle_inventory_mapping_demo.parquet"
    )
    return response.json(), response.headers["etag"], snapshot, table


def body_for(model, snapshot, table):
    return {
        "logicalModelVersionId": model["versionId"],
        "representations": [{"physicalSnapshotId": snapshot["id"], "physicalTableId": table["id"]}],
        "mappings": [],
    }


def test_workspace_removals_are_versioned_only_on_save_and_reject_stale_or_duplicate_requests(client, session_factory):
    model, etag, _snapshot, _table = context(client, session_factory)
    path = f"/api/v1/logical-models/{model['id']}/mapping-drafts"
    mapping = client.get(f"/api/v1/asset-mappings?logicalModelId={model['id']}",headers=HEADERS).json()["items"][0]
    removal = {"mappingId":mapping["id"],"versionId":mapping["versionId"],"lockVersion":mapping["lockVersion"]}
    for removals, status in (([removal,removal],422),([{**removal,"lockVersion":999999}],412)):
        rejected=client.post(path,headers={**HEADERS,"If-Match":etag},json={"logicalModelVersionId":model["versionId"],"removals":removals})
        assert rejected.status_code == status, rejected.text
        assert client.get(f"/api/v1/asset-mappings/{mapping['id']}",headers=HEADERS).json()["versionId"] == mapping["versionId"]
    response=client.post(path,headers={**HEADERS,"If-Match":etag},json={"logicalModelVersionId":model["versionId"],"removals":[removal]})
    assert response.status_code == 200, response.text
    assert response.json()["removedMappingIds"] == [mapping["id"]]
    saved=client.get(f"/api/v1/asset-mappings/{mapping['id']}",headers=HEADERS).json()
    assert saved["status"] == "superseded" and saved["versionId"] != mapping["versionId"]
    assert saved["physicalColumnIds"] == mapping["physicalColumnIds"]
    assert client.post(path,headers={**HEADERS,"If-Match":etag},json={"logicalModelVersionId":model["versionId"],"removals":[removal]}).status_code == 409


def test_removal_rolls_back_when_another_workspace_change_fails(client, session_factory):
    model, etag, snapshot, table = context(client, session_factory)
    mapping=client.get(f"/api/v1/asset-mappings?logicalModelId={model['id']}",headers=HEADERS).json()["items"][0]
    value={key:mapping[key] for key in ("logicalModelVersionId","physicalSnapshotId","mappingType","classification","responsibleUserId","validFrom","logicalFieldVersionIds","physicalColumnIds")}
    value["physicalColumnIds"]=[str(uuid.uuid4())]
    payload=body_for(model,snapshot,table)
    payload["removals"]=[{"mappingId":mapping["id"],"versionId":mapping["versionId"],"lockVersion":mapping["lockVersion"]}]
    payload["mappings"]=[{"clientId":"bad-after-removal","value":value}]
    response=client.post(f"/api/v1/logical-models/{model['id']}/mapping-drafts",headers={**HEADERS,"If-Match":etag},json=payload)
    assert response.status_code == 422, response.text
    assert client.get(f"/api/v1/asset-mappings/{mapping['id']}",headers=HEADERS).json()["versionId"] == mapping["versionId"]


def test_removal_requires_current_physical_source_access(client, session_factory):
    model, etag, _snapshot, _table = context(client, session_factory)
    mapping=client.get(f"/api/v1/asset-mappings?logicalModelId={model['id']}",headers=HEADERS).json()["items"][0]
    with session_factory() as session:
        source_id=session.get(PhysicalSchemaSnapshot,uuid.UUID(mapping["physicalSnapshotId"])).source_id
    assert client.post(f"/api/v1/physical-sources/{source_id}/access/relinquish",headers=HEADERS).status_code == 204
    response=client.post(f"/api/v1/logical-models/{model['id']}/mapping-drafts",headers={**HEADERS,"If-Match":etag},json={"logicalModelVersionId":model["versionId"],"removals":[{"mappingId":mapping["id"],"versionId":mapping["versionId"],"lockVersion":mapping["lockVersion"]}]})
    assert response.status_code == 403, response.text


def test_workspace_saves_live_field_name_and_rebases_existing_and_new_mappings(client, session_factory):
    model, etag, snapshot, table = context(client, session_factory)
    write = logical_write_from_payload(model).model_dump(mode="json", by_alias=True)
    field = write["entities"][0]["fields"][0]
    field["name"] = "Fahrzeuggrösse"
    payload = body_for(model, snapshot, table)
    payload["logicalModel"] = write
    old = client.get(f"/api/v1/asset-mappings?logicalModelId={model['id']}", headers=HEADERS).json()["items"][0]
    value = {key:old[key] for key in ("logicalModelVersionId","physicalSnapshotId","mappingType","classification","responsibleUserId","validFrom","logicalFieldVersionIds","physicalColumnIds")}
    value.update(physicalSnapshotId=snapshot["id"], physicalColumnIds=[table["columns"][0]["id"]])
    payload["mappings"] = [{"clientId":"rename-and-link", "value":value}]
    response = client.post(f"/api/v1/logical-models/{model['id']}/mapping-drafts", headers={**HEADERS,"If-Match":etag}, json=payload)
    assert response.status_code == 200, response.text
    updated = response.json()["logicalModel"]
    assert updated["revision"] == model["revision"] + 1
    assert updated["entities"][0]["fields"][0]["name"] == "Fahrzeuggrösse"
    assert updated["entities"][0]["fields"][0]["id"] == field["id"]
    for mapping in response.json()["currentMappings"]:
        if mapping["status"] != "superseded":
            assert mapping["logicalModelVersionId"] == updated["versionId"]
    assert response.json()["mappings"][0]["mapping"]["logicalModelVersionId"] == updated["versionId"]
    assert client.get(f"/api/v1/logical-models/{model['id']}",headers=HEADERS).json()["entities"][0]["fields"][0]["name"] == "Fahrzeuggrösse"
    assert client.post(f"/api/v1/logical-models/{model['id']}/mapping-drafts", headers={**HEADERS,"If-Match":etag}, json=payload).status_code == 412


def test_invalid_workspace_model_rolls_back_new_mapping_and_membership(client, session_factory):
    model, etag, snapshot, table = context(client, session_factory)
    payload = body_for(model, snapshot, table)
    write = logical_write_from_payload(model).model_dump(mode="json", by_alias=True)
    write["entities"][0]["fields"][0]["id"] = str(uuid.uuid4())
    payload["logicalModel"] = write
    response=client.post(f"/api/v1/logical-models/{model['id']}/mapping-drafts",headers={**HEADERS,"If-Match":etag},json=payload)
    assert response.status_code == 422, response.text
    assert client.get(f"/api/v1/logical-models/{model['id']}",headers=HEADERS).json()["versionId"] == model["versionId"]
    with session_factory() as session:
        assert session.scalar(select(LogicalModelRepresentation).where(LogicalModelRepresentation.physical_table_id == uuid.UUID(table["id"]))) is None


def test_logical_only_workspace_save_does_not_reveal_returned_source_mappings(client, session_factory):
    model, etag, _snapshot, _table = context(client, session_factory)
    for source_id in (PHYSICAL_SOURCE_ID, S3_PHYSICAL_SOURCE_ID):
        assert client.post(f"/api/v1/physical-sources/{source_id}/access/relinquish", headers=HEADERS).status_code == 204
    write = logical_write_from_payload(model).model_dump(mode="json", by_alias=True)
    write["entities"][0]["fields"][0]["name"] = "renamed_without_physical_access"
    response = client.post(f"/api/v1/logical-models/{model['id']}/mapping-drafts", headers={**HEADERS,"If-Match":etag},json={"logicalModelVersionId":model["versionId"],"logicalModel":write})
    assert response.status_code == 200, response.text
    assert response.json()["currentMappings"] == []
    assert response.json()["items"] == []
    assert response.json()["logicalModel"]["entities"][0]["fields"][0]["name"] == "renamed_without_physical_access"


def test_membership_without_links_survives_reload(
    client, session_factory
):
    model, etag, snapshot, table = context(client, session_factory)
    response = client.post(
        f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts",
        headers={**HEADERS, "If-Match": etag},
        json=body_for(model, snapshot, table),
    )
    assert response.status_code == 200, response.text
    # Five previously seeded PG links are preserved; the Parquet membership is independent.
    read = client.get(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/representations", headers=HEADERS)
    assert table["id"] in {item["physicalTableId"] for item in read.json()["items"]}
    assert table["rowCount"] == 3 and table["objectCount"] == 1
    assert len(table["columns"]) == 5 and all(
        column["name"].isupper() for column in table["columns"]
    )
    again = client.post(
        f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts",
        headers={**HEADERS, "If-Match": etag},
        json=body_for(model, snapshot, table),
    )
    assert again.status_code == 200
    with session_factory() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(LogicalModelRepresentation)
                .where(LogicalModelRepresentation.physical_table_id == uuid.UUID(table["id"]))
            )
            == 1
        )


def test_atomic_save_rolls_back_membership_and_earlier_mapping_on_bad_column(
    client, session_factory
):
    model, etag, snapshot, table = context(client, session_factory)
    payload = body_for(model, snapshot, table)
    old = client.get(
        "/api/v1/asset-mappings", params={"logicalModelId": str(VEHICLE_MODEL_ID)}, headers=HEADERS
    ).json()["items"][0]
    value = {
        key: old[key]
        for key in (
            "logicalModelVersionId",
            "physicalSnapshotId",
            "mappingType",
            "classification",
            "responsibleUserId",
            "validFrom",
            "logicalFieldVersionIds",
            "physicalColumnIds",
        )
    }
    value.update(physicalSnapshotId=snapshot["id"], physicalColumnIds=[table["columns"][0]["id"]])
    payload["mappings"] = [
        {"clientId": "good", "value": value},
        {"clientId": "bad", "value": {**value, "physicalColumnIds": [str(uuid.uuid4())]}},
    ]
    with session_factory() as session:
        count = session.scalar(select(func.count()).select_from(AssetMapping))
        memberships = session.scalar(select(func.count()).select_from(LogicalModelRepresentation))
    response = client.post(
        f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts",
        headers={**HEADERS, "If-Match": etag},
        json=payload,
    )
    assert response.status_code == 422, response.text
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AssetMapping)) == count
        assert (
            session.scalar(select(func.count()).select_from(LogicalModelRepresentation))
            == memberships
        )


def test_save_rejects_stale_model_and_foreign_snapshot(client, session_factory):
    model, etag, snapshot, table = context(client, session_factory)
    url = f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts"
    payload = body_for(model, snapshot, table)
    assert (
        client.post(url, headers={**HEADERS, "If-Match": '"999999"'}, json=payload).status_code
        == 412
    )
    payload["logicalModelVersionId"] = str(uuid.uuid4())
    assert client.post(url, headers={**HEADERS, "If-Match": etag}, json=payload).status_code == 409
    payload = body_for(model, snapshot, table)
    payload["representations"][0]["physicalSnapshotId"] = str(uuid.uuid4())
    assert client.post(url, headers={**HEADERS, "If-Match": etag}, json=payload).status_code == 422
    assert (
        client.post(
            url,
            headers={"X-DaCa-User": "daca-test-editor", "If-Match": etag},
            json=body_for(model, snapshot, table),
        ).status_code
        == 403
    )


def test_successful_draft_retry_is_idempotent_and_keeps_type_conflict(client, session_factory):
    model, etag, snapshot, table = context(client, session_factory)
    old = client.get(
        "/api/v1/asset-mappings", params={"logicalModelId": str(VEHICLE_MODEL_ID)}, headers=HEADERS
    ).json()["items"][0]
    value = {
        key: old[key]
        for key in (
            "logicalModelVersionId",
            "physicalSnapshotId",
            "mappingType",
            "classification",
            "responsibleUserId",
            "validFrom",
            "logicalFieldVersionIds",
            "physicalColumnIds",
        )
    }
    value.update(physicalSnapshotId=snapshot["id"], physicalColumnIds=[table["columns"][0]["id"]])
    payload = body_for(model, snapshot, table)
    payload["mappings"] = [{"clientId": "retry-unique", "value": value}]
    url = f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts"
    first = client.post(url, headers={**HEADERS, "If-Match": etag}, json=payload)
    assert first.status_code == 200, first.text
    second = client.post(url, headers={**HEADERS, "If-Match": etag}, json=payload)
    assert second.status_code == 200, second.text
    assert (
        first.json()["mappings"][0]["mapping"]["id"]
        == second.json()["mappings"][0]["mapping"]["id"]
    )
    assert first.json()["mappings"][0]["mapping"]["status"] == "draft"


def test_two_pg_instances_and_parquet_keep_independent_snapshot_memberships(
    client, session_factory
):
    from daca_catalog.modeling_core import FixturePhysicalMetadataAdapter
    from daca_catalog.modeling_seed import PHYSICAL_SOURCE_ID
    from daca_catalog.modeling_service import persist_physical_import, utc_now
    from daca_catalog.models import PhysicalSource

    model, etag, snapshot, table = context(client, session_factory)
    with session_factory() as session:
        original = session.get(PhysicalSource, PHYSICAL_SOURCE_ID)
        source_id = uuid.uuid4()
        source = PhysicalSource(
            id=source_id,
            urn=f"urn:daca:physical-source:{source_id}",
            origin_catalog_id=original.origin_catalog_id,
            name="Second PostgreSQL fixture instance",
            description=None,
            adapter_type="fixture",
            config_ref=f"fixture:{source_id}",
            department_code=original.department_code,
            organization_id=original.organization_id,
            revision=1,
            content_hash="0" * 64,
            lifecycle="active",
            created_by_user_id="christian.man",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(source)
        session.flush()
        second, _ = persist_physical_import(
            session, source, FixturePhysicalMetadataAdapter(), "christian.man"
        )
        second_id = str(second.id)
        session.commit()
    second_tree = client.get(f"/api/v1/physical-snapshots/{second_id}", headers=HEADERS).json()
    second_table = second_tree["databases"][0]["schemas"][0]["tables"][0]
    payload = body_for(model, snapshot, table)
    payload["representations"].append(
        {"physicalSnapshotId": second_id, "physicalTableId": second_table["id"]}
    )
    response = client.post(
        f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts",
        headers={**HEADERS, "If-Match": etag},
        json=payload,
    )
    assert response.status_code == 200, response.text
    saved = client.get(
        f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/representations", headers=HEADERS
    ).json()["items"]
    assert len({item["physicalSnapshotId"] for item in saved}) == 3
    # An existing object from another snapshot is rejected even though its source is writable.
    payload["representations"] = [{"physicalSnapshotId": second_id, "physicalTableId": table["id"]}]
    assert (
        client.post(
            f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts",
            headers={**HEADERS, "If-Match": etag},
            json=payload,
        ).status_code
        == 422
    )


def test_explicit_empty_binding_enables_quality_workflow_for_pure_logical_model(
    client, session_factory
):
    from daca_catalog.modeling_seed import PERSONNEL_MODEL_ID

    _vehicle, _etag, snapshot, table = context(client, session_factory)
    response = client.get(f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}", headers=HEADERS)
    model = response.json()
    assert model["hasPhysicalMapping"] is False
    result = client.post(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/mapping-drafts",
        headers={**HEADERS, "If-Match": response.headers["etag"]},
        json=body_for(model, snapshot, table),
    )
    assert result.status_code == 200, result.text
    reopened = client.get(f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}", headers=HEADERS).json()
    assert reopened["hasPhysicalMapping"] is True
    issues = client.get(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/mapping-inconsistencies", headers=HEADERS
    ).json()
    assert issues["qualityStatus"] == "error" and issues["items"]


@pytest.mark.parametrize("original_status", ["validated", "review_pending"])
def test_line_edits_create_draft_successors_without_mutating_workflow_history(
    client, session_factory, original_status
):
    from daca_catalog.modeling_schemas import AssetMappingWrite
    from daca_catalog.modeling_service import create_mapping_successor, get_mapping_version
    from daca_catalog.models import AssetMappingVersion

    model, etag, snapshot, table = context(client, session_factory)
    old = client.get(
        "/api/v1/asset-mappings", params={"logicalModelId": str(VEHICLE_MODEL_ID)}, headers=HEADERS
    ).json()["items"][0]
    keys = (
        "logicalModelVersionId", "physicalSnapshotId", "mappingType", "classification",
        "responsibleUserId", "validFrom", "logicalFieldVersionIds", "physicalColumnIds",
    )
    value = {key: old[key] for key in keys}
    with session_factory() as session:
        root, previous = get_mapping_version(session, uuid.UUID(old["id"]))
        source = create_mapping_successor(
            session, root, previous, AssetMappingWrite.model_validate(value), "christian.man",
            status=original_status, validation_result={"valid": original_status == "validated", "issues": []},
        )
        source_id, source_revision = str(source.id), source.revision
        session.commit()
    value = {**value, "mappingType": "Transformed", "transformationRule": "value / 1000"}
    payload = body_for(model, snapshot, table)
    payload["mappings"] = [{"clientId": old["id"], "mappingId": old["id"],
        "versionId": source_id, "lockVersion": 1, "value": value}]
    url = f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts"
    response = client.post(url, headers={**HEADERS, "If-Match": etag}, json=payload)
    assert response.status_code == 200, response.text
    saved = response.json()["mappings"][0]["mapping"]
    assert saved["status"] == "draft" and saved["revision"] == source_revision + 1
    assert saved["mappingType"] == "Transformed" and not saved["validationResult"]["valid"]
    assert saved["physicalSnapshotId"] == value["physicalSnapshotId"]
    with session_factory() as session:
        historical = session.get(AssetMappingVersion, uuid.UUID(source_id))
        assert historical.status == original_status
        assert historical.mapping_type == old["mappingType"]
        assert historical.transformation_rule is None
    assert client.post(url, headers={**HEADERS, "If-Match": etag}, json=payload).status_code == 409
