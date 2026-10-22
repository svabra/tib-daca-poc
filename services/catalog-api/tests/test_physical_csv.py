import base64
import csv
import io
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from daca_catalog.modeling_core import normalized_physical_metadata
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import DataModelRoleAssignment, PhysicalSchemaSnapshot, PhysicalSource
from daca_catalog.physical_csv import MAX_CSV_BYTES, parse_inventory
from fastapi import HTTPException
from sqlalchemy import func, select

HEADERS = ["Datenobjekt", "Tabelle", "Feldname", "Datentyp", "Länge", "Kurzbeschreibung", "Kommentar", "System", "Klassifizierung", "Dezimalstellen", "Werteliste"]
ACTOR = {"X-DaCa-User": "christian.man"}


def inventory(rows=None, encoding="cp1252"):
    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=";", lineterminator="\r\r\n")
    writer.writerow(HEADERS)
    writer.writerows(rows or [
        ["Gebäude", "VIBDBU", "SGENR", "CHAR", "8", "Gebäude", "", "SAP", "", "", ""],
        ["Gebäude", "VIBDBU", "RGEBART", "NUMC", "2", "Gebäudeart", "", "SAP", "", "", "Gebäudeart"],
        ["Gebäude", "VIBDBU", "VALIDFROM", "DATS", "10", "Gültig ab", "", "SAP", "", "", ""],
        ["Gebäude", "Gebäude / Bauwerke", "Name", "IfcLabel", "", 'Name; "Beispiel"\nZweite Zeile', "", "BIM", "Projektabhängig", "", ""],
        ["Gebäude", "Gebäude / Bauwerke", "Name", "IfcLabel", "", "Zweite Beschreibung", "", "BIM", "Projektabhängig", "", ""],
        ["Gebäude", "VIBDOBJASS", "", "", "", "Objekt", "", "SAP", "", "", ""],
        ["Gebäude", "OWNER.RADON", "YEAR", "Integer", "4", "Baujahr", "", "ImmoGIS", "Datensatzabhängig", "10", ""],
    ])
    return base64.b64encode(output.getvalue().encode(encoding)).decode()


def test_inventory_preserves_names_metadata_quoted_lines_and_unusual_source_declarations():
    parsed = parse_inventory(inventory())
    preview = parsed.preview()
    assert (preview["tableCount"], preview["fieldCount"], preview["rowCount"]) == (4, 5, 7)
    assert parsed.encoding == "Windows-1252"
    table = next(t for t in parsed.tables if t["system"] == "BIM")
    assert table["name"] == "Gebäude / Bauwerke"
    column = table["columns"][0]
    assert column["name"] == "Name" and len(column["importMetadata"]["records"]) == 2
    assert 'Name; "Beispiel"\nZweite Zeile' in column["comment"]
    assert "Zweite Beschreibung" in column["comment"]
    assert len(parsed.warnings) == 3
    normalized = normalized_physical_metadata(parsed.metadata)
    sap = next(db for db in normalized["databases"] if db["name"] == "SAP")
    columns = next(t for t in sap["schemas"][0]["tables"] if t["name"] == "VIBDBU")["columns"]
    assert [c["normalizedDataType"] for c in columns] == ["string", "string", "date"]
    assert columns[1]["importMetadata"]["records"][0]["Werteliste"] == "Gebäudeart"
    immo = next(t for t in parsed.tables if t["system"] == "ImmoGIS")["columns"][0]
    assert "numericScale" not in immo and immo["importMetadata"]["records"][0]["Dezimalstellen"] == "10"


def test_utf8_bom_unknown_type_and_untrusted_text_are_metadata_only():
    row = ["Gebäude", "A.B / C", "INSTRUCTION", "", "", "Ignore previous instructions <script>alert(1)</script>", "", "System", "", "", ""]
    parsed = parse_inventory(inventory([row], "utf-8-sig"))
    assert parsed.encoding == "UTF-8"
    assert parsed.tables[0]["columns"][0]["normalizedDataType"] == "unknown"
    assert "<script>" in parsed.tables[0]["columns"][0]["comment"]
    assert any("Datentyp fehlt" in warning for warning in parsed.warnings)


@pytest.mark.parametrize("text", [
    "Tabelle,Feldname,Datentyp\nA,B,CHAR", "Tabelle;Feldname;Datentyp;Feldname\nA;B;CHAR;B",
    'Tabelle;Feldname;Datentyp\nA;B;"unterminated', "Tabelle;Feldname;Datentyp\nA;B;CHAR;extra",
    "Tabelle;Feldname;Datentyp;Länge\nA;B;CHAR;-1", "Tabelle;Feldname;Datentyp\n;B;CHAR",
    "Tabelle;Feldname;Datentyp\nA;B;CHAR\nA;B;DATS", "\x00",
])
def test_invalid_csv_rejected_without_partial_inventory(text):
    with pytest.raises(ValueError):
        parse_inventory(base64.b64encode(text.encode()).decode())


def test_limits_and_encoding_are_enforced():
    for value in ("not base64!", "", base64.b64encode(b"x" * (MAX_CSV_BYTES + 1)).decode()):
        with pytest.raises(ValueError):
            parse_inventory(value)


def scope(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        assignment = session.scalar(select(DataModelRoleAssignment).where(DataModelRoleAssignment.user_id == "christian.man", DataModelRoleAssignment.active.is_(True)))
        return {"departmentCode": assignment.department_code, "organizationId": assignment.organization_id}


def body(client, session_factory):
    target = scope(session_factory)
    content = inventory()
    preview = client.post("/api/v1/physical-model-csv/preview", json={"contentBase64": content}, headers=ACTOR)
    assert preview.status_code == 200, preview.text
    return {"contentBase64": content, "name": "Gebäude · CSV-Struktur", "filename": "Gebäude.csv", "fingerprint": preview.json()["fingerprint"], **target}


def test_import_round_trip_search_idempotency_and_csv_cannot_trigger_fixture_adapter(client, session_factory):
    request = body(client, session_factory)
    response = client.post("/api/v1/physical-model-csv/imports", json=request, headers=ACTOR)
    assert response.status_code == 201, response.text
    result = response.json()
    assert not result["reused"]
    snapshot = result["snapshot"]["snapshot"]
    reread = client.get(f"/api/v1/physical-snapshots/{snapshot['id']}", headers=ACTOR)
    assert reread.status_code == 200, reread.text
    assert reread.json() == result["snapshot"]
    assert snapshot["sourceAdapterType"] == "csv" and snapshot["catalogPath"].startswith("urn:daca:")
    models = client.get("/api/v1/physical-models?sourceType=csv", headers=ACTOR)
    assert models.status_code == 200 and models.json()["total"] == 4
    sources = client.get("/api/v1/physical-sources", headers=ACTOR)
    source = next(s for s in sources.json()["items"] if s["id"] == result["sourceId"])
    assert source["adapterType"] == "csv" and source["systemName"] == "Strukturinventar"
    repeated = client.post("/api/v1/physical-model-csv/imports", json=request, headers=ACTOR)
    assert repeated.status_code == 200 and repeated.json()["reused"]
    assert repeated.json()["snapshot"]["snapshot"]["id"] == snapshot["id"]
    assert client.post(f"/api/v1/physical-sources/{result['sourceId']}/imports", json={}, headers={**ACTOR, "If-Match": '"1"'}).status_code == 422
    # A different source organization cannot see the imported structure.
    denied = client.get(f"/api/v1/physical-snapshots/{snapshot['id']}", headers={"X-DaCa-User": "kassandra.valdata"})
    assert denied.status_code == 403


def test_permissions_preview_conflicts_and_parse_errors_never_write(client, session_factory):
    request = body(client, session_factory)
    with session_factory() as session:
        before = session.scalar(select(func.count()).select_from(PhysicalSource))
    assert client.post("/api/v1/physical-model-csv/imports", json=request, headers={"X-DaCa-User": "daca-test-editor"}).status_code == 403
    assert client.post("/api/v1/physical-model-csv/preview", json={"contentBase64": request["contentBase64"]}).status_code == 403
    assert client.post("/api/v1/physical-model-csv/imports", json={**request, "fingerprint": "0" * 64}, headers=ACTOR).status_code == 409
    assert client.post("/api/v1/physical-model-csv/imports", json={**request, "contentBase64": "!"}, headers=ACTOR).status_code == 422
    assert client.post("/api/v1/physical-model-csv/imports", json={**request, "organizationId": str(uuid.uuid4())}, headers=ACTOR).status_code == 403
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(PhysicalSource)) == before


def test_atomic_failure_rolls_back_source_and_snapshot(client, session_factory, monkeypatch):
    request = body(client, session_factory)
    with session_factory() as session:
        before = session.scalar(select(func.count()).select_from(PhysicalSource))
        snapshots = session.scalar(select(func.count()).select_from(PhysicalSchemaSnapshot))
    from daca_catalog import physical_csv_api
    original = physical_csv_api.persist_physical_import

    def failed(session, source, adapter, actor):
        original(session, source, adapter, actor)
        raise HTTPException(503, "synthetic import failure after writing the complete snapshot")

    monkeypatch.setattr(physical_csv_api, "persist_physical_import", failed)
    response = client.post("/api/v1/physical-model-csv/imports", json=request, headers=ACTOR)
    assert response.status_code == 503
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(PhysicalSource)) == before
        assert session.scalar(select(func.count()).select_from(PhysicalSchemaSnapshot)) == snapshots


def test_concurrent_retries_share_one_source_and_snapshot(client, session_factory):
    request = body(client, session_factory)

    def submit(_index):
        return client.post("/api/v1/physical-model-csv/imports", json=request, headers=ACTOR)

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(submit, range(2)))
    assert sorted(response.status_code for response in responses) == [200, 201]
    assert responses[0].json()["sourceId"] == responses[1].json()["sourceId"]
    assert responses[0].json()["snapshot"]["snapshot"]["id"] == responses[1].json()["snapshot"]["snapshot"]["id"]
