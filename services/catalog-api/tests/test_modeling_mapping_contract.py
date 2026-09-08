from __future__ import annotations

import uuid

from daca_catalog.modeling_seed import (
    ORGANIZATION_MODEL_ID,
    PERSONNEL_MODEL_ID,
    VEHICLE_MODEL_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import (
    AssetMapping,
    AssetMappingVersion,
    LogicalModelVersion,
    PhysicalSchemaSnapshot,
)
from sqlalchemy import select


def _headers(actor: str, etag: str | None = None) -> dict[str, str]:
    headers = {"X-DaCa-User": actor}
    if etag is not None:
        headers["If-Match"] = etag
    return headers


def _seed(session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)


def _latest_mapping_rows(session_factory) -> list[tuple[AssetMapping, AssetMappingVersion]]:
    with session_factory() as session:
        rows: list[tuple[AssetMapping, AssetMappingVersion]] = []
        for mapping in session.scalars(select(AssetMapping).order_by(AssetMapping.id)):
            version = session.scalar(
                select(AssetMappingVersion)
                .where(AssetMappingVersion.asset_mapping_id == mapping.id)
                .order_by(AssetMappingVersion.revision.desc())
                .limit(1)
            )
            assert version is not None
            rows.append((mapping, version))
        return rows


def test_mapping_collection_applies_logical_model_and_snapshot_filters(
    client, session_factory
) -> None:
    _seed(session_factory)
    with session_factory() as session:
        snapshot_id = session.scalar(
            select(PhysicalSchemaSnapshot.id)
            .order_by(PhysicalSchemaSnapshot.imported_at, PhysicalSchemaSnapshot.id)
            .limit(1)
        )
    assert snapshot_id is not None

    by_model = client.get(
        "/api/v1/asset-mappings",
        params={"logicalModelId": str(VEHICLE_MODEL_ID)},
        headers=_headers("christian.man"),
    )
    assert by_model.status_code == 200, by_model.text
    assert by_model.json()["total"] == 5
    assert {
        item["logicalModelId"] for item in by_model.json()["items"]
    } == {str(VEHICLE_MODEL_ID)}

    unrelated_model = client.get(
        "/api/v1/asset-mappings",
        params={"logicalModelId": str(PERSONNEL_MODEL_ID)},
        headers=_headers("christian.man"),
    )
    assert unrelated_model.status_code == 200
    assert unrelated_model.json() == {"items": [], "total": 0}

    by_snapshot = client.get(
        "/api/v1/asset-mappings",
        params={"physicalSnapshotId": str(snapshot_id)},
        headers=_headers("christian.man"),
    )
    assert by_snapshot.status_code == 200, by_snapshot.text
    assert by_snapshot.json()["total"] == 5
    assert {
        item["physicalSnapshotId"] for item in by_snapshot.json()["items"]
    } == {str(snapshot_id)}

    unknown_snapshot = client.get(
        "/api/v1/asset-mappings",
        params={"physicalSnapshotId": str(uuid.uuid4())},
        headers=_headers("christian.man"),
    )
    assert unknown_snapshot.status_code == 200
    assert unknown_snapshot.json() == {"items": [], "total": 0}


def test_mapping_drafts_keep_validation_errors_and_review_only_validates_clean_versions(
    client, session_factory
) -> None:
    _seed(session_factory)
    seeded_mappings = _latest_mapping_rows(session_factory)
    _mapping, template = seeded_mappings[0]
    template_response = client.get(
        f"/api/v1/asset-mappings/{template.asset_mapping_id}",
        headers=_headers("christian.man"),
    )
    assert template_response.status_code == 200, template_response.text
    payload = template_response.json()

    invalid = client.post(
        "/api/v1/asset-mappings",
        headers=_headers("christian.man"),
        json={
            "logicalModelVersionId": payload["logicalModelVersionId"],
            "physicalSnapshotId": payload["physicalSnapshotId"],
            "mappingType": "Derived",
            "classification": "internal",
            "responsibleUserId": "christian.man",
            "validFrom": "2026-09-07",
            "validTo": "2026-09-06",
            "logicalFieldVersionIds": payload["logicalFieldVersionIds"],
            "physicalColumnIds": payload["physicalColumnIds"],
        },
    )
    assert invalid.status_code == 201, invalid.text
    assert invalid.json()["status"] == "draft"
    assert invalid.json()["validTo"] == "2026-09-06"
    assert invalid.json()["transformationRule"] is None

    checked_draft = client.post(
        f"/api/v1/asset-mappings/{invalid.json()['id']}/versions/"
        f"{invalid.json()['versionId']}/validate",
        headers=_headers("christian.man", invalid.headers["etag"]),
    )
    assert checked_draft.status_code == 200, checked_draft.text
    assert checked_draft.json()["status"] == "draft"
    assert checked_draft.json()["validationResult"]["valid"] is False
    assert {
        issue["code"] for issue in checked_draft.json()["validationResult"]["issues"]
    } >= {"invalid_validity_period", "missing_transformation_rule"}

    submitted_invalid = client.post(
        f"/api/v1/asset-mappings/{invalid.json()['id']}/versions/"
        f"{checked_draft.json()['versionId']}/submit",
        headers=_headers("christian.man", checked_draft.headers["etag"]),
    )
    assert submitted_invalid.status_code == 200, submitted_invalid.text
    assert submitted_invalid.json()["status"] == "review_pending"

    checked_review = client.post(
        f"/api/v1/asset-mappings/{invalid.json()['id']}/versions/"
        f"{submitted_invalid.json()['versionId']}/validate",
        headers=_headers("christian.man", submitted_invalid.headers["etag"]),
    )
    assert checked_review.status_code == 200, checked_review.text
    assert checked_review.json()["status"] == "review_pending"
    assert checked_review.json()["validationResult"]["valid"] is False

    valid_mapping, valid_version = seeded_mappings[0]
    submitted_valid = client.post(
        f"/api/v1/asset-mappings/{valid_mapping.id}/versions/{valid_version.id}/submit",
        headers=_headers("christian.man", '"1"'),
    )
    assert submitted_valid.status_code == 200, submitted_valid.text
    assert submitted_valid.json()["status"] == "review_pending"

    validated_review = client.post(
        f"/api/v1/asset-mappings/{valid_mapping.id}/versions/"
        f"{submitted_valid.json()['versionId']}/validate",
        headers=_headers("christian.man", submitted_valid.headers["etag"]),
    )
    assert validated_review.status_code == 200, validated_review.text
    assert validated_review.json()["status"] == "validated"
    assert validated_review.json()["validationResult"]["valid"] is True

    direct_mapping, direct_version = seeded_mappings[1]
    direct_validation = client.post(
        f"/api/v1/asset-mappings/{direct_mapping.id}/versions/{direct_version.id}/validate",
        headers=_headers("christian.man", '"1"'),
    )
    assert direct_validation.status_code == 200, direct_validation.text
    assert direct_validation.json()["status"] == "validated"


def test_retired_logical_and_mapping_roots_reject_new_successors(
    client, session_factory
) -> None:
    _seed(session_factory)
    logical = client.get(
        f"/api/v1/logical-models/{ORGANIZATION_MODEL_ID}",
        headers=_headers("cinthya.thor"),
    )
    assert logical.status_code == 200, logical.text
    submitted = client.post(
        f"/api/v1/logical-models/{ORGANIZATION_MODEL_ID}/versions/"
        f"{logical.json()['versionId']}/submit",
        headers=_headers("cinthya.thor", logical.headers["etag"]),
    )
    assert submitted.status_code == 200, submitted.text
    review = client.get(
        f"/api/v1/logical-model-reviews/{submitted.json()['reviewId']}",
        headers=_headers("cinthya.thor"),
    ).json()
    published = client.post(
        f"/api/v1/logical-model-reviews/{submitted.json()['reviewId']}/decision",
        json={"decision": "accept"},
        headers=_headers(review["reviewerUserId"], submitted.headers["etag"]),
    )
    assert published.status_code == 200, published.text
    retired_logical = client.post(
        f"/api/v1/logical-models/{ORGANIZATION_MODEL_ID}/versions/"
        f"{published.json()['versionId']}/retire",
        headers=_headers("christian.spider", published.headers["etag"]),
    )
    assert retired_logical.status_code == 200, retired_logical.text

    clone_retired_logical = client.post(
        f"/api/v1/logical-models/{ORGANIZATION_MODEL_ID}/versions",
        headers=_headers("cinthya.thor", f'"{retired_logical.json()["revision"]}"'),
    )
    assert clone_retired_logical.status_code == 409

    with session_factory() as session:
        organization_version = session.scalar(
            select(LogicalModelVersion)
            .where(LogicalModelVersion.logical_model_id == ORGANIZATION_MODEL_ID)
            .order_by(LogicalModelVersion.revision.desc())
            .limit(1)
        )
    assert organization_version is not None
    vehicle_mapping, vehicle_version = _latest_mapping_rows(session_factory)[0]
    template = client.get(
        f"/api/v1/asset-mappings/{vehicle_mapping.id}",
        headers=_headers("cinthya.thor"),
    )
    assert template.status_code == 200, template.text
    create_for_retired_model = client.post(
        "/api/v1/asset-mappings",
        headers=_headers("cinthya.thor"),
        json={
            "logicalModelVersionId": str(organization_version.id),
            "physicalSnapshotId": template.json()["physicalSnapshotId"],
            "mappingType": "Direct",
            "classification": "internal",
            "responsibleUserId": "cinthya.thor",
            "validFrom": "2026-09-07",
            "logicalFieldVersionIds": [
                retired_logical.json()["entities"][0]["fields"][0]["fieldVersionId"]
            ],
            "physicalColumnIds": template.json()["physicalColumnIds"],
        },
    )
    assert create_for_retired_model.status_code == 409

    retired_mapping = client.post(
        f"/api/v1/asset-mappings/{vehicle_mapping.id}/versions/"
        f"{vehicle_version.id}/retire",
        headers=_headers("lawrence.hill", '"1"'),
    )
    assert retired_mapping.status_code == 200, retired_mapping.text
    clone_retired_mapping = client.post(
        f"/api/v1/asset-mappings/{vehicle_mapping.id}/versions",
        headers=_headers("christian.man", f'"{retired_mapping.json()["revision"]}"'),
    )
    assert clone_retired_mapping.status_code == 409
