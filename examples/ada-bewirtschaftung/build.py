"""Generate the proposed AdA metadata inventory and PostgreSQL DDL (stdlib only)."""
import argparse
import csv
import io
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACKAGED_CSV = HERE.parents[1] / "services/catalog-api/src/daca_catalog/fixtures/ada_bewirtschaftung.csv"
SCHEMA = "ada_bewirtschaftung"


def col(name, sql_type, description, *, pk=False, required=True, ref="", default="", values=""):
    return {"name": name, "type": sql_type, "description": description, "pk": pk,
            "required": required, "ref": ref, "default": default, "values": values}


def ident(name, description):
    return col(name, "uuid", description, pk=True)


def fk(name, table, target, description, *, required=True):
    return col(name, "uuid", description, ref=f"{table}.{target}", required=required)


TABLES = [
    ("militaergrad", "Militärgrad – beispielhafte Referenzwerte", [
        col("grad_code", "varchar(12)", "Gradabkürzung", pk=True),
        col("bezeichnung_de", "varchar(80)", "Deutsche Gradbezeichnung"),
        col("gradgruppe", "varchar(40)", "Gruppe für die Darstellung"),
        col("sortierung", "smallint", "Anzeigereihenfolge ab 1"),
    ], ["UNIQUE (sortierung)", "CHECK (sortierung >= 1)"]),
    ("personalstatus", "Administrativer Status – Demo-Werteliste", [
        col("status_code", "varchar(20)", "Administrativer Statuscode", pk=True),
        col("bezeichnung_de", "varchar(80)", "Bezeichnung des Status"),
        col("aktiv", "boolean", "Status für aktive Bewirtschaftung", default="true"),
    ], []),
    ("angehoeriger", "Angehörige der Armee – synthetische Personendaten", [
        ident("ada_id", "Interner technischer Personenschlüssel"),
        col("ada_nummer", "varchar(32)", "Synthetische Referenz, keine amtliche Personennummer"),
        col("vorname", "varchar(80)", "Vorname"),
        col("nachname", "varchar(80)", "Nachname"),
        col("geburtsdatum", "date", "Geburtsdatum"),
        col("korrespondenzsprache", "varchar(2)", "Gewünschte Sprache", values="de|fr|it|rm"),
        col("status_code", "varchar(20)", "Administrativer Status", ref="personalstatus.status_code"),
        col("erfasst_am", "timestamptz", "Zeitpunkt der Erfassung", default="CURRENT_TIMESTAMP"),
        col("geaendert_am", "timestamptz", "Letzte Änderung, durch die Anwendung zu pflegen", default="CURRENT_TIMESTAMP"),
    ], ["UNIQUE (ada_nummer)", "CHECK (geaendert_am >= erfasst_am)"]),
    ("organisationseinheit", "Organisationseinheit – fiktive administrative Hierarchie", [
        ident("org_id", "Technischer Organisationsschlüssel"),
        col("org_code", "varchar(30)", "Eindeutiger Organisationscode"),
        col("bezeichnung", "varchar(120)", "Bezeichnung der Organisationseinheit"),
        fk("parent_org_id", "organisationseinheit", "org_id", "Übergeordnete Einheit", required=False),
        col("gueltig_ab", "date", "Beginn der Gültigkeit"),
        col("gueltig_bis", "date", "Ende der Gültigkeit, einschliesslich", required=False),
    ], ["UNIQUE (org_code)", "CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_ab)",
        "CHECK (parent_org_id IS NULL OR parent_org_id <> org_id)"]),
    ("einteilung", "Zeitlicher Verlauf der Einteilungen und Funktionen", [
        ident("einteilung_id", "Technischer Einteilungsschlüssel"),
        fk("ada_id", "angehoeriger", "ada_id", "Eingeteilte Person"),
        fk("org_id", "organisationseinheit", "org_id", "Organisationseinheit der Einteilung"),
        col("funktion", "varchar(120)", "Administrative Funktionsbezeichnung"),
        col("gueltig_ab", "date", "Beginn der Einteilung"),
        col("gueltig_bis", "date", "Ende der Einteilung, einschliesslich", required=False),
    ], ["UNIQUE (ada_id, org_id, gueltig_ab)", "CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_ab)"]),
    ("gradverlauf", "Zeitlicher Verlauf der Militärgrade", [
        ident("gradverlauf_id", "Technischer Verlaufsschlüssel"),
        fk("ada_id", "angehoeriger", "ada_id", "Person mit diesem Grad"),
        col("grad_code", "varchar(12)", "Militärgrad", ref="militaergrad.grad_code"),
        col("gueltig_ab", "date", "Beginn der Gradzuordnung"),
        col("gueltig_bis", "date", "Ende der Gradzuordnung, einschliesslich", required=False),
    ], ["UNIQUE (ada_id, gueltig_ab)", "CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_ab)"]),
    ("dienstleistung", "Geplante Dienstleistungen – administrative Angaben", [
        ident("dienst_id", "Technischer Dienstleistungsschlüssel"),
        col("dienst_code", "varchar(30)", "Eindeutiger Dienstleistungscode"),
        col("dienst_art", "varchar(20)", "Beispielhafte Dienstleistungsart", values="RS|WK|KURS|ANDERE"),
        col("bezeichnung", "varchar(120)", "Bezeichnung der Dienstleistung"),
        fk("org_id", "organisationseinheit", "org_id", "Administrativ zuständige Einheit"),
        col("beginn", "date", "Geplanter Beginn"),
        col("ende", "date", "Geplantes Ende, einschliesslich"),
    ], ["UNIQUE (dienst_code)", "CHECK (ende >= beginn)"]),
    ("aufgebot", "Aufgebote von Personen zu Dienstleistungen", [
        ident("aufgebot_id", "Technischer Aufgebotsschlüssel"),
        fk("ada_id", "angehoeriger", "ada_id", "Aufgebotene Person"),
        fk("dienst_id", "dienstleistung", "dienst_id", "Aufgebotene Dienstleistung"),
        col("ausgestellt_am", "date", "Ausstellungsdatum", required=False),
        col("status", "varchar(20)", "Bearbeitungsstatus des Aufgebots", values="ENTWURF|VERSANDT|BESTAETIGT|ANNULLIERT"),
        col("erfasst_am", "timestamptz", "Zeitpunkt der Erfassung", default="CURRENT_TIMESTAMP"),
    ], ["UNIQUE (ada_id, dienst_id)", "CHECK (status = 'ENTWURF' OR ausgestellt_am IS NOT NULL)"]),
    ("dienstteilnahme", "Tatsächliche Teilnahme und erfasste Diensttage", [
        ident("teilnahme_id", "Technischer Teilnahmeschlüssel"),
        fk("aufgebot_id", "aufgebot", "aufgebot_id", "Zugehöriges Aufgebot"),
        col("eintritt", "date", "Tatsächlicher Eintritt", required=False),
        col("austritt", "date", "Tatsächlicher Austritt", required=False),
        col("diensttage", "integer", "Erfasste Tage, keine automatische gesetzliche Anrechnung", default="0"),
        col("status", "varchar(20)", "Status der Teilnahme", values="GEPLANT|EINGERUECKT|ABGESCHLOSSEN|NICHT_EINGERUECKT"),
    ], ["UNIQUE (aufgebot_id)", "CHECK (diensttage >= 0)",
        "CHECK (austritt IS NULL OR (eintritt IS NOT NULL AND austritt >= eintritt))",
        "CHECK (status NOT IN ('EINGERUECKT', 'ABGESCHLOSSEN') OR eintritt IS NOT NULL)",
        "CHECK (status <> 'ABGESCHLOSSEN' OR austritt IS NOT NULL)"]),
    ("qualifikationstyp", "Arten administrativ bewirtschafteter Qualifikationen", [
        col("qualifikation_code", "varchar(30)", "Qualifikationscode", pk=True),
        col("bezeichnung", "varchar(120)", "Bezeichnung der Qualifikation"),
        col("beschreibung", "varchar(500)", "Fachliche Beschreibung", required=False),
        col("gueltigkeits_monate", "smallint", "Vorgeschlagene Gültigkeitsdauer, falls zeitlich begrenzt", required=False),
    ], ["CHECK (gueltigkeits_monate IS NULL OR gueltigkeits_monate > 0)"]),
    ("qualifikation", "Erworbene Qualifikationen einer Person", [
        ident("qualifikation_id", "Technischer Qualifikationsschlüssel"),
        fk("ada_id", "angehoeriger", "ada_id", "Qualifizierte Person"),
        col("qualifikation_code", "varchar(30)", "Art der Qualifikation", ref="qualifikationstyp.qualifikation_code"),
        col("erworben_am", "date", "Datum des Erwerbs"),
        col("gueltig_bis", "date", "Gültig bis, einschliesslich", required=False),
        fk("dienst_id", "dienstleistung", "dienst_id", "Dienstleistung beim Erwerb, falls bekannt", required=False),
    ], ["UNIQUE (ada_id, qualifikation_code, erworben_am)", "CHECK (gueltig_bis IS NULL OR gueltig_bis >= erworben_am)"]),
]


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def render():
    csv_file = io.StringIO(newline="")
    writer = csv.writer(csv_file, delimiter=";", lineterminator="\n")
    writer.writerow(["Datenobjekt", "Tabelle", "Feldname", "Datentyp", "Länge", "Kurzbeschreibung", "Kommentar",
                     "System", "Klassifizierung", "Dezimalstellen", "Werteliste", "Primärschlüssel",
                     "Fremdschlüssel", "Null erlaubt", "Standardwert"])
    ddl = ["-- Proposed AdA administration example; synthetic data only. Generated by build.py.",
           "-- Run once in a dedicated empty example database. No catalog schema or access grants are changed.",
           "BEGIN;", f"CREATE SCHEMA {SCHEMA};"]
    comments = []
    indexes = []
    for table, description, columns, checks in TABLES:
        definitions = []
        for c in columns:
            base_type = c["type"].split("(")[0]
            length = c["type"].split("(")[1].rstrip(")") if "(" in c["type"] else ""
            ref = f'{SCHEMA}.{c["ref"]}' if c["ref"] else ""
            writer.writerow([description, table, c["name"], base_type, length, c["description"],
                             "Modellvorschlag; Constraints siehe schema.sql", "AdA Administration Demo",
                             "Intern" if table in ("militaergrad", "personalstatus", "qualifikationstyp", "organisationseinheit", "dienstleistung") else "Vertraulich",
                             "", c["values"], "Ja" if c["pk"] else "Nein", ref,
                             "Nein" if c["required"] else "Ja", c["default"]])
            definition = f'    {c["name"]} {c["type"]}'
            if c["pk"]:
                definition += " PRIMARY KEY"
            elif c["required"]:
                definition += " NOT NULL"
            if c["default"]:
                definition += " DEFAULT " + c["default"]
            if c["ref"]:
                target, key = c["ref"].split(".")
                definition += f" REFERENCES {SCHEMA}.{target} ({key}) ON DELETE RESTRICT"
                indexes.append(f'CREATE INDEX ix_{table}_{c["name"]} ON {SCHEMA}.{table} ({c["name"]});')
            if c["values"]:
                definition += f' CHECK ({c["name"]} IN ({", ".join(literal(v) for v in c["values"].split("|"))}))'
            definitions.append(definition)
            comments.append(f'COMMENT ON COLUMN {SCHEMA}.{table}.{c["name"]} IS {literal(c["description"])};')
        definitions.extend("    " + check for check in checks)
        ddl.append(f"CREATE TABLE {SCHEMA}.{table} (\n" + ",\n".join(definitions) + "\n);")
        comments.append(f"COMMENT ON TABLE {SCHEMA}.{table} IS {literal(description)};")
    ddl.extend(indexes + comments + ["COMMIT;", ""])
    return {"ada_bewirtschaftung.csv": csv_file.getvalue(), "schema.sql": "\n\n".join(ddl).rstrip() + "\n"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    artifacts = {HERE / name: content for name, content in render().items()}
    artifacts[PACKAGED_CSV] = artifacts[HERE / "ada_bewirtschaftung.csv"]
    for target, content in artifacts.items():
        if args.check:
            if not target.exists() or target.read_text(encoding="utf-8") != content:
                raise SystemExit(f"Out of date: {target}; run build.py")
        else:
            target.write_text(content, encoding="utf-8", newline="\n")
    print(f"AdA: {len(TABLES)} tables, {sum(len(t[2]) for t in TABLES)} fields; {'checked' if args.check else 'generated'}.")
