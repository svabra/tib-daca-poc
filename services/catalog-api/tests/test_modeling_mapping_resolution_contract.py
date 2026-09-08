from __future__ import annotations

import uuid

from daca_catalog.modeling_seed import PHYSICAL_SOURCE_ID, seed_modeling_catalog
from daca_catalog.models import (
    AssetMapping,
    AssetMappingPhysicalColumn,
    AssetMappingVersion,
    PhysicalColumn,
    PhysicalDatabase,
    PhysicalSchema,
    PhysicalTable,
)
from sqlalchemy import select


def _headers(actor: str, etag: str | None = None) -> dict[str, str]:
    headers = {"X-DaCa-User": actor}
    if etag is not None:
        headers["If-Match"] = etag
    return headers


def _mapping_write(payload: dict, *, snapshot_id: str, column_id: uuid.UUID) -> dict:
    return {
        "logicalModelVersionId": payload["logicalModelVersionId"],
        "physicalSnapshotId": snapshot_id,
        "mappingType": payload["mappingType"],
        "classification": payload["classification"],
        "transformationRule": payload["transformationRule"],
        "comment": payload["comment"],
        "responsibleUserId": payload["responsibleUserId"],
        "validFrom": payload["validFrom"],
        "validTo": payload["validTo"],
        "logicalFieldVersionIds": payload["logicalFieldVersionIds"],
        "physicalColumnIds": [str(column_id)],
    }


def test_broken_mapping_resolution_requires_a_successor_on_the_latest_snapshot(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        mapping_id = session.scalar(
            select(AssetMapping.id)
            .join(
                AssetMappingVersion,
                AssetMappingVersion.asset_mapping_id == AssetMapping.id,
            )
            .join(
                AssetMappingPhysicalColumn,
                AssetMappingPhysicalColumn.asset_mapping_version_id == AssetMappingVersion.id,
            )
            .join(
                PhysicalColumn,
                PhysicalColumn.id == AssetMappingPhysicalColumn.physical_column_id,
            )
            .where(
                AssetMapping.physical_source_id == PHYSICAL_SOURCE_ID,
                AssetMappingVersion.revision == AssetMapping.revision,
                PhysicalColumn.stable_key.endswith(".designation_de"),
            )
        )
    assert mapping_id is not None

    imported = client.post(
        f"/api/v1/physical-sources/{PHYSICAL_SOURCE_ID}/imports",
        json={"fixtureVariant": "drift"},
        headers=_headers("christian.man", '"1"'),
    )
    assert imported.status_code == 200, imported.text
    latest_snapshot_id = imported.json()["snapshot"]["id"]

    broken = client.get(
        f"/api/v1/asset-mappings/{mapping_id}",
        headers=_headers("christian.man"),
    )
    assert broken.status_code == 200, broken.text
    broken_payload = broken.json()
    assert broken_payload["status"] == "broken"
    assert broken_payload["physicalSnapshotId"] != latest_snapshot_id
    version_etag = f'"{broken_payload["lockVersion"]}"'

    validate_old = client.post(
        f"/api/v1/asset-mappings/{mapping_id}/versions/{broken_payload['versionId']}/validate",
        headers=_headers("christian.man", version_etag),
    )
    assert validate_old.status_code == 409
    assert "latest physical snapshot" in validate_old.text

    submit_old = client.post(
        f"/api/v1/asset-mappings/{mapping_id}/versions/{broken_payload['versionId']}/submit",
        headers=_headers("christian.man", version_etag),
    )
    assert submit_old.status_code == 409
    assert "latest physical snapshot" in submit_old.text

    clone_old = client.post(
        f"/api/v1/asset-mappings/{mapping_id}/versions",
        headers=_headers("christian.man", f'"{broken_payload["revision"]}"'),
    )
    assert clone_old.status_code == 409

    with session_factory() as session:
        latest_column_id = session.scalar(
            select(PhysicalColumn.id)
            .join(PhysicalTable, PhysicalTable.id == PhysicalColumn.physical_table_id)
            .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
            .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
            .where(
                PhysicalDatabase.snapshot_id == uuid.UUID(latest_snapshot_id),
                PhysicalColumn.stable_key.endswith(".designation_de"),
            )
        )
    assert latest_column_id is not None

    old_body = _mapping_write(
        broken_payload,
        snapshot_id=broken_payload["physicalSnapshotId"],
        column_id=uuid.UUID(broken_payload["physicalColumnIds"][0]),
    )
    revise_on_old = client.put(
        f"/api/v1/asset-mappings/{mapping_id}/versions/{broken_payload['versionId']}",
        headers=_headers("christian.man", version_etag),
        json=old_body,
    )
    assert revise_on_old.status_code == 409

    resolution = client.put(
        f"/api/v1/asset-mappings/{mapping_id}/versions/{broken_payload['versionId']}",
        headers=_headers("christian.man", version_etag),
        json=_mapping_write(
            broken_payload,
            snapshot_id=latest_snapshot_id,
            column_id=latest_column_id,
        ),
    )
    assert resolution.status_code == 200, resolution.text
    assert resolution.json()["status"] == "draft"
    assert resolution.json()["physicalSnapshotId"] == latest_snapshot_id
    assert resolution.json()["predecessorVersionId"] == broken_payload["versionId"]

    validated = client.post(
        f"/api/v1/asset-mappings/{mapping_id}/versions/{resolution.json()['versionId']}/validate",
        headers=_headers("christian.man", resolution.headers["etag"]),
    )
    assert validated.status_code == 200, validated.text
    assert validated.json()["status"] == "validated"
    assert validated.json()["physicalSnapshotId"] == latest_snapshot_id
