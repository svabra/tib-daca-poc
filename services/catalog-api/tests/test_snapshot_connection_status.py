import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from daca_catalog.modeling_schemas import PhysicalSnapshotResponse
from daca_catalog.modeling_service import snapshot_summary, snapshot_tree


@pytest.mark.parametrize(
    ("adapter", "config_ref", "expected"),
    [("csv", None, False), ("fixture", "fixture-config", False),
     ("postgresql", "server-config", True), ("s3", "server-config", True),
     ("postgresql", None, False), ("s3", None, False)],
)
def test_snapshot_connection_status_uses_server_configuration_without_exposing_it(adapter, config_ref, expected):
    source_id = uuid.uuid4()
    source = SimpleNamespace(id=source_id, name="Source", urn=f"urn:daca:physical-source:{source_id}",
                             adapter_type=adapter, config_ref=config_ref,
                             department_code="VBS", organization_id="vbs-verteidigung")
    snapshot = SimpleNamespace(id=uuid.uuid4(), urn="urn:daca:snapshot:test", origin_catalog_id="catalog",
                               source_id=source_id, sequence=1, predecessor_snapshot_id=None,
                               fingerprint="a" * 64, imported_by_user_id="christian.man", imported_at=datetime.now(UTC))
    session = MagicMock()
    session.get.return_value = source
    session.scalars.return_value = []
    session.scalar.return_value = None
    payload = PhysicalSnapshotResponse.model_validate(snapshot_tree(session, snapshot)).model_dump(by_alias=True)
    assert payload["snapshot"]["sourceConnectionConfigured"] is expected
    assert "configRef" not in payload["snapshot"]
    session.scalars.reset_mock()
    summary = snapshot_summary(session, snapshot)
    assert summary == payload["snapshot"]
    session.scalars.assert_not_called()
