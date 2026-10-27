"""Validate generated files, CSV compatibility and PostgreSQL constraints in an isolated DB."""
import base64
import os

import psycopg
from build import HERE, TABLES, render
from daca_catalog.physical_csv import parse_inventory


def main():
    for name, content in render().items():
        assert (HERE / name).read_text(encoding="utf-8") == content, f"Regenerate {name}"
    parsed = parse_inventory(base64.b64encode((HERE / "ada_bewirtschaftung.csv").read_bytes()).decode())
    preview = parsed.preview()
    assert (preview["tableCount"], preview["fieldCount"], preview["rowCount"]) == (11, 62, 62)
    assert len(preview["warnings"]) == 1, preview["warnings"]  # CSV does not project nullability.
    assert all(c["normalizedDataType"] != "unknown" for t in preview["tables"] for c in t["columns"])
    references = {(table, c["name"]) for table, _, columns, _ in TABLES for c in columns}
    for table, _, columns, _ in TABLES:
        imported = next(t for t in parsed.tables if t["name"] == table)
        assert len(imported["columns"]) == len(columns)
        for column in imported["columns"]:
            original = column["importMetadata"]["records"][0]
            assert "Null erlaubt" in original and "Primärschlüssel" in original
        for c in columns:
            if c["ref"]:
                assert tuple(c["ref"].split(".")) in references, c["ref"]
    url = os.environ["ADA_MODEL_TEST_DATABASE_URL"]
    with psycopg.connect(url, autocommit=True) as connection:
        db = connection.execute("select current_database()").fetchone()[0]
        if db != "daca_ada_model_test":
            raise SystemExit("Use only the dedicated empty daca_ada_model_test database.")
        # No DROP or reset: an accidental rerun against populated storage fails safely.
        connection.execute((HERE / "schema.sql").read_text(encoding="utf-8"))
        connection.execute((HERE / "beispieldaten.sql").read_text(encoding="utf-8"))
        counts = dict(connection.execute("select table_name, (xpath('/row/n/text()', query_to_xml("
                      "format('select count(*) as n from ada_bewirtschaftung.%I', table_name), false, true, '')))[1]::text::int "
                      "from information_schema.tables where table_schema = 'ada_bewirtschaftung'").fetchall())
        assert len(counts) == 11 and counts["angehoeriger"] == 3 and all(counts.values()), counts
        cases = [
            ("UPDATE ada_bewirtschaftung.angehoeriger SET status_code='MISSING'", psycopg.errors.ForeignKeyViolation),
            ("UPDATE ada_bewirtschaftung.angehoeriger SET ada_nummer='DUPLICATE'", psycopg.errors.UniqueViolation),
            ("UPDATE ada_bewirtschaftung.dienstteilnahme SET diensttage=-1", psycopg.errors.CheckViolation),
            ("UPDATE ada_bewirtschaftung.dienstleistung SET ende=beginn-1", psycopg.errors.CheckViolation),
            ("UPDATE ada_bewirtschaftung.dienstteilnahme SET austritt=NULL WHERE status='ABGESCHLOSSEN'", psycopg.errors.CheckViolation),
            ("UPDATE ada_bewirtschaftung.aufgebot SET status='VERSANDT', ausgestellt_am=NULL", psycopg.errors.CheckViolation),
            ("UPDATE ada_bewirtschaftung.organisationseinheit SET parent_org_id=org_id", psycopg.errors.CheckViolation),
            ("UPDATE ada_bewirtschaftung.angehoeriger SET korrespondenzsprache='xx'", psycopg.errors.CheckViolation),
            ("DELETE FROM ada_bewirtschaftung.angehoeriger", psycopg.errors.RestrictViolation),
        ]
        for statement, expected_error in cases:
            try:
                with connection.transaction():
                    connection.execute(statement)
                    raise AssertionError(f"Constraint missing: {statement}")
            except expected_error:
                pass
        assert connection.execute("select count(*) from ada_bewirtschaftung.angehoeriger").fetchone()[0] == 3
    print(f"PASS: 11 tables / 62 fields, CSV originals, synthetic rows {counts}, {len(cases)} constraint checks.")


if __name__ == "__main__":
    main()
