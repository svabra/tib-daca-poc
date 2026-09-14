from __future__ import annotations

from daca_catalog.modeling_seed import PERSONNEL_MODEL_ID, seed_modeling_catalog
from daca_catalog.models import AssetMapping
from sqlalchemy import select


def _headers(actor: str, etag: str | None = None) -> dict[str, str]:
    headers = {"X-DaCa-User": actor}
    if etag is not None:
        headers["If-Match"] = etag
    return headers


def test_logical_clone_uses_current_version_lock_for_optimistic_concurrency(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)

    path = f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions"
    assert client.post(path, headers=_headers("cinthya.thor")).status_code == 428
    first_clone = client.post(path, headers=_headers("cinthya.thor", '"1"'))
    assert first_clone.status_code == 201, first_clone.text
    assert first_clone.json()["revision"] == 2
    assert first_clone.headers["etag"] == '"2"'

    stale = client.post(path, headers=_headers("cinthya.thor", '"1"'))
    assert stale.status_code == 412

    latest = client.get(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}",
        headers=_headers("cinthya.thor"),
    )
    assert latest.status_code == 200, latest.text
    assert latest.json()["revision"] == 2
    assert latest.headers["etag"] == '"2"'

    current = client.post(path, headers=_headers("cinthya.thor", latest.headers["etag"]))
    assert current.status_code == 201, current.text
    assert current.json()["revision"] == 3
    assert current.headers["etag"] == '"3"'

    history = client.get(path, headers=_headers("cinthya.thor"))
    assert history.status_code == 200, history.text
    assert [item["revision"] for item in history.json()["items"]] == [3, 2, 1]
    assert len({item["versionId"] for item in history.json()["items"]}) == 3


def test_mapping_clone_uses_monotone_root_revision_for_optimistic_concurrency(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        mapping_id = session.scalar(select(AssetMapping.id).order_by(AssetMapping.id).limit(1))
    assert mapping_id is not None

    path = f"/api/v1/asset-mappings/{mapping_id}/versions"
    assert client.post(path, headers=_headers("christian.man")).status_code == 428
    first_clone = client.post(path, headers=_headers("christian.man", '"1"'))
    assert first_clone.status_code == 201, first_clone.text
    assert first_clone.json()["revision"] == 2
    assert first_clone.headers["etag"] == '"2"'

    stale = client.post(path, headers=_headers("christian.man", '"1"'))
    assert stale.status_code == 412

    latest = client.get(
        f"/api/v1/asset-mappings/{mapping_id}",
        headers=_headers("christian.man"),
    )
    assert latest.status_code == 200, latest.text
    assert latest.json()["revision"] == 2
    assert latest.headers["etag"] == '"2"'

    current = client.post(path, headers=_headers("christian.man", latest.headers["etag"]))
    assert current.status_code == 201, current.text
    assert current.json()["revision"] == 3
    assert current.headers["etag"] == '"3"'
