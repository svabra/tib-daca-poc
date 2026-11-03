import uuid

from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.modeling_service import (
    create_logical_successor,
    get_logical_version,
    logical_version_payload,
    logical_write_from_payload,
)
from daca_catalog.models import LogicalModel
from sqlalchemy import event, select


def test_logical_search_fields_are_bulk_latest_version_metadata_and_exclude_retired_models(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        model = session.scalar(select(LogicalModel).where(LogicalModel.lifecycle == "active"))
        model_id = model.id
        version = get_logical_version(session, model.id)
        old_version_id = version.id
        write = logical_write_from_payload(logical_version_payload(session, model, version))
        write.entities[0].fields[0].name = "customer_latest_search_field"
        successor = create_logical_successor(session, model, version, write, "christian.man")
        successor_id = successor.id
        session.commit()
        engine = session.get_bind()

    field_queries = []

    def count_fields(_connection, _cursor, statement, _parameters, _context, _executemany):
        if "logical_field_versions" in statement:
            field_queries.append(statement)

    event.listen(engine, "before_cursor_execute", count_fields)
    try:
        response = client.get("/api/v1/logical-model-fields", headers={"X-DaCa-User": "kassandra.valdata"})
    finally:
        event.remove(engine, "before_cursor_execute", count_fields)
    assert response.status_code == 200, response.text
    assert len(field_queries) == 1
    payload = response.json()
    assert payload["total"] == len(payload["items"])
    fields = [field for field in payload["items"] if field["modelId"] == str(model_id)]
    assert fields and all(field["modelVersionId"] == str(successor_id) for field in fields)
    assert not any(field["modelVersionId"] == str(old_version_id) for field in payload["items"])
    assert any(field["name"] == "customer_latest_search_field" for field in fields)
    assert all(field["rootId"] and field["id"] and field["entityName"] for field in fields)
    # Readable metadata is the same for another active identity without expanding
    # either identity's physical-source or mutation permissions.
    second = client.get("/api/v1/logical-model-fields", headers={"X-DaCa-User": "christian.man"})
    assert second.status_code == 200 and second.json() == payload
    with session_factory() as session:
        model = session.get(LogicalModel, uuid.UUID(str(model_id)))
        model.lifecycle = "retired"
        session.commit()
    after = client.get("/api/v1/logical-model-fields")
    assert after.status_code == 200
    assert not any(field["modelId"] == str(model_id) for field in after.json()["items"])


def test_logical_search_field_projection_requires_an_active_identity(client):
    client.headers.pop("X-DaCa-User", None)
    assert client.get("/api/v1/logical-model-fields").status_code in {401, 403}
