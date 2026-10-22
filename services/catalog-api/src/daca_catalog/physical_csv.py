"""Read uploaded structure inventories as metadata, never as executable instructions or data rows."""
from __future__ import annotations

import base64
import binascii
import csv
import io
from dataclasses import dataclass
from typing import Any

from .modeling_core import canonical_hash, normalize_postgresql_type

MAX_CSV_BYTES = 2 * 1024 * 1024
SAP_IFC_TYPES = {
    "char": "string", "numc": "string", "unit": "string", "clnt": "string",
    "lang": "string", "string": "string", "dats": "date", "tims": "time",
    "dec": "decimal", "quan": "decimal", "curr": "decimal", "fltp": "decimal",
    "int1": "integer", "int2": "integer", "int4": "integer", "int8": "integer",
    "smallinteger": "integer", "ifclabel": "string", "ifctext": "string",
    "ifcidentifier": "string", "ifcdate": "date", "ifcdatetime": "datetime",
    "ifclengthmeasure": "decimal", "ifcreal": "decimal", "ifcinteger": "integer",
    # IFC Logical has TRUE, FALSE and UNKNOWN: retain its ternary semantics.
    "ifclogical": "ifclogical", "ifcboolean": "boolean",
}


def _numeric(record: dict[str, str], header: str, line: int) -> int | None:
    value = record.get(header, "").strip()
    if not value:
        return None
    if not value.isascii() or not value.isdecimal() or len(value) > 7 or int(value) > 1000000:
        raise ValueError(f"CSV-Zeile {line}: {header} muss eine nicht negative Ganzzahl bis 1'000'000 sein.")
    return int(value)


@dataclass
class CsvInventory:
    metadata: dict[str, Any]
    tables: list[dict[str, Any]]
    warnings: list[str]
    encoding: str
    row_count: int

    @property
    def fingerprint(self) -> str:
        return canonical_hash(self.metadata)

    def inspect(self, *, variant: str | None = None) -> dict[str, Any]:
        return self.metadata

    def preview(self) -> dict[str, Any]:
        return {
            "fingerprint": self.fingerprint, "encoding": self.encoding,
            "rowCount": self.row_count, "tableCount": len(self.tables),
            "fieldCount": sum(len(table["columns"]) for table in self.tables),
            "warnings": self.warnings, "tables": self.tables,
        }


def parse_inventory(content_base64: str) -> CsvInventory:
    try:
        data = base64.b64decode(content_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("Die Datei konnte nicht gelesen werden (ungültige Dateikodierung).") from exc
    if not data or len(data) > MAX_CSV_BYTES:
        raise ValueError("Bitte eine nicht leere CSV-Datei mit höchstens 2 MiB auswählen.")
    encoding = "UTF-8"
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        encoding = "Windows-1252"
        try:
            text = data.decode("cp1252")
        except UnicodeDecodeError as exc:
            raise ValueError("Die CSV-Datei muss UTF-8 oder Windows-1252 verwenden.") from exc
    if "\x00" in text:
        raise ValueError("Die Datei enthält Nullzeichen und ist keine unterstützte CSV-Datei.")
    # Excel inventories can contain CRCRLF record separators. Universal newlines also
    # support quoted multiline descriptions, without guessing delimiters inside them.
    reader = csv.reader(io.StringIO(text, newline=None), delimiter=";", strict=True)
    try:
        headers = next(reader)
        if len(headers) > 40 or len(headers) != len(set(headers)) or any(not h.strip() for h in headers):
            raise ValueError("Die CSV-Kopfzeile enthält leere oder doppelte Spaltennamen.")
        if not {"Tabelle", "Feldname", "Datentyp"}.issubset(headers):
            raise ValueError("Erforderliche CSV-Spalten: Tabelle;Feldname;Datentyp (Trennzeichen: Semikolon).")
        databases: dict[str, dict[str, Any]] = {}
        tables: dict[tuple[str, str], dict[str, Any]] = {}
        fields: dict[tuple[str, str, str], dict[str, Any]] = {}
        warnings: list[str] = []
        row_count = 0
        for values in reader:
            if not values or not any(v.strip() for v in values):
                continue
            row_count += 1
            if row_count > 10000:
                raise ValueError("Höchstens 10'000 Metadatenzeilen sind pro Import erlaubt.")
            if len(values) != len(headers) or any(len(v) > 8000 for v in values):
                raise ValueError(f"CSV-Zeile {reader.line_num}: falsche Spaltenzahl oder zu langer Wert.")
            record = dict(zip(headers, values, strict=True))
            system = record.get("System", "").strip() or "CSV"
            table_name = record["Tabelle"].strip()
            field_name = record["Feldname"].strip()
            raw_type = record["Datentyp"].strip()
            if not table_name or max(len(system), len(table_name), len(field_name), len(raw_type)) > 255:
                raise ValueError(f"CSV-Zeile {reader.line_num}: Tabellenname fehlt oder Name/Typ ist länger als 255 Zeichen.")
            key = (system, table_name)
            if key not in tables:
                if len(tables) >= 500:
                    raise ValueError("Höchstens 500 Tabellen sind pro Import erlaubt.")
                database = databases.setdefault(system, {"name": system, "schemas": [{"name": "CSV", "tables": []}]})
                table = {"name": table_name, "system": system, "kind": "table", "columns": [],
                         "schemaConfidence": "declared", "comment": record.get("Datenobjekt") or None,
                         "importMetadata": {"format": "daca-structure-csv-v1", "recordsWithoutField": []}}
                # Structured keys avoid ambiguity between literal dots in names.
                table["stableKey"] = "csv:" + canonical_hash([system, table_name])
                tables[key] = table
                database["schemas"][0]["tables"].append(table)
            table = tables[key]
            if not field_name:
                table["importMetadata"]["recordsWithoutField"].append(record)
                warnings.append(f"{system} / {table_name}: Eintrag ohne Feldnamen als Tabellenhinweis erhalten.")
                continue
            normalized_type = SAP_IFC_TYPES.get(raw_type.casefold(), normalize_postgresql_type(raw_type)) if raw_type else "unknown"
            if not raw_type:
                warnings.append(f"{system} / {table_name}.{field_name}: Datentyp fehlt; als unbekannt erfasst.")

            length, scale = _numeric(record, "Länge", reader.line_num), _numeric(record, "Dezimalstellen", reader.line_num)
            # Source lengths/scales can mean storage bytes or contain inconsistent
            # declarations (e.g. Integer, length 4, scale 10). Preserve originals;
            # only project unambiguous string lengths into normalized constraints.
            column = {"name": field_name, "dataType": raw_type or "unknown",
                      "normalizedDataType": normalized_type,
                      "characterLength": length if normalized_type == "string" else None,
                      "nullable": True, "ordinalPosition": len(table["columns"]) + 1,
                      "comment": "\n".join(v for v in [record.get("Kurzbeschreibung", ""), record.get("Kommentar", "")] if v) or None,
                      "stableKey": table["stableKey"] + ":" + canonical_hash(field_name),
                      "importMetadata": {"format": "daca-structure-csv-v1", "nullabilityKnown": False, "records": [record]}}
            if normalized_type == "decimal" and scale is not None:
                column["numericScale"] = scale
            field_key = (*key, field_name)
            previous = fields.get(field_key)
            if previous:
                original = previous["importMetadata"]["records"][0]
                if any(original.get(h, "") != record.get(h, "") for h in ("Datentyp", "Länge", "Dezimalstellen")):
                    raise ValueError(f"{system} / {table_name}.{field_name}: doppelte Felddefinition mit widersprüchlichen Typen oder Längen.")
                previous["importMetadata"]["records"].append(record)
                if column["comment"] and column["comment"] != previous["comment"]:
                    previous["comment"] = "\n".join(filter(None, [previous["comment"], column["comment"]]))
                warnings.append(f"{system} / {table_name}.{field_name}: doppeltes Feld zusammengeführt; alle Originalbeschreibungen erhalten.")
            else:
                fields[field_key] = column
                table["columns"].append(column)
        if not tables:
            raise ValueError("Die CSV-Datei enthält keine Tabellen.")
        warnings.insert(0, "Nullability ist im CSV nicht angegeben. Längen und Dezimalstellen bleiben als Originalangaben erhalten; sie werden nicht als verifizierte Datenbankpräzision interpretiert.")
        return CsvInventory({"databases": list(databases.values())}, list(tables.values()), warnings, encoding, row_count)
    except (csv.Error, StopIteration) as exc:
        raise ValueError(f"Ungültige CSV-Struktur bei Zeile {reader.line_num}: {exc}") from exc
