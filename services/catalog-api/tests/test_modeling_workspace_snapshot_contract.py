from __future__ import annotations

from daca_catalog.modeling_seed import (
    PHYSICAL_SOURCE_ID,
    VEHICLE_MODEL_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import PhysicalSchemaSnapshot
from sqlalchemy import select


def _headers(actor: str, etag: str | None = None) -> dict[str, str]:
    headers = {"X-DaCa-User": actor}
    if etag is not None:
        headers["If-Match"] = etag
    return headers


def test_workspace_defaults_to_latest_source_snapshot_after_mapping_breakage(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        baseline_snapshot_id = session.scalar(
            select(PhysicalSchemaSnapshot.id).where(
                PhysicalSchemaSnapshot.source_id == PHYSICAL_SOURCE_ID,
                PhysicalSchemaSnapshot.sequence == 1,
            )
        )
    assert baseline_snapshot_id is not None

    imported = client.post(
        f"/api/v1/physical-sources/{PHYSICAL_SOURCE_ID}/imports",
        json={"fixtureVariant": "drift"},
        headers=_headers("christian.man", '"1"'),
    )
    assert imported.status_code == 200, imported.text
    current_snapshot_id = imported.json()["snapshot"]["id"]

    workspace = client.get(
        f"/api/v1/mapping-workspaces/{VEHICLE_MODEL_ID}",
        headers=_headers("christian.man"),
    )
    assert workspace.status_code == 200, workspace.text
    assert workspace.json()["physicalSnapshotId"] == current_snapshot_id
    assert workspace.json()["physicalSnapshotId"] != str(baseline_snapshot_id)

    historical = client.get(
        f"/api/v1/mapping-workspaces/{VEHICLE_MODEL_ID}",
        params={"physicalSnapshotId": str(baseline_snapshot_id)},
        headers=_headers("christian.man"),
    )
    assert historical.status_code == 200, historical.text
    assert historical.json()["physicalSnapshotId"] == str(baseline_snapshot_id)
    assert any(
        mapping["status"] == "broken"
        for mapping in historical.json()["graph"]["mappingVersions"]
    )
